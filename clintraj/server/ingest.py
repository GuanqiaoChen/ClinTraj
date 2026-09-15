"""Repeatable local ingestion. Network fetches contain public source IDs only."""
import argparse
import csv
import hashlib
import io
import json
import re
from pathlib import Path

import httpx
from defusedxml import ElementTree as ET
from sqlalchemy import func, select

from clintraj.data.excel_loader import GOLDEN_CASE_HASHES, load_workbook

from .config import settings
from .db import HistoricalCase, KnowledgeChunk, KnowledgeSource, db_session
from .knowledge import embeddings, graph_driver, lexical_text, setup_graph, sync_chunks


def digest(data: bytes | str) -> str:
    return hashlib.sha256(data.encode() if isinstance(data, str) else data).hexdigest()


def download(url: str, filename: str) -> Path:
    root = Path("/knowledge") if Path("/knowledge").is_dir() else Path("outputs/knowledge")
    root.mkdir(parents=True, exist_ok=True)
    path = root / filename
    if not path.exists():
        with httpx.Client(follow_redirects=True, timeout=90) as client:
            response = client.get(url)
            response.raise_for_status()
        path.write_bytes(response.content)
    return path


def put_source(*, name: str, corpus: str, version: str, citation: str, license: str,
               raw: bytes, chunks: list[dict], metadata: dict | None = None) -> str:
    source_id = name.lower().replace(" ", "-") + "-" + digest(raw)[:16]
    with db_session() as db:
        source = db.get(KnowledgeSource, source_id)
        if source is None:
            db.add(KnowledgeSource(id=source_id, corpus=corpus, title=name, version=version,
                citation=citation, license=license, content_sha256=digest(raw),
                metadata_json={**(metadata or {}), "embedding_model": settings().embedding_model}))
            db.commit()
        elif source.metadata_json.get("embedding_model") != settings().embedding_model:
            raise ValueError("Embedding model changed; use a fresh knowledge store or explicit reindex")
        existing = set(db.scalars(select(KnowledgeChunk.id).where(KnowledgeChunk.source_id == source_id)))
    rows = [{**c, "id": source_id + ":" + str(c["key"]), "source_id": source_id,
             "corpus": corpus} for c in chunks]
    missing = [c for c in rows if c["id"] not in existing]
    for offset in range(0, len(missing), 64):
        batch = missing[offset:offset + 64]
        vectors = embeddings([c["text"] for c in batch])
        with db_session() as db:
            for c, vector in zip(batch, vectors, strict=True):
                db.add(KnowledgeChunk(id=c["id"], source_id=source_id, corpus=corpus,
                    document_id=c["document_id"], text=c["text"], concept_ids=c.get("concept_ids", []),
                    content_sha256=digest(c["text"]), embedding=vector,
                    search_vector=func.to_tsvector("simple", lexical_text(c["text"])),
                    metadata_json=c.get("metadata", {})))
            db.commit()
    # Always repair the graph projection, including after a previously interrupted import.
    for offset in range(0, len(rows), 256):
        sync_chunks([{**r, "concept_ids": r.get("concept_ids", [])} for r in rows[offset:offset + 256]])
    print(json.dumps({"source": name, "version": version, "chunks": len(rows), "new": len(missing)}), flush=True)
    return source_id


def parse_hpo(raw: str) -> tuple[str, list[dict]]:
    version_match = re.search(r"^data-version:\s*(.+)$", raw, re.M)
    if not version_match:
        raise ValueError("HPO release version is missing")
    terms = []
    for block in raw.split("[Term]")[1:]:
        fields: dict[str, list[str]] = {}
        for line in block.splitlines():
            if ": " in line:
                key, value = line.split(": ", 1)
                fields.setdefault(key, []).append(value)
        if fields.get("is_obsolete") == ["true"] or "id" not in fields or "name" not in fields:
            continue
        cid, name = fields["id"][0], fields["name"][0]
        text = name + "\n" + "\n".join(fields.get("def", []) + fields.get("synonym", []))
        terms.append({"key": cid, "document_id": cid, "text": text.strip(),
            "concept_ids": [cid], "metadata": {"kind": "terminology", "name": name,
                "parents": [p.split()[0] for p in fields.get("is_a", [])]}})
    return version_match[1].strip(), terms


