"""PostgreSQL FTS + learned local dense embeddings + Neo4j traversal, RRF fusion."""
import hashlib
import re
from collections import defaultdict
from functools import lru_cache

from neo4j import GraphDatabase
from pydantic import Field
from sqlalchemy import func, select

from clintraj.domain.schemas import StrictModel

from .config import settings
from .db import KnowledgeChunk, KnowledgeSource, db_session


class RetrievedEvidence(StrictModel):
    citation_id: str
    source_id: str
    source: str
    version: str
    citation: str
    license: str
    document_id: str
    chunk_id: str
    concept_ids: tuple[str, ...]
    content_sha256: str
    text: str
    corpus: str
    kind: str
    score: float
    channels: tuple[str, ...]
    review_status: str | None = None
    medical_relations: tuple[dict, ...] = ()


class EvidenceBundle(StrictModel):
    public: tuple[RetrievedEvidence, ...] = ()
    historical: tuple[RetrievedEvidence, ...] = ()
    channels: dict[str, int] = Field(default_factory=dict)
    embedding_model: str
    limitations: tuple[str, ...] = ()

    @property
    def items(self):
        return self.public + self.historical


@lru_cache
def embedder():
    from fastembed import TextEmbedding
    cfg = settings()
    return TextEmbedding(model_name=cfg.embedding_model, cache_dir=cfg.embedding_cache,
                         threads=cfg.embedding_threads)


def embeddings(texts: list[str]) -> list[list[float]]:
    vectors = [vector.tolist() for vector in embedder().embed(texts, batch_size=32)]
    if any(len(vector) != 384 for vector in vectors):
        raise ValueError("Embedding dimension must match the 384-dimension migration")
    return vectors


def lexical_text(value: str) -> str:
    # PostgreSQL's simple dictionary does not segment Chinese. Add CJK bigrams for FTS.
    bigrams = [part[i:i + 2] for part in re.findall(r"[\u3400-\u9fff]+", value) for i in range(len(part) - 1)]
    return value + " " + " ".join(bigrams)


def lexical_query_text(value: str) -> str:
    stop = {"the", "and", "with", "for", "from", "that", "this", "are", "has", "patient", "synthetic", "available"}
    tokens = list(dict.fromkeys(t.lower() for t in re.findall(r"[a-zA-Z]{3,}|[\u3400-\u9fff]{2}", lexical_text(value)) if t.lower() not in stop))
    return " OR ".join(tokens[:80])


@lru_cache
def graph_driver():
    cfg = settings()
    return GraphDatabase.driver(cfg.neo4j_uri,
        auth=(cfg.neo4j_user, cfg.neo4j_password.get_secret_value()))


def setup_graph():
    with graph_driver().session() as graph:
        for label in ("Chunk", "Concept", "Case", "Decision", "Evidence", "Problem", "Action"):
            graph.run(f"CREATE CONSTRAINT {label.lower()}_id IF NOT EXISTS "
                      f"FOR (n:{label}) REQUIRE n.id IS UNIQUE").consume()


def sync_chunks(chunks: list[dict]):
    # Graph projections carry IDs and relations; patient narratives remain in Postgres.
    with graph_driver().session() as graph:
        graph.run("""UNWIND $rows AS row
            MERGE (c:Chunk {id: row.id}) SET c.corpus=row.corpus, c.source_id=row.source_id
            WITH c,row UNWIND row.concept_ids AS cid
            MERGE (concept:Concept {id:cid}) MERGE (c)-[:MENTIONS]->(concept)""", rows=chunks).consume()


def rrf(rankings: dict[str, list[str]]) -> tuple[dict, dict]:
    scores: dict[str, float] = defaultdict(float)
    channels: dict[str, list[str]] = defaultdict(list)
    for channel, ids in rankings.items():
        for rank, item in enumerate(dict.fromkeys(ids), start=1):
            scores[item] += 1 / (60 + rank)
            channels[item].append(channel)
    return dict(scores), dict(channels)


