"""Executable offline experiments on an explicitly synthetic workflow fixture."""

import hashlib
from importlib.resources import files
from pathlib import Path
from typing import Any

from clintraj.agents.coordinator import ClinicalCoordinator, RuntimeConfig
from clintraj.agents.schemas import PhysicianDecision, PhysicianResponse
from clintraj.domain.action_types import ActionType
from clintraj.domain.clinical_state import ClinicalState
from clintraj.domain.decision_graph import ClinicalDecisionGraph
from clintraj.domain.relation_types import RelationType
from clintraj.domain.schemas import GoldenEdge, GoldenNode
from clintraj.environment.replay import PatientReplayEnvironment
from clintraj.models.mock import DeterministicMockAdapter
from clintraj.runtime.langgraph_runtime import LangGraphRuntimeAdapter
from clintraj.utils.reproducibility import run_manifest, write_aggregate_run

from .metrics import StepEvaluation, evaluate_steps
from .protocol import ExperimentConfig

# This is a public engineering fixture action, shared intentionally with the mock.
# The resulting exact-match score verifies wiring; it is not a clinical performance result.
FIXTURE_ACTION = "Ask the treating physician to reassess the currently available evidence."


def synthetic_reference() -> ClinicalDecisionGraph:
    return ClinicalDecisionGraph(
        nodes=tuple(GoldenNode(case_id="SYNTHETIC-WORKFLOW-ONLY", step_id=step,
            new_evidence=f"Synthetic observation {step}: a staged workflow datum is available.",
            action_type=ActionType.REASSESS, action=FIXTURE_ACTION,
            clinical_rationale="Synthetic reference rationale; evaluator only.") for step in range(1, 4)),
        edges=(GoldenEdge(child_step_id=1, relation=RelationType.START),
               GoldenEdge(parent_step_id=1, child_step_id=2, relation=RelationType.CONTINUE),
               GoldenEdge(parent_step_id=2, child_step_id=3, relation=RelationType.CONTINUE)))


def build_workflow(config: ExperimentConfig):
    config.assert_supported()
    runtime_fields = RuntimeConfig.model_fields.keys()
    runtime_config = RuntimeConfig.model_validate({key: value for key, value in config.model_dump().items()
                                                   if key in runtime_fields})
    model = DeterministicMockAdapter()
    # These are fixture identifiers. No real-patient pseudonym key is bundled in source.
    environment = PatientReplayEnvironment(synthetic_reference(), pseudonym_key=b"synthetic-only")
    coordinator = ClinicalCoordinator(model, runtime_config)
    metadata = model.metadata
    expected = (config.provider, config.model, config.model_version, config.temperature,
                config.model_seed)
    effective = (metadata.provider, metadata.model_identifier, metadata.model_version,
                 metadata.temperature, metadata.seed)
    if expected != effective:
        raise ValueError("Experiment config does not match the effective local model metadata")
    if {agent.version for agent in coordinator.agents.values()} != {config.prompt_version}:
        raise ValueError("Configured prompt version does not match packaged prompt artifacts")
    if config.dynamic_graph and config.graph_semantics and config.structured_state:
        executor = environment.graph_executor
    else:
        # Representation ablations execute the same action/evidence protocol without a
        # runtime problem graph. Provenance and physician boundaries remain active.
        executor = environment.executor
    runtime = LangGraphRuntimeAdapter(coordinator, executor)
    return model, environment, runtime


def run_synthetic_experiment(config: ExperimentConfig, *, output_directory: Path) -> Path:
    """Automated physician responses are explicitly synthetic test fixtures only."""
    model, environment, runtime = build_workflow(config)
    config.assert_supported()
    state = runtime.start(environment.observe(), "synthetic-experiment")
    rows: list[StepEvaluation] = []
    for _ in range(config.max_steps):
        recommendation = state["recommendation"]
        selected = next((candidate for candidate in recommendation["candidates"]
                         if candidate["candidate_id"] == recommendation["selected_candidate_id"]), None)
        predicted_type = selected["action_type"] if selected else None
        state = runtime.resume("synthetic-experiment", PhysicianDecision(response=PhysicianResponse.ACCEPT,
            recommendation_id=recommendation["recommendation_id"],
            physician_ref="synthetic-physician-fixture", rationale="Automated engineering test only."))
        executed = state["status"] == "executed"
        rows.append(StepEvaluation(case_ref="synthetic", reference_type=ActionType.REASSESS,
            predicted_type=predicted_type,
            top_k_types=tuple(c["action_type"] for c in recommendation["candidates"]),
            exact_action_match=bool(selected and selected["action"] == FIXTURE_ACTION),
            completed=environment.complete,
            reference_relation=RelationType.START if len(rows) == 0 else RelationType.CONTINUE,
            predicted_relation=selected["relation"] if selected else None))
        if not executed or environment.complete:
            break
        state = runtime.advance("synthetic-experiment")
    prompts = files("configs.prompts")
    reference_hash = hashlib.sha256(synthetic_reference().model_dump_json().encode()).hexdigest()
    manifest = run_manifest(config=config.model_dump(mode="json"), prompt_directory=prompts,
        dataset_hash=reference_hash, model_metadata=model.metadata.model_dump(mode="json"))
    results: dict[str, Any] = {
        "purpose": "synthetic wiring verification; no clinical efficacy estimate",
        "physician_responses": "automated synthetic fixture",
        "completed_steps": environment.completed_steps, "trajectory_complete": environment.complete,
        "model_calls": len(model.calls), "roles_invoked": model.calls,
        "effective_prompt_versions": {role: agent.version for role, agent in runtime.coordinator.agents.items()},
        "tokens": None, "token_status": "not_applicable_mock",
        "metrics": {key: value.model_dump() for key, value in evaluate_steps(rows).items()},
        "final_graph_events": len(ClinicalState.model_validate(state["clinical_state"]).clinical_graph),
    }
    return write_aggregate_run(output_directory, manifest, results)
