"""Verify real BGE/SQL/graph/reranker integration without exporting source text."""
import argparse
import json
import time
from pathlib import Path

from sqlalchemy import func, select

from clintraj.server.config import settings
from clintraj.server.db import KnowledgeChunk, db_session
from clintraj.server.knowledge import HybridRetriever
from clintraj.server.retrieval_client import request


def coverage():
    with db_session() as db:
        total = db.scalar(select(func.count()).select_from(KnowledgeChunk))
        indexed = db.scalar(select(func.count()).select_from(KnowledgeChunk).where(
            KnowledgeChunk.retrieval_model == "BAAI/bge-m3", KnowledgeChunk.embedding_m3.is_not(None)))
    return total, indexed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--wait-index", action="store_true")
    parser.add_argument("--timeout", type=int, default=1800)
    args = parser.parse_args()
    deadline = time.monotonic() + args.timeout
    total, indexed = coverage()
    while args.wait_index and indexed < total and time.monotonic() < deadline:
        print(f"BGE index coverage {indexed}/{total}", flush=True)
        time.sleep(30)
        total, indexed = coverage()
    assert indexed == total and total, "Finish reindex_m3 before complete-stack validation"
    assert settings().retrieval_profile == "bge_m3"
    request("/rerank", {"query": "pneumonia", "texts": ["Pneumonia imaging and microbiology"]}, timeout=600)
    runs = []
    for specialty, query in [
        ("pneumonia", "Fever cough hypoxemia pneumonia chest imaging microbiology"),
        ("copd", "COPD exacerbation dyspnea spirometry oxygenation smoking"),
        ("oncology", "Cancer tumor histology pathology staging biomarker"),
    ]:
        started = time.monotonic()
        bundle = HybridRetriever().retrieve_bundle(query, allow_private=False, specialties=(specialty,))
        elapsed = time.monotonic() - started
        assert bundle.retrieval_metadata["encoder"] == "BAAI/bge-m3"
        assert bundle.retrieval_metadata["reranker"] == "BAAI/bge-reranker-v2-m3"
        assert bundle.public and bundle.historical
        assert all(bundle.channels[c] for c in ("lexical", "dense", "sparse_m3", "graph"))
        assert all("rerank" in e.score_breakdown for e in bundle.items)
        assert all(e.corpus in {"public", "synthetic_history"} for e in bundle.items)
        runs.append({"specialty": specialty, "seconds": round(elapsed, 3),
            "within_retrieval_budget": elapsed < settings().retrieval_timeout,
            "channels": bundle.channels, "public": len(bundle.public), "historical": len(bundle.historical),
            "metadata": bundle.retrieval_metadata})
    report = {"coverage": {"total": total, "indexed": indexed}, "runs": runs,
        "scope": "Technical retrieval verification; no clinical relevance gold labels"}
    Path("outputs").mkdir(exist_ok=True)
    Path("outputs/retrieval-verification.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report), flush=True)


if __name__ == "__main__":
    main()