class HybridRetriever:
    def retrieve_bundle(self, query: str, *, allow_private: bool,
                        exclude_document_ids: tuple[str, ...] = (), limit: int = 6) -> EvidenceBundle:
        vector = embeddings([query])[0]
        corpora = ["public", "synthetic_history"]
        if allow_private:
            corpora += ["historical", "private_mimic"]
        with db_session() as db:
            filters = [KnowledgeChunk.corpus.in_(corpora)]
            if exclude_document_ids:
                filters.append(KnowledgeChunk.document_id.not_in(exclude_document_ids))
            lexical_query = func.websearch_to_tsquery("simple", lexical_query_text(query))
            lexical, dense = [], []
            # Search each knowledge layer independently before fusion. A larger public
            # corpus must not eliminate the separate similar-case retrieval channel.
            for corpus_group in (["public"], [c for c in corpora if c != "public"]):
                layer = [*filters, KnowledgeChunk.corpus.in_(corpus_group)]
                lexical += list(db.scalars(select(KnowledgeChunk.id).where(*layer,
                    KnowledgeChunk.search_vector.op("@@")(lexical_query)).order_by(
                        func.ts_rank_cd(KnowledgeChunk.search_vector, lexical_query).desc()).limit(16)))
                dense += list(db.scalars(select(KnowledgeChunk.id).where(*layer).order_by(
                    KnowledgeChunk.embedding.cosine_distance(vector)).limit(16)))
            medical_relations: dict[str, list] = defaultdict(list)
            with graph_driver().session() as graph:
                result = graph.run("""MATCH (seed:Chunk) WHERE seed.id IN $seeds
                    MATCH (seed)-[:MENTIONS]->(:Concept)-[:IS_A*0..1]-(concept:Concept)
                    MATCH (hit:Chunk)-[:MENTIONS]->(concept)
                    WHERE hit.corpus IN $corpora
                    RETURN hit.id AS id, count(*) AS overlap ORDER BY overlap DESC, id LIMIT 24""",
                    seeds=list(dict.fromkeys(lexical[:8] + dense[:8])), corpora=corpora)
                graph_ids = [r["id"] for r in result]
                traversal = graph.run("""MATCH (c:Chunk)-[:DESCRIBES]->(d:Decision)
                    WHERE c.id IN $seeds
                    MATCH (d)-[:NEXT*1..2]->(next:Decision)<-[:DESCRIBES]-(hit:Chunk)
                    WHERE hit.corpus IN $corpora RETURN DISTINCT hit.id AS id LIMIT 12""",
                    seeds=dense[:8], corpora=corpora)
                graph_ids += [r["id"] for r in traversal]
                assertions = graph.run("""MATCH (seed:Chunk)-[:MENTIONS]->(concept:Concept)
                    WHERE seed.id IN $seeds
                    MATCH (a:MedicalAssertion)-[:SUBJECT|OBJECT]->(concept)
                    MATCH (a)-[:SUPPORTED_BY]->(hit:Chunk), (a)-[:SUBJECT]->(head:Concept), (a)-[:OBJECT]->(tail:Concept)
                    RETURN DISTINCT hit.id AS id, a.relation AS relation, a.applicability AS applicability,
                        head.id AS head, tail.id AS tail, a.source_excerpt AS excerpt LIMIT 24""",
                    seeds=list(dict.fromkeys(lexical[:8] + dense[:8])))
                for record in assertions:
                    graph_ids.append(record["id"])
                    medical_relations[record["id"]].append({key: record[key] for key in ("relation", "applicability", "head", "tail", "excerpt")})
            rankings = {"lexical": lexical, "dense": dense, "graph": graph_ids}
            scores, channels = rrf(rankings)
            rows = db.execute(select(KnowledgeChunk, KnowledgeSource).join(KnowledgeSource).where(
                *filters, KnowledgeChunk.id.in_(scores))).all()
            output = []
            for chunk, source in rows:
                if source.metadata_json.get("embedding_model") != settings().embedding_model:
                    raise ValueError("Knowledge embedding model differs; reimport into a fresh store")
                if hashlib.sha256(chunk.text.encode()).hexdigest() != chunk.content_sha256:
                    raise ValueError("Knowledge content hash mismatch")
                output.append(RetrievedEvidence(citation_id=chunk.id, source_id=source.id,
                    source=source.title, version=source.version, citation=source.citation,
                    license=source.license, document_id=chunk.document_id, chunk_id=chunk.id,
                    concept_ids=tuple(chunk.concept_ids), content_sha256=chunk.content_sha256,
                    text=chunk.text, corpus=chunk.corpus, kind=chunk.metadata_json.get("kind", "terminology"),
                    score=scores[chunk.id], channels=tuple(channels[chunk.id]),
                    review_status=chunk.metadata_json.get("review_status"),
                    medical_relations=tuple(medical_relations.get(chunk.id, []))))
        ordered = sorted(output, key=lambda item: (-item.score, item.chunk_id))
        return EvidenceBundle(public=tuple(e for e in ordered if e.corpus == "public")[:limit // 2 + 1],
            historical=tuple(e for e in ordered if e.corpus != "public")[:max(1, limit // 2 - 1)],
            channels={name: len(ids) for name, ids in rankings.items()},
            embedding_model=settings().embedding_model,
            limitations=("Retrieval relevance is not clinical endorsement; terminology is not a guideline.",
                          "Multilingual embeddings are general-purpose and not clinically calibrated.",
                          "Historical cases are separate patients; their later findings are not current evidence."))
