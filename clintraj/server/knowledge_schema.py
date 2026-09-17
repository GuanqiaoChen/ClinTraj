"""FHIR/OMOP-aligned evidence facets, not a claim to replicate a proprietary schema."""
import re
from typing import Literal

from pydantic import Field

from clintraj.domain.schemas import StrictModel


class KnowledgeFacets(StrictModel):
    schema_version: str = "2.0.0"
    specialties: tuple[str, ...] = ()
    dimensions: tuple[str, ...] = ()
    modality: Literal["text", "CT", "XR", "MRI", "US", "pathology", "spirometry", "lab"] = "text"
    body_site: str | None = None
    finding: str | None = None
    laterality: str | None = None
    negated: bool | None = None
    certainty: Literal["confirmed", "suspected", "unknown"] = "unknown"
    population: str | None = None
    age_min: float | None = Field(default=None, ge=0)
    age_max: float | None = Field(default=None, ge=0)
    severity: str | None = None
    stage: str | None = None
    histology: str | None = None
    biomarker: str | None = None
    treatment_line: str | None = None
    evidence_level: str | None = None
    recommendation_strength: str | None = None
    effective_from: str | None = None
    effective_until: str | None = None
    terminology_system: str | None = None
    terminology_version: str | None = None
    fhir_resource: str | None = None
    omop_domain: str | None = None
    annotation_method: Literal["curated", "source", "topic_terms", "unannotated"] = "unannotated"


TOPIC_TERMS = {
    "imaging": r"\b(ct|radiograph|imaging|tomography|consolidation|infiltrat\w*)\b|影像|实变|磨玻璃",
    "oxygenation": r"\b(oxygen\w*|hypox\w*|spo2|pao2|ventilat\w*)\b|氧合|血氧|低氧",
    "microbiology": r"\b(culture|pathogen\w*|microbiolog\w*|sputum)\b|病原|培养|痰液",
    "severity": r"\b(severity|severe|shock|mortality)\b|严重|重症|休克",
    "spirometry": r"\b(spirometr\w*|fev1|fvc|airflow)\b|肺功能|气流受限",
    "exacerbation": r"\bexacerbation\w*\b|急性加重",
    "exposure": r"\b(smoking|tobacco|exposure)\b|吸烟|暴露",
    "medication": r"\b(drug|antibiotic\w*|treatment|therapy|steroid\w*)\b|药物|抗菌|治疗",
    "pathology": r"\b(patholog\w*|histolog\w*|biopsy)\b|病理|活检",
    "staging": r"\b(stage|staging|tnm|metasta\w*)\b|分期|转移",
    "biomarker": r"\b(biomarker\w*|egfr|alk|pd-l1|mutation\w*)\b|标志物|突变",
    "treatment_line": r"\b(first.line|second.line|neoadjuvant|adjuvant)\b|一线|二线|辅助治疗",
    "performance_status": r"\b(ecog|karnofsky|performance status)\b|体能状态",
    "symptom": r"\b(symptom\w*|fever|cough|dyspn\w*)\b|症状|发热|咳嗽|呼吸困难",
}


def topic_facets(text: str) -> dict:
    """Document topic annotation, not diagnosis, phenotype assertion, or patient evidence."""
    return KnowledgeFacets(dimensions=tuple(k for k, pattern in TOPIC_TERMS.items()
        if re.search(pattern, text, re.I)), annotation_method="topic_terms").model_dump(mode="json")


def facet_score(facets: dict, profile) -> float:
    dimensions = set(facets.get("dimensions", ()))
    denominator = sum(profile.dimensions.values())
    return sum(value for key, value in profile.dimensions.items() if key in dimensions) / (denominator or 1)
