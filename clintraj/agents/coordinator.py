"""Framework-independent clinical decision method and physician review boundary."""

import hashlib
import json
from importlib.resources import files
from importlib.resources.abc import Traversable
from pathlib import Path
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

from clintraj.agents.base import RoleAgent, StructuredOutputError
from clintraj.agents.safety import SafetyCritic
from clintraj.agents.schemas import (
    ActionGeneration,
    ArbiterExplanation,
    GroundingAssessment,
    PhysicianDecision,
    PhysicianResponse,
    ProblemFormulation,
    Recommendation,
    ReviewOutcome,
    SafetyAssessment,
    SafetyReview,
    SpecialistAdvice,
    StateInterpretation,
    StrategyAssessment,
)
from clintraj.agents.specialists import SpecialistRouter
from clintraj.domain.clinical_state import ClinicalState
from clintraj.models.base import ModelAdapter
from clintraj.policies.scoring import OrdinalScoringPolicy, PolicyWeights, ScoringPolicy
from clintraj.retrieval.local import LocalEvidenceRetriever, Retriever


class RuntimeConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    version: str = "1.0.0"
    multi_agent: bool = True
    structured_state: bool = True
    dynamic_graph: bool = True
    specialist_routing: bool = True
    information_gain: bool = True
    safety_critic: bool = True
    retrieval: bool = True
    explicit_ownership: bool = True
    graph_semantics: bool = True
    max_model_calls_per_decision: int = Field(default=12, ge=1)
    policy_weights: PolicyWeights = Field(default_factory=PolicyWeights)


