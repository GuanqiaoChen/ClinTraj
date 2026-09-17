"""Private BGE inference service; never sends corpus text to a public endpoint."""
import httpx

from clintraj.models.openai_compatible import local_endpoint

from .config import settings


def request(path: str, data: dict, *, timeout: float | None = None):
    cfg = settings()
    url = cfg.retrieval_service_url.rstrip("/")
    if not local_endpoint(url):
        raise ValueError("Retrieval inference must use a private endpoint")
    with httpx.Client(timeout=timeout or cfg.retrieval_timeout, trust_env=False) as client:
        response = client.post(url + path, json=data)
        response.raise_for_status()
        return response.json()


def encode(texts: list[str], *, timeout: float | None = None):
    result = request("/encode", {"texts": texts}, timeout=timeout)
    if result.get("model") != "BAAI/bge-m3" or len(result["dense"]) != len(texts):
        raise ValueError("Incorrect BGE encoder response")
    if any(len(vector) != 1024 for vector in result["dense"]):
        raise ValueError("BGE-M3 requires 1024 dimensions")
    return result


def rerank(query: str, texts: list[str]):
    result = request("/rerank", {"query": query, "texts": texts})
    if result.get("model") != settings().reranker_model or len(result["scores"]) != len(texts):
        raise ValueError("Incorrect reranker response")
    return result["scores"]
