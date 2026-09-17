"""Optional CPU/GPU BGE service. Start with the research Compose profile."""
from functools import lru_cache
from threading import Lock

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="ClinTraj private retrieval inference")
_lock = Lock()


@lru_cache
def encoder():
    from FlagEmbedding import BGEM3FlagModel
    return BGEM3FlagModel("BAAI/bge-m3", use_fp16=False)


@lru_cache
def ranker():
    from FlagEmbedding import FlagReranker
    return FlagReranker("BAAI/bge-reranker-v2-m3", use_fp16=False)


class TextBatch(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=64)


class RankBatch(TextBatch):
    query: str = Field(min_length=1, max_length=20000)


@app.get("/health")
def health():
    return {"status": "ok", "encoder_loaded": bool(encoder.cache_info().currsize),
            "reranker_loaded": bool(ranker.cache_info().currsize)}


@app.post("/encode")
def encode(body: TextBatch):
    with _lock:
        output = encoder().encode(body.texts, batch_size=8, max_length=2048,
            return_dense=True, return_sparse=True, return_colbert_vecs=False)
    return {"model": "BAAI/bge-m3", "dense": output["dense_vecs"].tolist(),
            "sparse": [{str(k): float(v) for k, v in row.items()} for row in output["lexical_weights"]]}


@app.post("/rerank")
def rerank(body: RankBatch):
    with _lock:
        scores = ranker().compute_score([[body.query, text] for text in body.texts],
            normalize=True, batch_size=8, max_length=512)
    if isinstance(scores, (float, int)):
        scores = [scores]
    return {"model": "BAAI/bge-reranker-v2-m3", "scores": [float(s) for s in scores]}
