import json
from pathlib import Path

import pytest

from clintraj.evaluation.protocol import load_experiment
from clintraj.evaluation.runner import run_synthetic_experiment

CONFIGS = Path(__file__).resolve().parents[2] / "configs" / "experiments"


@pytest.mark.parametrize("name", ["single_llm", "single_llm_same_tools", "single_structured_state",
    "multi_agent_no_graph", "multi_agent_graph", "multi_agent_graph_safety"])
def test_six_baselines_execute_with_effective_role_and_graph_differences(name, tmp_path):
    config = load_experiment(CONFIGS / f"{name}.yaml")
    artifact = run_synthetic_experiment(config, output_directory=tmp_path)
    data = json.loads(artifact.read_text(encoding="utf-8"))
    results = data["aggregate_results"]
    assert results["trajectory_complete"]
    assert results["completed_steps"] == 3
    assert results["metrics"]["clinical_acceptability"]["value"] is None
    assert ("problem_manager" in results["roles_invoked"]) == config.multi_agent
    assert ("grounding" in results["roles_invoked"]) == config.retrieval
    assert ("safety_critic" in results["roles_invoked"]) == (config.multi_agent and config.safety_critic)
    assert (results["final_graph_events"] > 0) == config.dynamic_graph
    assert data["manifest"]["external_calls"] is False
    assert data["manifest"]["prompt_sha256"]
    assert "Synthetic observation" not in artifact.read_text()


def test_protocol_only_ablations_fail_explicitly(tmp_path):
    for name in ("without_temporal_gate_protocol_only", "without_clinician_intervention_protocol_only"):
        with pytest.raises(NotImplementedError):
            run_synthetic_experiment(load_experiment(CONFIGS / f"{name}.yaml"), output_directory=tmp_path)


def test_packaged_config_name_and_effective_metadata(tmp_path):
    config = load_experiment("multi_agent_graph_safety")
    artifact = run_synthetic_experiment(config, output_directory=tmp_path)
    data = json.loads(artifact.read_text(encoding="utf-8"))
    assert data["manifest"]["config"]["provider"] == data["manifest"]["model"]["provider"]
    assert data["manifest"]["config"]["model"] == data["manifest"]["model"]["model_identifier"]
    assert set(data["aggregate_results"]["effective_prompt_versions"].values()) == {config.prompt_version}