def ingest_hpo(path: Path, *, seed_subset: bool = False):
    raw = path.read_bytes()
    version, terms = parse_hpo(raw.decode("utf-8-sig"))
    if seed_subset:
        wanted = {"HP:0002615", "HP:0001250", "HP:0001252", "HP:0002090", "HP:0001945",
                  "HP:0002013", "HP:0002014", "HP:0002027", "HP:0000822", "HP:0000716",
                  "HP:0002094", "HP:0001635", "HP:0002140", "HP:0002240", "HP:0006536",
                  "HP:0001892", "HP:0000790", "HP:0000025", "HP:0001410", "HP:0002664"}
        by_id = {t["key"]: t for t in terms}
        for _ in range(12):
            parents = {p for cid in list(wanted) if cid in by_id for p in by_id[cid]["metadata"]["parents"]}
            if parents <= wanted:
                break
            wanted |= parents
        terms = [t for t in terms if t["key"] in wanted]
    sid = put_source(name="Human Phenotype Ontology" + (" starter subset" if seed_subset else ""),
        corpus="public", version=version, citation="https://hpo.jax.org/",
        license="HPO license: https://human-phenotype-ontology.github.io/license.html",
        raw=raw, chunks=terms, metadata={"subset": seed_subset, "source_url": "https://purl.obolibrary.org/obo/hp.obo"})
    with graph_driver().session() as graph:
        graph.run("""UNWIND $rows AS row UNWIND row.metadata.parents AS parent
            MERGE (c:Concept {id:row.key}) MERGE (p:Concept {id:parent})
            MERGE (c)-[r:IS_A {source_id:$source}]->(p)""", rows=terms, source=sid).consume()


def parse_pmc(raw: bytes, pmcid: str) -> tuple[str, str, list[dict]]:
    root = ET.fromstring(raw)
    permissions = root.find(".//permissions")
    if permissions is None:
        raise ValueError("PMC article has no explicit license")
    license_text = ET.tostring(permissions, encoding="unicode").lower()
    # Only licenses that permit redistribution and adaptation in any use.
    if "creativecommons.org/licenses/by/" not in license_text and "creativecommons.org/publicdomain/zero/" not in license_text:
        raise ValueError("PMC article license is not on the CC-BY/CC0 allowlist")
    title = " ".join(root.findtext(".//article-title", default=pmcid).split())
    chunks = []
    for index, paragraph in enumerate(root.findall(".//body//p")):
        text = " ".join("".join(paragraph.itertext()).split())
        if len(text) < 60:
            continue
        for offset in range(0, len(text), 1600):
            chunks.append({"key": f"{pmcid}:p{index}:{offset}", "document_id": pmcid,
                "text": text[offset:offset + 1600], "concept_ids": [pmcid],
                "metadata": {"kind": "article", "paragraph": index, "offset": offset}})
    if not chunks:
        raise ValueError("No PMC article body paragraphs found")
    return title, ET.tostring(permissions, encoding="unicode"), chunks


def ingest_pmc(pmcid: str, path: Path | None = None):
    if not re.fullmatch(r"PMC\d+", pmcid):
        raise ValueError("Expected a PMC accession")
    # Europe PMC serves fullTextXML only for its Open Access subset.
    path = path or download(f"https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid}/fullTextXML", pmcid + ".xml")
    raw = path.read_bytes()
    title, license_text, chunks = parse_pmc(raw, pmcid)
    put_source(name=f"PMC OA {pmcid}: {title}", corpus="public", version=digest(raw),
        citation=f"https://pmc.ncbi.nlm.nih.gov/articles/{pmcid}/", license=license_text,
        raw=raw, chunks=chunks, metadata={"pmcid": pmcid, "retrieval_route": "Europe PMC fullTextXML"})


def ingest_loinc(path: Path, version: str, license_path: Path):
    raw = path.read_bytes()
    chunks = []
    for row in csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))):
        if not row.get("LOINC_NUM") or not row.get("LONG_COMMON_NAME"):
            raise ValueError("Expected official LOINC.csv columns")
        cid = "LOINC:" + row["LOINC_NUM"]
        chunks.append({"key": cid, "document_id": cid, "text": row["LONG_COMMON_NAME"],
            "concept_ids": [cid], "metadata": {"kind": "terminology", "status": row.get("STATUS")}})
    put_source(name="LOINC", corpus="public", version=version, citation="https://loinc.org/",
        license=license_path.read_text(encoding="utf-8-sig"), raw=raw, chunks=chunks)


def ingest_rxnorm(path: Path, version: str):
    raw, chunks = path.read_bytes(), []
    seen = set()
    for row in csv.reader(io.StringIO(raw.decode("utf-8-sig")), delimiter="|"):
        if len(row) < 17:
            raise ValueError("Expected official RXNCONSO.RRF format")
        if row[11] != "RXNORM" or row[1] != "ENG" or row[16] != "N" or row[0] in seen:
            continue
        seen.add(row[0])
        cid = "RXNORM:" + row[0]
        chunks.append({"key": cid, "document_id": cid, "text": row[14], "concept_ids": [cid],
                       "metadata": {"kind": "terminology", "tty": row[12]}})
    put_source(name="RxNorm core SAB=RXNORM", corpus="public", version=version,
        citation="https://www.nlm.nih.gov/research/umls/rxnorm/overview.html",
        license="NLM RxNorm core/current prescribable content; non-RXNORM vocabularies excluded",
        raw=raw, chunks=chunks)