def state_fingerprint(state: ClinicalState) -> str:
    """Binds physician approval to the exact observation without exposing it."""
    encoded = json.dumps(state.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


class ClinicalCoordinator:
    """Role composition separated from orchestration and all hidden EHR data.

    Model safety critique is independently prompted. Programmatic provenance and
    graph checks always run; disabling the clinical critic is an offline ablation
    and never disables the physician boundary. Risk annotations are monotone in
    a proposal: model interpretation may add flags, never erase recorded ones.
    """

    ROLES = ("state_interpreter", "problem_manager", "action_generator", "information_gain",
             "specialist", "grounding", "safety_critic", "arbiter")

    def __init__(
        self, model: ModelAdapter, config: RuntimeConfig | None = None, *,
        prompt_directory: Path | Traversable | None = None, retriever: Retriever | None = None,
        policy: ScoringPolicy | None = None, router: SpecialistRouter | None = None,
    ) -> None:
        self.model = model
        self.config = config or RuntimeConfig()
        directory = prompt_directory or files("configs.prompts")
        self.agents = {role: RoleAgent(role, model, directory) for role in self.ROLES}
        self.retriever = retriever or LocalEvidenceRetriever()
        weights = self.config.policy_weights
        if not self.config.information_gain:
            weights = weights.model_copy(update={"information_gain": 0.0})
        self.policy = policy or OrdinalScoringPolicy(weights)
        self.router = router or SpecialistRouter()
        self.safety = SafetyCritic()

    @staticmethod
    def _validate_evidence(state: ClinicalState, references: tuple[str, ...]) -> None:
        if set(references) - {e.evidence_id for e in state.available_evidence if e.available_at <= state.clock}:
            raise StructuredOutputError("Role output cites unavailable evidence")

    def _visible_payload(self, state: ClinicalState) -> dict:
        payload = state.model_dump(mode="json")
        # A pseudonymous case ID is unnecessary for reasoning; do not transmit it.
        payload.pop("case_ref", None)
        if not self.config.structured_state:
            return {"clock": payload["clock"], "available_evidence": payload["available_evidence"]}
        if not self.config.dynamic_graph:
            payload.pop("clinical_graph", None)
        if not self.config.explicit_ownership:
            payload.pop("current_management_ownership", None)
            for field in ("active_problems", "suspended_problems", "resolved_problems"):
                for problem in payload.get(field, []):
                    problem.pop("owner", None)
            for event in payload.get("clinical_graph", []):
                event.pop("owner", None)
        if not self.config.graph_semantics:
            payload.pop("clinical_graph", None)
        return payload

    def propose(self, state: ClinicalState) -> Recommendation:
        if any(e.available_at > state.clock for e in state.available_evidence):
            raise ValueError("Observable state contains future evidence")
        invoked: list[str] = []
        uncertainty: list[str] = list(state.uncertainty)
        working = state
        formulation = ProblemFormulation()

        def run(role: str, payload: dict, schema: type[BaseModel]):
            if len(invoked) >= self.config.max_model_calls_per_decision:
                raise RuntimeError("Configured model-call budget exhausted; no recommendation issued")
            invoked.append(role)
            return self.agents[role].run(payload, schema)

        context: dict = {"state": self._visible_payload(working)}
        if self.config.multi_agent:
            interpretation = run("state_interpreter", context, StateInterpretation)
            self._validate_evidence(state, interpretation.evidence_ids)
            uncertainty.extend(interpretation.uncertainty)
            working = ClinicalState.model_validate(state.model_dump() | {
                "risk_flags": tuple(dict.fromkeys((*state.risk_flags, *interpretation.risk_flags)))})
            context = {"state": self._visible_payload(working), "interpretation": interpretation.model_dump(mode="json")}
            formulation = run("problem_manager", context, ProblemFormulation)
            self._validate_evidence(state, formulation.evidence_ids)
            known = {p.problem_id for p in (*state.active_problems, *state.suspended_problems, *state.resolved_problems)}
            if set(formulation.problem_summaries) - known:
                raise StructuredOutputError("Problem formulation refers to unknown stable IDs")
            uncertainty.extend(formulation.uncertainty)
            context["formulation"] = formulation.model_dump(mode="json")
        generated = run("action_generator", context, ActionGeneration)
        candidates = generated.candidates
        uncertainty.extend(generated.uncertainty)
        context["candidates"] = [a.model_dump(mode="json") for a in candidates]
        candidate_ids = {a.candidate_id for a in candidates}
        if self.config.multi_agent and self.config.information_gain and candidates:
            strategy = run("information_gain", context, StrategyAssessment)
            if set(strategy.assessments) - candidate_ids:
                raise StructuredOutputError("Strategy assessment refers to unknown candidates")
            candidates = tuple(a.model_copy(update={"assessment": strategy.assessments[a.candidate_id]})
                               if a.candidate_id in strategy.assessments else a for a in candidates)
            uncertainty.extend(strategy.uncertainty)
            context["candidates"] = [a.model_dump(mode="json") for a in candidates]
        advice: list[SpecialistAdvice] = []
        if self.config.multi_agent and self.config.specialist_routing:
            for specialty in self.router.route(working, candidates,
                                               include_ownership=self.config.explicit_ownership):
                specialty_advice = run("specialist", {**context, "specialty": specialty}, SpecialistAdvice)
                self._validate_evidence(state, specialty_advice.evidence_ids)
                if specialty_advice.specialty != specialty or set(specialty_advice.candidate_ids) - candidate_ids:
                    raise StructuredOutputError("Specialist output does not match routed context")
                advice.append(specialty_advice)
        context["specialist_advice"] = [a.model_dump(mode="json") for a in advice]
        citation_ids: tuple[str, ...] = ()
        citation_hashes: dict[str, str] = {}
        if self.config.retrieval:
            query = " ".join(a.action for a in candidates)
            documents = self.retriever.retrieve(query, clock=state.clock)
            if any(d.available_at > state.clock for d in documents):
                raise ValueError("Retriever returned a source unavailable at the observation time")
            context["retrieved_documents"] = [d.model_dump(mode="json") for d in documents]
            grounding = run("grounding", context, GroundingAssessment)
            if set(grounding.citation_ids) - {d.citation_id for d in documents} or set(grounding.supported_candidate_ids) - candidate_ids:
                raise StructuredOutputError("Grounding output fabricates references or candidate IDs")
            if grounding.supported_candidate_ids and not grounding.citation_ids:
                raise StructuredOutputError("Guideline support requires an actual retrieved source")
            citation_ids = grounding.citation_ids
            citation_hashes = {d.citation_id: d.content_sha256 for d in documents if d.citation_id in citation_ids}
            uncertainty.extend(grounding.limitations)
            context["grounding"] = grounding.model_dump(mode="json")
        assessments = {a.candidate_id: self.safety.evaluate(working, a,
            clinical_rules=self.config.safety_critic,
            graph_validation=self.config.dynamic_graph and self.config.graph_semantics) for a in candidates}
        if self.config.multi_agent and self.config.safety_critic and candidates:
            critique = run("safety_critic", context, SafetyReview)
            critic_ids = [a.candidate_id for a in critique.assessments]
            if len(critic_ids) != len(set(critic_ids)) or set(critic_ids) != candidate_ids:
                raise StructuredOutputError("Safety critic must independently assess every candidate exactly once")
            for assessment in critique.assessments:
                existing = assessments[assessment.candidate_id]
                assessments[assessment.candidate_id] = SafetyAssessment(candidate_id=assessment.candidate_id,
                    findings=existing.findings + assessment.findings)
            uncertainty.extend(critique.uncertainty)
        eligible = tuple(a for a in candidates if not assessments[a.candidate_id].vetoed)
        ranked = self.policy.rank(eligible)
        selected_id = ranked[0].candidate_id if ranked else None
        explanation = "All proposed actions were vetoed or no candidate was generated." if not ranked else (
            "Selected by an uncalibrated ordinal research rubric; physician review is mandatory.")
        if any(rank.unknown_dimensions for rank in ranked):
            uncertainty.append("Ranking contains unknown utility dimensions; scores are not calibrated clinical benefit.")
        if self.config.multi_agent:
            arbiter = run("arbiter", {**context, "rankings": [r.model_dump(mode="json") for r in ranked],
                "safety_assessments": [a.model_dump(mode="json") for a in assessments.values()],
                "selected_candidate_id": selected_id}, ArbiterExplanation)
            explanation += " " + arbiter.explanation
            uncertainty.extend(arbiter.uncertainty)
        return Recommendation(recommendation_id=uuid4().hex, state_fingerprint=state_fingerprint(state),
            candidates=candidates, selected_candidate_id=selected_id, rankings=ranked,
            safety_assessments=tuple(assessments.values()), specialist_advice=tuple(advice),
            citation_ids=citation_ids, citation_hashes=citation_hashes, explanation=explanation,
            inferred_risk_flags=working.risk_flags, proposed_differential=formulation.differential,
            problem_summaries=formulation.problem_summaries,
            uncertainty=tuple(dict.fromkeys(uncertainty)), roles_invoked=tuple(invoked),
            prompt_versions={role: self.agents[role].version for role in invoked},
            prompt_hashes={role: self.agents[role].content_sha256 for role in invoked},
            model_metadata=self.model.metadata.model_dump())

    def review(self, state: ClinicalState, recommendation: Recommendation, decision: PhysicianDecision) -> ReviewOutcome:
        if decision.recommendation_id != recommendation.recommendation_id:
            return ReviewOutcome(approved=False, reason="Physician decision refers to a different recommendation.")
        if recommendation.state_fingerprint != state_fingerprint(state):
            return ReviewOutcome(approved=False, reason="State changed after recommendation; request a new recommendation.")
        if decision.response == PhysicianResponse.REJECT:
            return ReviewOutcome(approved=False, reason="Physician rejected the recommendation.")
        action = decision.modified_action if decision.response == PhysicianResponse.MODIFY else recommendation.selected_action
        if action is None:
            return ReviewOutcome(approved=False, reason="No eligible action exists for physician acceptance.")
        review_state = ClinicalState.model_validate(state.model_dump() | {
            "risk_flags": tuple(dict.fromkeys((*state.risk_flags, *recommendation.inferred_risk_flags)))})
        safety = self.safety.evaluate(review_state, action, clinical_rules=True,
            graph_validation=self.config.dynamic_graph and self.config.graph_semantics)
        # An ACCEPT cannot erase any independent critic veto. A modified action
        # receives a fresh independent model review before it can execute.
        if decision.response == PhysicianResponse.ACCEPT:
            original = next((a for a in recommendation.safety_assessments if a.candidate_id == action.candidate_id), None)
            if original:
                safety = SafetyAssessment(candidate_id=action.candidate_id, findings=safety.findings + original.findings)
        elif self.config.safety_critic and self.config.multi_agent:
            review = self.agents["safety_critic"].run({"state": self._visible_payload(review_state),
                "candidates": [action.model_dump(mode="json")], "physician_modification": True}, SafetyReview)
            if len(review.assessments) != 1 or review.assessments[0].candidate_id != action.candidate_id:
                raise StructuredOutputError("Modified action safety review is missing or mismatched")
            safety = SafetyAssessment(candidate_id=action.candidate_id, findings=safety.findings + review.assessments[0].findings)
        if safety.vetoed:
            return ReviewOutcome(approved=False, reason="Safety veto requires reconsideration.", safety=safety)
        return ReviewOutcome(approved=True, action=action, reason="Physician-approved offline action passed implemented safeguards.", safety=safety)
