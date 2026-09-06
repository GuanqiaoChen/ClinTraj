"""Reproducible case splits and explicit experiment capability declarations."""

import hashlib
from importlib.resources import files
from importlib.resources.abc import Traversable
from pathlib import Path

import yaml
from pydantic import Field

from clintraj.domain.schemas import StrictModel


class ExperimentConfig(StrictModel):
    name: str
    version: str = "1.0.0"
    seed: int = 42
    multi_agent: bool = True
    structured_state: bool = True
    dynamic_graph: bool = True
    specialist_routing: bool = True
    information_gain: bool = True
    safety_critic: bool = True
    retrieval: bool = True
    explicit_ownership: bool = True
    graph_semantics: bool = True
    temporal_gating: bool = True
    clinician_intervention: bool = True
    max_model_calls_per_decision: int = Field(default=12, gt=0)
    max_steps: int = Field(default=32, gt=0)
    provider: str = "local_fixture"
    model: str = "conservative-workflow-fixture"
    model_version: str | None = "1.0.0"
    model_seed: int | None = 0
    temperature: float = 0.0
    prompt_version: str = "1.0.0"
    research_only: bool = True

    def assert_supported(self) -> None:
        if not self.temporal_gating or not self.clinician_intervention:
            raise NotImplementedError(
                "Unsafe temporal/HITL ablations are declared research protocols only; "
                "the physician runtime never disables these boundaries")
        if self.provider != "local_fixture":
            raise NotImplementedError("CLI supports mock only; external adapters require approved integration")


def load_experiment(path: str | Path | Traversable) -> ExperimentConfig:
    """Load an explicit path or a packaged configuration name."""
    if isinstance(path, (str, Path)):
        candidate = Path(path)
        if candidate.is_file():
            content = candidate.read_text(encoding="utf-8")
        else:
            name = str(path)
            if any(separator in name for separator in ("/", "\\")) or name.endswith(".yaml"):
                raise FileNotFoundError(f"Experiment config not found: {name}")
            resource = files("configs.experiments").joinpath(f"{name}.yaml")
            if not resource.is_file():
                raise FileNotFoundError(f"Unknown packaged experiment config: {name}")
            content = resource.read_text(encoding="utf-8")
    else:
        content = path.read_text(encoding="utf-8")
    return ExperimentConfig.model_validate(yaml.safe_load(content))


def case_split(case_refs: tuple[str, ...], *, seed: int = 42,
               held_out_exemplars: frozenset[str] = frozenset()) -> dict[str, tuple[str, ...]]:
    """Stable case-disjoint development/validation/test partition, excluding exemplars.

    Repeated admissions of one patient require a supplied patient grouping before this function.
    This file has no evidence that case identifiers uniquely identify patients across admissions.
    """
    if len(set(case_refs)) != len(case_refs):
        raise ValueError("Duplicate case identifiers in split")
    groups: dict[str, list[str]] = {"development": [], "validation": [], "test": [], "exemplars": []}
    for ref in sorted(case_refs):
        if ref in held_out_exemplars:
            groups["exemplars"].append(ref)
            continue
        bucket = int(hashlib.sha256(f"{seed}:{ref}".encode()).hexdigest()[:8], 16) % 100
        partition = "development" if bucket < 70 else "validation" if bucket < 85 else "test"
        groups[partition].append(ref)
    return {key: tuple(value) for key, value in groups.items()}