def ingest_workbook(path: Path):
    dataset = load_workbook(path)
    reviews = {(r.case_id, r.step_id): r for r in dataset.reviews}
    chunks, cases = [], []
    for graph in dataset.graphs:
        case_id = digest(graph.case_id)
        safe_graph = graph.model_dump(mode="json")
        for node in safe_graph["nodes"]:
            node["case_id"] = case_id
        complete = all(reviews[(graph.case_id, n.step_id)].is_complete for n in graph.nodes)
        status = "reviewed" if complete else "review_incomplete"
        cases.append({"id": case_id, "graph": safe_graph, "review_status": status})
        for node in graph.ordered_nodes():
            review = reviews[(graph.case_id, node.step_id)]
            chunks.append({"key": f"{case_id}:{node.step_id}", "document_id": case_id,
                "text": "\n".join((node.new_evidence, node.action, node.clinical_rationale)),
                "concept_ids": ["ACTION:" + node.action_type.value],
                "metadata": {"kind": "historical_case", "step_id": node.step_id,
                    "review_status": status, "source_row": review.source_row,
                    "review": review.model_dump(mode="json", exclude={"case_id"}),
                    "golden": case_id in GOLDEN_CASE_HASHES}})
    sid = put_source(name="Local clinician-review workbook", corpus="historical",
        version=dataset.report.workbook_sha256, citation="local:clinician-review-workbook",
        license="Private local clinical data; no redistribution", raw=path.read_bytes(), chunks=chunks,
        metadata={"case_count": len(cases), "reviewed_nodes": dataset.report.reviewed_node_count,
                  "temporal_basis": dataset.report.temporal_basis})
    with db_session() as db:
        for case in cases:
            db.merge(HistoricalCase(**case, source_id=sid, is_synthetic=False))
        db.commit()
    for case in cases:
        project_case(sid, case)


def project_case(source_id: str, case: dict):
    cid = source_id + ":" + case["id"]
    nodes = [{"id": cid + ":" + str(n["step_id"]), "step": n["step_id"],
              "action_type": n["action_type"]} for n in case["graph"]["nodes"]]
    edges = [{"parent": cid + ":" + str(e["parent_step_id"]),
              "child": cid + ":" + str(e["child_step_id"]), "relation": e["relation"]}
             for e in case["graph"]["edges"] if e["parent_step_id"] is not None]
    with graph_driver().session() as graph:
        graph.run("""MERGE (c:Case {id:$cid}) SET c.review_status=$status
            WITH c UNWIND $nodes AS row
            MERGE (d:Decision {id:row.id}) SET d.step=row.step
            MERGE (c)-[:HAS_DECISION]->(d)
            MERGE (e:Evidence {id:row.id+':e'}) MERGE (e)-[:INFORMS]->(d)
            MERGE (p:Problem {id:$cid+':unannotated'}) SET p.annotation_status='unannotated'
            MERGE (e)-[:RELATES_TO]->(p) MERGE (p)-[:CONSIDERED_AT]->(d)
            MERGE (a:Action {id:row.id+':a'}) SET a.type=row.action_type
            MERGE (d)-[:PROPOSES]->(a)
            WITH d,row MATCH (chunk:Chunk {id:row.id}) MERGE (chunk)-[:DESCRIBES]->(d)""",
            cid=cid, nodes=nodes, status=case["review_status"]).consume()
        graph.run("""UNWIND $edges AS row
            MATCH (a:Decision {id:row.parent}), (b:Decision {id:row.child})
            MERGE (a)-[r:NEXT]->(b) SET r.relation=row.relation
            WITH a,b MATCH (a)-[:PROPOSES]->(act:Action), (e:Evidence)-[:INFORMS]->(b)
            MERGE (act)-[:FOLLOWED_BY]->(e)""", edges=edges).consume()


