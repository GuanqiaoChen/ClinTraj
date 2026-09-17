"""Synthetic evidence is explicitly labeled, provenance-linked and session-isolated."""
from hashlib import sha256
from importlib.resources import files

from pydantic import Field

from clintraj.agents.base import RoleAgent
from clintraj.agents.schemas import Message
from clintraj.domain.clinical_state import ClinicalState, Evidence
from clintraj.models.openai_compatible import OpenAICompatibleAdapter

from .budget import bounded
from .config import settings


class SimulatedObservation(Message):
    text: str = Field(min_length=1, max_length=6000)
    uncertainty: tuple[str, ...] = ()


def simulate(state: ClinicalState, actions: list[str], run_id: str, *, model=None) -> Evidence:
    cfg = settings().model_copy(update={"local_model_name": settings().simulation_model,
                                       "model_timeout": settings().simulation_timeout})
    adapter = model or OpenAICompatibleAdapter(cfg, provider="local", synthetic=True)
    role = RoleAgent("evidence_simulator", adapter, files("configs.prompts"))
    mode = "model"
    failure = {}
    try:
        result = bounded(role.run, cfg.simulation_timeout, {
            "state": {"clock": state.clock, "available_evidence": [e.model_dump(mode="json") for e in state.available_evidence]},
            "accepted_actions": actions, "instruction": "生成下一步模拟观察，用中文。只模拟所选行动可能产生的信息。"}, SimulatedObservation)
        text = result.text
        if result.uncertainty:
            text += "\n模拟不确定性：" + "；".join(result.uncertainty)
    except Exception as exc:
        mode = "unavailable"
        failure = {"error_type": type(exc).__name__}
        text = "已记录所选决策：" + "；".join(actions) + "。模拟模型本轮未返回结果，检查与处置反应仍待观察。"
    return Evidence(evidence_id="sim-" + sha256(run_id.encode()).hexdigest()[:24],
        text="【模拟证据 · 非真实检查结果】\n" + text, source="simulated_model" if mode == "model" else "simulated_pending",
        available_at=state.clock, observed_at=state.clock, synthetic=True,
        provenance={"run_id": run_id, "model": adapter.metadata.model_identifier,
                    "prompt_version": role.version, "prompt_hash": role.content_sha256,
                    "generation_mode": mode, **failure})
