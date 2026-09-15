"""Source-backed medical relationship ingestion; no LLM-generated ontology assertions."""
import json
from pathlib import Path
from typing import Literal

from pydantic import Field
from sqlalchemy import select

from clintraj.domain.schemas import StrictModel

from .db import KnowledgeChunk, KnowledgeSource, db_session
from .knowledge import graph_driver


class MedicalConcept(StrictModel):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    kind: Literal["disease", "symptom", "test", "drug", "procedure", "care_setting", "contraindication", "guideline"]


class MedicalRelation(StrictModel):
    id: str = Field(min_length=1)
    head: MedicalConcept
    tail: MedicalConcept
    relation: Literal["HAS_PHENOTYPE", "EVALUATED_BY", "RECOMMENDS", "RECOMMENDS_AGAINST", "CONTRAINDICATED_WITH", "INTERACTS_WITH"]
    supporting_chunk_id: str = Field(min_length=1)
    source_excerpt: str = Field(min_length=20)
    applicability: str = Field(min_length=1)
    curator: str = Field(min_length=1)


def ingest_relations(relations: list[MedicalRelation]):
    rows = []
    with db_session() as db:
        for relation in relations:
            chunk = db.get(KnowledgeChunk, relation.supporting_chunk_id)
            if chunk is None or chunk.corpus != "public" or relation.source_excerpt not in chunk.text:
                raise ValueError("Medical relation requires an exact excerpt from a stored public chunk")
            source = db.get(KnowledgeSource, chunk.source_id)
            rows.append({**relation.model_dump(mode="json"), "source_id": source.id,
                         "version": source.version, "content_sha256": chunk.content_sha256})
    with graph_driver().session() as graph:
        graph.run("CREATE CONSTRAINT medical_assertion_id IF NOT EXISTS FOR (n:MedicalAssertion) REQUIRE n.id IS UNIQUE").consume()
        graph.run("""UNWIND $rows AS row
            MERGE (head:Concept {id:row.head.id}) SET head.kind=row.head.kind, head.label=row.head.label
            MERGE (tail:Concept {id:row.tail.id}) SET tail.kind=row.tail.kind, tail.label=row.tail.label
            MERGE (a:MedicalAssertion {id:row.id})
            SET a.relation=row.relation, a.applicability=row.applicability, a.curator=row.curator,
                a.source_id=row.source_id, a.version=row.version, a.content_sha256=row.content_sha256,
                a.source_excerpt=row.source_excerpt
            MERGE (a)-[:SUBJECT]->(head) MERGE (a)-[:OBJECT]->(tail)
            WITH a,head,tail,row MATCH (chunk:Chunk {id:row.supporting_chunk_id})
            MERGE (a)-[:SUPPORTED_BY]->(chunk)
            MERGE (chunk)-[:MENTIONS]->(head) MERGE (chunk)-[:MENTIONS]->(tail)""", rows=rows).consume()
    return len(rows)


def seed_medical_relations():
    # Local concept namespace is explicit. These are source-qualified assertions,
    # not universal rules or SNOMED/RxNorm mappings inferred from names.
    definitions = [
        ("icu-assessment", "Patients with sepsis who are unresponsive to initial fluid resuscitation are managed in a facility capable of providing intensive care", "sepsis", "Sepsis", "intensive-care", "Intensive care capable facility", "care_setting", "RECOMMENDS", "Sepsis unresponsive to initial fluid resuscitation; source Good Practice Statement."),
        ("pmx-dhp", "We suggest against using PMX-DHP for patients with septic shock", "septic-shock", "Septic shock", "pmx-dhp", "PMX-DHP", "procedure", "RECOMMENDS_AGAINST", "Patients with septic shock; source GRADE 2D suggestion, not an absolute contraindication."),
        ("glycopeptide-infusion", "We suggest against using continuous or extended infusion of glycopeptide antimicrobials for sepsis", "sepsis", "Sepsis", "glycopeptide-extended-infusion", "Continuous or extended glycopeptide infusion", "drug", "RECOMMENDS_AGAINST", "Sepsis and continuous/extended infusion route; source GRADE 2C suggestion."),
    ]
    relations = []
    with db_session() as db:
        chunks = list(db.scalars(select(KnowledgeChunk).where(KnowledgeChunk.document_id == "PMC11907869").order_by(KnowledgeChunk.id)))
        for key, phrase, head, head_label, tail, tail_label, kind, relation, applicability in definitions:
            chunk = next((c for c in chunks if phrase in c.text), None)
            if chunk:
                relations.append(MedicalRelation.model_validate({"id": chunk.source_id + ":assertion:" + key,
                    "head": {"id": "CLINTRAJ:" + head, "label": head_label, "kind": "disease"},
                    "tail": {"id": "CLINTRAJ:" + tail, "label": tail_label, "kind": kind},
                    "relation": relation, "supporting_chunk_id": chunk.id, "source_excerpt": phrase,
                    "applicability": applicability, "curator": "repository-source-extraction-v1"}))
    return ingest_relations(relations)


def import_manifest(path: Path):
    return ingest_relations([MedicalRelation.model_validate(row) for row in json.loads(path.read_text(encoding="utf-8"))])
