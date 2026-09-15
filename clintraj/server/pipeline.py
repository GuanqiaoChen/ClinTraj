"""Live role pipeline reusing ClinTraj's independent domain, safety and review contracts."""
from typing import Any
from uuid import uuid4

from pydantic import Field

from clintraj.agents.base import StructuredOutputError
from clintraj.agents.coordinator import ClinicalCoordinator, state_fingerprint
from clintraj.agents.schemas import (
    ActionGeneration,
    ArbiterExplanation,
    Message,
    PhysicianResponse,
    ProblemFormulation,
    Recommendation,
    ReviewOutcome,
    SafetyAssessment,
    SafetyFinding,
    SafetyReview,
    SpecialistAdvice,
    StateInterpretation,
)
from clintraj.domain.clinical_state import ClinicalState
from clintraj.server.knowledge import EvidenceBundle, HybridRetriever


class GroundedClaims(Message):
    candidate_citations: dict[str, tuple[str, ...]] = Field(default_factory=dict)
    limitations: tuple[str, ...] = ()


def model_documents(bundle):
    # Citation aliases reduce copying errors; all public provenance stays in the saved bundle.
    return [{"citation_id": f"K{i + 1}", "title": e.source, "kind": e.kind,
             "corpus": e.corpus, "text": e.text[:1200], "review_status": e.review_status,
             "source_qualified_relations": e.medical_relations}
            for i, e in enumerate(bundle.items)]


def expand_citations(grounding, bundle):
    aliases = {f"K{i + 1}": e.citation_id for i, e in enumerate(bundle.items)}
    return GroundedClaims(candidate_citations={c: tuple(aliases.get(ref, ref) for ref in refs)
        for c, refs in grounding.candidate_citations.items()}, limitations=grounding.limitations)


def patient_reference_aliases(value, references):
    """Map only patient-reference fields; never rewrite prose or knowledge citations."""
    if isinstance(value, list):
        return [patient_reference_aliases(item, references) for item in value]
    if not isinstance(value, dict):
        return value
    return {key: references.get(item, item) if key == "evidence_id" else
        [references.get(ref, ref) for ref in item] if key in {"evidence_ids", "patient_evidence_ids"} else
        patient_reference_aliases(item, references) for key, item in value.items()}


