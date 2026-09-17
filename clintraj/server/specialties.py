"""Versioned task profiles over one shared corpus and source-backed graph."""
from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import Field

from clintraj.domain.schemas import StrictModel

from .config import settings


class SpecialtyProfile(StrictModel):
    label: str
    description: str
    triggers: tuple[str, ...] = ()
    dimensions: dict[str, float] = Field(default_factory=dict)
    relations: tuple[str, ...] = ()


class Registry(StrictModel):
    version: str
    specialists: dict[str, SpecialtyProfile]


@lru_cache
def registry() -> Registry:
    return Registry.model_validate(yaml.safe_load(
        Path(settings().specialist_registry).read_text(encoding="utf-8")))


def fallback_routes(text: str) -> tuple[str, ...]:
    """Transparent routing fallback only; model triage may select any or no specialist."""
    return tuple(key for key, profile in registry().specialists.items()
                 if any(term.casefold() in text.casefold() for term in profile.triggers))
