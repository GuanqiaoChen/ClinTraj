"""Resumable additive BGE index build; never discards legacy vectors or source text."""
from sqlalchemy import or_, select

from .db import KnowledgeChunk, db_session
from .retrieval_client import encode


def reindex():
    count = 0
    while True:
        with db_session() as db:
            rows = list(db.scalars(select(KnowledgeChunk).where(or_(
                KnowledgeChunk.embedding_m3.is_(None), KnowledgeChunk.retrieval_model.is_(None),
                KnowledgeChunk.retrieval_model != "BAAI/bge-m3")).order_by(KnowledgeChunk.id).limit(16)))
            if not rows:
                break
            output = encode([r.text for r in rows], timeout=900)
            for row, dense, sparse in zip(rows, output["dense"], output["sparse"], strict=True):
                row.embedding_m3, row.sparse_m3 = dense, sparse
                row.retrieval_model = "BAAI/bge-m3"
            db.commit()
            count += len(rows)
            print(f"BGE-M3 indexed {count} chunks", flush=True)


if __name__ == "__main__":
    reindex()