class LiveCoordinator(ClinicalCoordinator):
    def __init__(self, model, emit, *, allow_private: bool, retriever=None):
        super().__init__(model)
        self.emit = emit
        self.allow_private = allow_private
        self.hybrid = retriever or HybridRetriever()
        self.bundle: EvidenceBundle | None = None

    def review(self, state, recommendation, decision):
        if decision.response != PhysicianResponse.MODIFY:
            return super().review(state, recommendation, decision)
        if decision.recommendation_id != recommendation.recommendation_id or recommendation.state_fingerprint != state_fingerprint(state):
            return ReviewOutcome(approved=False, reason="Recommendation or clinical state changed")
        action = decision.modified_action
        if self.bundle is None:
            raise ValueError("Modified review requires persisted retrieval provenance")
        working = ClinicalState.model_validate(state.model_dump() | {
            "risk_flags": tuple(dict.fromkeys((*state.risk_flags, *recommendation.inferred_risk_flags)))})
        payload = {"state": self._visible_payload(working), "candidates": [action.model_dump(mode="json")],
                   "retrieved_documents": model_documents(self.bundle),
                   "physician_modification": True}
        grounding = self.role("grounding", {**payload,
            "instruction": "Map the single modified candidate to actual supporting citation_ids; do not carry over support for an earlier action."}, GroundedClaims)
        grounding = expand_citations(grounding, self.bundle)
        documents = {e.citation_id: e for e in self.bundle.items}
        refs = grounding.candidate_citations.get(action.candidate_id, ())
        if set(grounding.candidate_citations) - {action.candidate_id} or set(refs) - documents.keys():
            return ReviewOutcome(approved=False, reason="Modified action has invalid grounding references")
        critique = self.role("safety_critic", {**payload, "grounding": grounding.model_dump(mode="json")}, SafetyReview)
        if len(critique.assessments) != 1 or critique.assessments[0].candidate_id != action.candidate_id:
            raise StructuredOutputError("Modified action safety assessment is missing")
        findings = self.safety.evaluate(working, action).findings + critique.assessments[0].findings
        if action.action_type.value in {"TREATMENT", "PROCEDURE", "DISCHARGE_FOLLOWUP"} and not any(
            documents[r].corpus == "public" and documents[r].kind == "article" for r in refs):
            findings += (SafetyFinding(code="insufficient_public_grounding", explanation="Modified action lacks public article support."),)
        safety = SafetyAssessment(candidate_id=action.candidate_id, findings=findings)
        for finding in findings:
            self.emit("SAFETY_WARNING", "safety_critic", {"code": finding.code, "veto": finding.veto})
        if safety.vetoed:
            return ReviewOutcome(approved=False, reason="Modified action vetoed; reconsider and run a new decision", safety=safety)
        return ReviewOutcome(approved=True, action=action, reason="Physician modification passed independent review", safety=safety)

    def role(self, name, payload, schema):
        aliases = {e["evidence_id"]: f"E{i + 1}" for i, e in enumerate(
            payload.get("state", {}).get("available_evidence", []))}
        payload = patient_reference_aliases(payload, aliases)
        originals = {alias: original for original, alias in aliases.items()}
        if name == "safety_critic":
            payload = {**payload, "required_json_shape": {
                "assessments": [{"candidate_id": c["candidate_id"], "findings": []} for c in payload["candidates"]],
                "uncertainty": []}, "schema_reminder": "Each assessment has ONLY candidate_id and findings. Each finding has ONLY code, explanation and veto. Never add note, rationale, safety_status or recommendation fields. Put brief limitations in the top-level uncertainty array. Replace empty findings with structured findings when indicated."}
        detail = {"specialty": payload["specialty"]} if "specialty" in payload else {}
        self.emit("AGENT_STARTED", name, detail)
        for attempt in range(2):
            try:
                result = self.agents[name].run(payload, schema)
                result = schema.model_validate(patient_reference_aliases(result.model_dump(mode="json"), originals))
                self.emit("AGENT_COMPLETED", name, detail)
                return result
            except StructuredOutputError as exc:
                if attempt:
                    raise
                payload = {**payload, "format_correction": "Previous response failed JSON schema validation. Return only the exact required schema and allowed enums; omit extra keys. " + str(exc)}

    def propose(self, state: ClinicalState) -> Recommendation:
        state = ClinicalState.model_validate(state.model_dump())
        self.emit("AGENT_STARTED", "temporal_gate", {})
        self.emit("AGENT_COMPLETED", "temporal_gate", {"visible_evidence_count": len(state.available_evidence)})
        context: dict[str, Any] = {"state": self._visible_payload(state)}
        interpretation = self.role("state_interpreter", context, StateInterpretation)
        self._validate_evidence(state, interpretation.evidence_ids)
        working = ClinicalState.model_validate(state.model_dump() | {
            "risk_flags": tuple(dict.fromkeys((*state.risk_flags, *interpretation.risk_flags)))})
        context = {"state": self._visible_payload(working), "interpretation": interpretation.model_dump(mode="json"),
            "allowed_specialties": sorted(self.router.specialties),
            "reference_contract": {
                "patient_evidence_ids": [e.evidence_id for e in working.available_evidence],
                "instruction": "Every evidence_ids field refers ONLY to the supplied patient_evidence_ids. K1, K2 etc are knowledge citations for the grounding role, NEVER patient evidence. suggested_specialties must use exact allowed_specialties values; use pulmonology for respiratory concerns."}}
        self.emit("STATE_UPDATED", "state_interpreter", {"risk_flags": list(working.risk_flags), "provisional": True})
        formulation = self.role("problem_manager", context, ProblemFormulation)
        self._validate_evidence(state, formulation.evidence_ids)
        known = {p.problem_id for p in (*state.active_problems, *state.suspended_problems, *state.resolved_problems)}
        if set(formulation.problem_summaries) - known:
            raise StructuredOutputError("Problem formulation refers to unknown IDs")
        context["formulation"] = formulation.model_dump(mode="json")
        self.emit("AGENT_STARTED", "retrieval", {})
        # Interpreted concepts supplement the multilingual encoder's free-text query.
        query = " ".join([interpretation.summary, *formulation.differential,
                          *(p.label for p in state.active_problems)])[:3500]
        self.bundle = self.hybrid.retrieve_bundle(query, allow_private=self.allow_private,
                                                  exclude_document_ids=(state.case_ref,))
        context["retrieved_documents"] = model_documents(self.bundle)
        self.emit("RETRIEVAL_COMPLETED", "retrieval", {
            "public_count": len(self.bundle.public), "historical_count": len(self.bundle.historical),
            "channels": self.bundle.channels, "citation_ids": [e.citation_id for e in self.bundle.items]})
        self.emit("AGENT_COMPLETED", "retrieval", {})
        # Route from interpreted current problems; never invoke every specialty.
        routed = set(formulation.suggested_specialties) & self.router.specialties
        routed |= {p.owner for p in working.active_problems} & self.router.specialties
        if set(working.risk_flags) & {"unstable", "acute_deterioration", "requires_escalation"}:
            routed.add("critical_care")
        specialties = sorted(routed, key=lambda s: (s != "critical_care", s))[:2]
        advice = []
        for specialty in specialties:
            item = self.role("specialist", {**context, "specialty": specialty,
                "candidates": [], "instruction": "Give prospective specialty considerations; candidate_ids must be empty because actions are generated next."}, SpecialistAdvice)
            self._validate_evidence(state, item.evidence_ids)
            if item.specialty != specialty or item.candidate_ids:
                raise StructuredOutputError("Specialist output references an unknown candidate or specialty")
            advice.append(item)
        context["specialist_advice"] = [a.model_dump(mode="json") for a in advice]
        context["action_contract"] = "Use only patient evidence IDs in each candidate. prerequisites lists unmet requirements that block execution, not routine steps or assumed equipment. Put uncertain resources in uncertainty and request confirmation when necessary. Do not claim a prerequisite is satisfied without visible evidence."
        generated = self.role("action_generator", context, ActionGeneration)
        candidates = generated.candidates
        context["candidates"] = [c.model_dump(mode="json") for c in candidates]
        self.emit("ACTION_PROPOSED", "action_generator", {"candidate_ids": [c.candidate_id for c in candidates]})
        grounding = self.role("grounding", {**context,
            "instruction": "Map candidate IDs to supporting citation_id values from retrieved_documents. Do not use patient evidence IDs here. Include only sources actually supporting that specific action. Terminology does not establish treatment efficacy. Empty map is valid when no supporting source exists."}, GroundedClaims)
        grounding = expand_citations(grounding, self.bundle)
        candidate_ids = {c.candidate_id for c in candidates}
        documents = {e.citation_id: e for e in self.bundle.items}
        if set(grounding.candidate_citations) - candidate_ids or any(
            set(refs) - documents.keys() for refs in grounding.candidate_citations.values()):
            raise StructuredOutputError("Grounding produced fabricated citation or candidate IDs")
        # Independent critic sees observations, proposals and sources, but not generator discussion.
        critique = self.role("safety_critic", {"state": self._visible_payload(working),
            "candidates": context["candidates"], "retrieved_documents": context["retrieved_documents"],
            "grounding": grounding.model_dump(mode="json")}, SafetyReview)
        if {s.candidate_id for s in critique.assessments} != candidate_ids or len(critique.assessments) != len(candidates):
            raise StructuredOutputError("Safety critic must assess every candidate exactly once")
        assessments = []
        for candidate in candidates:
            deterministic = self.safety.evaluate(working, candidate)
            model_findings = next(s.findings for s in critique.assessments if s.candidate_id == candidate.candidate_id)
            findings = deterministic.findings + model_findings
            refs = grounding.candidate_citations.get(candidate.candidate_id, ())
            if candidate.action_type.value in {"TREATMENT", "PROCEDURE", "DISCHARGE_FOLLOWUP"} and not any(
                documents[r].corpus == "public" and documents[r].kind == "article" for r in refs):
                findings += (SafetyFinding(code="insufficient_public_grounding",
                    explanation="Treatment, procedure or discharge proposal lacks supporting public article evidence."),)
            assessment = SafetyAssessment(candidate_id=candidate.candidate_id, findings=findings)
            assessments.append(assessment)
            for finding in findings:
                self.emit("SAFETY_WARNING", "safety_critic", {"candidate_id": candidate.candidate_id,
                    "code": finding.code, "veto": finding.veto})
        eligible = tuple(c for c, a in zip(candidates, assessments, strict=True) if not a.vetoed)
        ranked = self.policy.rank(eligible)
        selected = ranked[0].candidate_id if ranked else None
        arbiter = self.role("arbiter", {**context, "grounding": grounding.model_dump(mode="json"),
            "rankings": [r.model_dump(mode="json") for r in ranked],
            "safety_assessments": [a.model_dump(mode="json") for a in assessments],
            "selected_candidate_id": selected}, ArbiterExplanation)
        self.emit("ARBITRATION_COMPLETED", "arbiter", {"selected_candidate_id": selected,
                  "eligible_count": len(eligible), "veto_count": sum(a.vetoed for a in assessments)})
        cited = tuple(dict.fromkeys(r for refs in grounding.candidate_citations.values() for r in refs))
        roles = ("state_interpreter", "problem_manager", "specialist", "action_generator", "grounding", "safety_critic", "arbiter")
        return Recommendation(recommendation_id=uuid4().hex, state_fingerprint=state_fingerprint(state),
            candidates=candidates, selected_candidate_id=selected, rankings=ranked,
            safety_assessments=tuple(assessments), specialist_advice=tuple(advice),
            citation_ids=cited, citation_hashes={r: documents[r].content_sha256 for r in cited},
            candidate_citations=grounding.candidate_citations,
            inferred_risk_flags=working.risk_flags, proposed_differential=formulation.differential,
            problem_summaries=formulation.problem_summaries, explanation=arbiter.explanation,
            uncertainty=tuple(dict.fromkeys((*interpretation.uncertainty, *formulation.uncertainty,
                *generated.uncertainty, *grounding.limitations, *critique.uncertainty,
                *arbiter.uncertainty, *self.bundle.limitations))), roles_invoked=roles,
            prompt_versions={r: self.agents[r].version for r in roles},
            prompt_hashes={r: self.agents[r].content_sha256 for r in roles},
            model_metadata=self.model.metadata.model_dump())
