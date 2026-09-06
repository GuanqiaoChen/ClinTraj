"""Small explicit local evidence corpus with provenance; no invented citations."""

import hashlib
import re
from pathlib import Path
from typing import Protocol

import yaml
from pydantic import BaseModel, ConfigDict, Field


class EvidenceDocument(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    citation_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    source: str = Field(min_length=1)
    version: str = Field(min_length=1)
    text: str = Field(min_length=1)
    available_at: int = Field(default=0, ge=0)

    @property
    def content_sha256(self) -> str:
        return hashlib.sha256(self.text.encode("utf-8")).hexdigest()


class Retriever(Protocol):
    def retrieve(self, query: str, *, clock: int, limit: int = 5) -> tuple[EvidenceDocument, ...]: ...


class LocalEvidenceRetriever:
    """Lexical retrieval for a small user-curated corpus, not clinical validation.

    `available_at` uses the replay clock and must be assigned from independently
    verified source dates. Lexical hits are candidate support, never proof.
    """

    def __init__(self, documents: tuple[EvidenceDocument, ...] = ()) -> None:
        if len({d.citation_id for d in documents}) != len(documents):
            raise ValueError("Duplicate citation IDs")
        self.documents = documents

    @classmethod
    def from_yaml(cls, path: Path) -> "LocalEvidenceRetriever":
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        return cls(tuple(EvidenceDocument.model_validate(item) for item in raw["documents"]))

    def retrieve(self, query: str, *, clock: int, limit: int = 5) -> tuple[EvidenceDocument, ...]:
        tokens = set(re.findall(r"\w+", query.lower()))
        matches = []
        for document in self.documents:
            if document.available_at > clock:
                continue
            score = len(tokens & set(re.findall(r"\w+", (document.title + " " + document.text).lower())))
            if score:
                matches.append((score, document.citation_id, document))
        return tuple(item[2] for item in sorted(matches, key=lambda x: (-x[0], x[1]))[:limit])
