"""Independent deterministic vetoes supplement, but do not certify, safety."""

from clintraj.agents.schemas import CandidateAction, SafetyAssessment, SafetyFinding
from clintraj.domain.action_types import ActionType
from clintraj.domain.clinical_state import ClinicalState
from clintraj.domain.problem_manager import apply_candidate
from clintraj.domain.relation_types import RelationType


class SafetyCritic:
    """Conservative checks on structured observations; no disease rulebook.

    Risk flags use explicit state annotations such as `acute_deterioration`,
    `unstable`, and `requires_escalation`. Unrecognized free text cannot establish
    safety. Contraindications and prerequisites are supplied by independently
    reviewed rules or the model critic and require clinician resolution.
    """

    def evaluate(self, state: ClinicalState, candidate: CandidateAction, *, clinical_rules: bool = True,
                 graph_validation: bool = True) -> SafetyAssessment:
        findings: list[SafetyFinding] = []

        def veto(code: str, explanation: str) -> None:
            findings.append(SafetyFinding(code=code, explanation=explanation))

        available = {e.evidence_id for e in state.available_evidence if e.available_at <= state.clock}
        if set(candidate.evidence_ids) - available:
            veto("unavailable_evidence", "Candidate cites unknown or not-yet-available evidence.")
        if candidate.action_type not in {ActionType.ASK_HISTORY, ActionType.EXAM, ActionType.REASSESS} and not candidate.evidence_ids:
            veto("ungrounded_action", "This action requires explicit currently available evidence references.")
        problems = {p.problem_id: p for p in (*state.active_problems, *state.suspended_problems, *state.resolved_problems)}
        if candidate.relation in {RelationType.START, RelationType.BRANCH}:
            if not candidate.problem_id or candidate.problem_id in problems or not candidate.new_problem_label:
                veto("invalid_branch", "BRANCH requires a new stable problem ID and explicit clinical label.")
            if candidate.relation == RelationType.BRANCH and candidate.parent_problem_id not in problems:
                veto("invalid_branch_parent", "BRANCH requires an existing parent problem.")
        elif candidate.problem_id is not None and candidate.problem_id not in problems:
            veto("unknown_problem", "Candidate refers to an unknown problem.")
        if candidate.relation == RelationType.CONSULT and candidate.action_type != ActionType.CONSULT:
            veto("consult_action_mismatch", "CONSULT relation requires a CONSULT action.")
        if candidate.action_type == ActionType.CONSULT and candidate.relation not in {RelationType.CONSULT, RelationType.BRANCH}:
            veto("consult_relation_mismatch", "A consultation must explicitly preserve ownership using CONSULT.")
        if candidate.relation == RelationType.TRANSFER and candidate.action_type != ActionType.TRANSFER:
            veto("transfer_action_mismatch", "TRANSFER relation requires a TRANSFER action.")
        if candidate.action_type == ActionType.TRANSFER and candidate.relation != RelationType.TRANSFER:
            veto("transfer_relation_mismatch", "Management takeover must use TRANSFER.")
        if candidate.action_type in {ActionType.CONSULT, ActionType.TRANSFER} and (not candidate.specialty or not candidate.problem_id):
            veto("missing_ownership_context", "Specialty interaction requires a problem and explicit destination specialty.")
        if candidate.relation == RelationType.RETURN:
            if candidate.action_type != ActionType.REASSESS or candidate.reintegration_target_id not in problems:
                veto("invalid_return", "RETURN requires a new reassessment and an existing integration target problem.")
        if graph_validation:
            try:
                apply_candidate(state, candidate)
            except ValueError:
                veto("invalid_graph_transition", "Proposed clinical graph transition violates domain semantics.")
        if clinical_rules:
            if candidate.contraindications:
                veto("contraindication", "Unresolved contraindications require physician reconsideration.")
            if candidate.prerequisites:
                veto("unmet_prerequisites", "Documented action prerequisites remain unresolved.")
            risk = set(state.risk_flags)
            urgent = bool(risk & {"acute_deterioration", "unstable", "requires_escalation"})
            if urgent and candidate.action_type == ActionType.DISCHARGE_FOLLOWUP:
                veto("premature_discharge", "Discharge is blocked while explicit instability/escalation flags remain active.")
            if "requires_escalation" in risk and candidate.action_type not in {ActionType.TRANSFER, ActionType.CONSULT, ActionType.REASSESS}:
                veto("missed_escalation", "An active escalation requirement must be addressed before routine actions.")
            if candidate.action_type == ActionType.PROCEDURE and (candidate.assessment.clinical_benefit.value == "UNKNOWN" or candidate.assessment.harm.value == "UNKNOWN"):
                veto("unassessed_invasive_action", "Invasive action requires explicit benefit and harm assessment.")
        return SafetyAssessment(candidate_id=candidate.candidate_id, findings=tuple(findings))