SYNTHETIC_CASES = [
    {"id": "synthetic-neurology", "title": "New focal neurological concern",
     "text": "Synthetic adult with a new unilateral arm weakness noticed today. Onset time is uncertain. No imaging or laboratory results are available. Current vitals have not been entered.",
     "problem": "New focal neurological concern", "owner": "primary_team"},
    {"id": "synthetic-pulmonary", "title": "Fever and respiratory symptoms",
     "text": "Synthetic adult with fever and cough for two days. No measured oxygen saturation, respiratory rate or chest imaging is available. Current medication list and allergies need confirmation.",
     "problem": "Fever and respiratory symptoms", "owner": "primary_team"},
    {"id": "synthetic-urology", "title": "Urinary symptoms and fever",
     "text": "Synthetic adult with dysuria and fever. No urinalysis, culture or renal function results yet. Hemodynamic stability has not been established.",
     "problem": "Urinary symptoms and fever", "owner": "primary_team"},
    {"id": "synthetic-breast", "title": "Breast lump assessment",
     "text": "Synthetic adult reports a new breast lump. No imaging or tissue diagnosis is available. Duration, associated symptoms and family history are unknown.",
     "problem": "Breast lump", "owner": "primary_team"},
    {"id": "synthetic-gi", "title": "Persistent abdominal discomfort",
     "text": "Synthetic adult reports intermittent abdominal discomfort. No examination, blood tests or imaging are available. Duration, bowel symptoms, bleeding and vital signs need clarification.",
     "problem": "Abdominal discomfort", "owner": "primary_team"},
]


def seed():
    setup_graph()
    hpo = download("https://raw.githubusercontent.com/obophenotype/human-phenotype-ontology/master/hp.obo", "hp.obo")
    ingest_hpo(hpo, seed_subset=True)
    ingest_pmc("PMC11907869")
    from .medical_graph import seed_medical_relations
    seed_medical_relations()
    raw = json.dumps(SYNTHETIC_CASES, sort_keys=True).encode()
    chunks = [{"key": case["id"], "document_id": case["id"], "text": case["text"] +
        " Historical synthetic process example: clarify available history and bedside observations before selecting tests. No outcome or diagnosis is asserted.",
        "concept_ids": ["ACTION:ASK_HISTORY"], "metadata": {"kind": "synthetic_case", "review_status": "synthetic_unvalidated"}}
        for case in SYNTHETIC_CASES]
    put_source(name="ClinTraj synthetic workflow cases", corpus="synthetic_history", version="1",
               citation="local:synthetic-workflow-cases", license="Repository-authored synthetic content",
               raw=raw, chunks=chunks)
    path = Path(settings().source_workbook)
    if path.is_file():
        ingest_workbook(path)
    else:
        print(json.dumps({"workbook": "absent", "synthetic_cases": len(SYNTHETIC_CASES)}))


def reindex():
    """Atomically replace vectors per source, for an operator-selected 384D encoder."""
    with db_session() as db:
        source_ids = list(db.scalars(select(KnowledgeSource.id)))
    for source_id in source_ids:
        with db_session() as db:
            source = db.get(KnowledgeSource, source_id)
            rows = list(db.scalars(select(KnowledgeChunk).where(KnowledgeChunk.source_id == source_id).order_by(KnowledgeChunk.id)))
            for offset in range(0, len(rows), 64):
                batch = rows[offset:offset + 64]
                vectors = embeddings([row.text for row in batch])
                for row, vector in zip(batch, vectors, strict=True):
                    row.embedding = vector
                    row.search_vector = func.to_tsvector("simple", lexical_text(row.text))
            source.metadata_json = {**source.metadata_json, "embedding_model": settings().embedding_model}
            db.commit()
            print(json.dumps({"reindexed": len(rows), "source": source.title}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("seed")
    sub.add_parser("reindex")
    for name in ("hpo", "workbook", "loinc", "rxnorm", "mimic", "medical-kg"):
        command = sub.add_parser(name)
        command.add_argument("path", type=Path)
        if name in {"loinc", "rxnorm", "mimic"}:
            command.add_argument("--version", required=True)
        if name in {"loinc", "mimic"}:
            command.add_argument("--license-ack", action="store_true", required=True)
        if name == "loinc":
            command.add_argument("--license-file", type=Path, required=True)
        if name == "mimic":
            command.add_argument("--offset", type=int, default=0)
            command.add_argument("--max-admissions", type=int, default=1000)
    pmc = sub.add_parser("pmc")
    pmc.add_argument("pmcid")
    pmc.add_argument("--path", type=Path)
    args = parser.parse_args()
    setup_graph()
    if args.command == "seed":
        seed()
    elif args.command == "reindex":
        reindex()
    elif args.command == "hpo":
        ingest_hpo(args.path)
    elif args.command == "pmc":
        ingest_pmc(args.pmcid, args.path)
    elif args.command == "workbook":
        ingest_workbook(args.path)
    elif args.command == "loinc":
        ingest_loinc(args.path, args.version, args.license_file)
    elif args.command == "rxnorm":
        ingest_rxnorm(args.path, args.version)
    elif args.command == "mimic":
        from .mimic import ingest_mimic
        ingest_mimic(args.path, args.version, offset=args.offset, max_admissions=args.max_admissions)
    elif args.command == "medical-kg":
        from .medical_graph import import_manifest
        print(json.dumps({"medical_relationships": import_manifest(args.path)}))


if __name__ == "__main__":
    main()
