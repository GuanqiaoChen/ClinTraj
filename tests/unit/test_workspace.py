import json

import pytest
from pydantic import ValidationError

from clintraj.models.base import ExternalTransmissionDenied, ModelRequest
from clintraj.models.mock import DeterministicMockAdapter
from clintraj.models.openai_compatible import OpenAICompatibleAdapter, local_endpoint
from clintraj.server.app import AddEvidence, NewSession
from clintraj.server.config import Settings
from clintraj.server.ingest import parse_hpo, parse_pmc
from clintraj.server.knowledge import EvidenceBundle, rrf
from clintraj.server.pipeline import LiveCoordinator
from clintraj.server.trace import TraceEvent


def test_cloud_consent_and_local_host_boundary():
    cfg = Settings(_env_file=None, deepseek_api_key="test-value")
    assert local_endpoint("http://localhost:11434/v1")
    assert local_endpoint("http://host.docker.internal:8001/v1")
    assert not local_endpoint("https://api.example.org/v1")
    with pytest.raises(ExternalTransmissionDenied):
        OpenAICompatibleAdapter(cfg, provider="deepseek")
    with pytest.raises(ExternalTransmissionDenied):
        OpenAICompatibleAdapter(cfg, provider="deepseek", consent=True)
    OpenAICompatibleAdapter(cfg, provider="deepseek", synthetic=True)
    with pytest.raises(ExternalTransmissionDenied):
        OpenAICompatibleAdapter(Settings(_env_file=None, local_model_url="https://example.org/v1"))


def test_structured_requests_reject_unknown_fields_and_invalid_clock():
    with pytest.raises(ValidationError):
        NewSession(title="a", evidence="b", problem="c", raw_chain_of_thought="no")
    with pytest.raises(ValidationError):
        AddEvidence(text="a", available_at=True)
    with pytest.raises(ValidationError):
        TraceEvent(type="CHAIN_OF_THOUGHT", agent="x")


def test_rrf_consensus_and_duplicate_protection():
    scores, channels = rrf({"lexical": ["A", "A", "B"], "dense": ["B", "C"], "graph": ["B"]})
    assert scores["B"] > scores["A"]
    assert channels["B"] == ["lexical", "dense", "graph"]
    assert scores["A"] == 1 / 61


def test_hpo_version_and_unmodified_relations():
    raw = 'data-version: hp/releases/test\n[Term]\nid: HP:1\nname: Fever\ndef: "Description" []\nis_a: HP:0 ! parent\n'
    version, terms = parse_hpo(raw)
    assert version == "hp/releases/test"
    assert terms[0]["metadata"]["parents"] == ["HP:0"]
    assert terms[0]["concept_ids"] == ["HP:1"]


def test_pmc_rejects_missing_and_restricted_license():
    with pytest.raises(ValueError):
        parse_pmc(b"<article><body><p>text</p></body></article>", "PMC1")
    with pytest.raises(ValueError):
        parse_pmc(b'<article><permissions><license>https://creativecommons.org/licenses/by-nc/4.0/</license></permissions></article>', "PMC1")


def test_mimic_adapter_preserves_actual_release_time_and_requires_local_files(tmp_path):
    from clintraj.server.mimic import read_mimic
    with pytest.raises(ValueError, match="missing"):
        list(read_mimic(tmp_path))
    (tmp_path / "admissions.csv").write_text("hadm_id,admittime,admission_type\n1,2020-01-01 01:00:00,EMERGENCY\n", encoding="utf-8")
    (tmp_path / "labevents.csv").write_text("hadm_id,itemid,charttime,storetime,value,valueuom\n"
        "1,100,2020-01-01 02:00:00,2020-01-01 04:00:00,1,unit\n"
        "1,101,2020-01-01 02:00:00,,2,unit\n"
        "1,102,2020-01-01 02:00:00,2020-01-01 01:00:00,3,unit\n", encoding="utf-8")
    records = list(read_mimic(tmp_path))
    assert len(records) == 1 and len(records[0].observations) == 1
    assert records[0].observations[0].available_at.hour == 4
    assert records[0].observations[0].observed_at.hour == 2
    assert records[0].admission_ref != "1"


def test_model_discards_reasoning_content(monkeypatch):
    class Response:
        status_code = 200

        def json(self):
            return {"choices": [{"finish_reason": "stop", "message": {"content": '{"ok":true}', "reasoning_content": "private hidden reasoning"}}]}

    monkeypatch.setattr("httpx.Client.post", lambda *args, **kwargs: Response())
    adapter = OpenAICompatibleAdapter(Settings(_env_file=None))
    output = adapter.generate(ModelRequest(role="test", prompt_version="1", instructions="Return JSON", payload={}, output_schema={}))
    assert json.loads(output) == {"ok": True}
    assert "reasoning" not in output


class EmptyRetriever:
    def retrieve_bundle(self, *args, **kwargs):
        return EvidenceBundle(embedding_model="test")


def test_pipeline_removes_fabricated_citations_without_suppressing_choices():
    from clintraj.domain.clinical_state import ClinicalState, Evidence
    from clintraj.domain.problem_manager import ClinicalProblemManager

    state = ClinicalState(case_ref="synthetic", available_evidence=(Evidence(evidence_id="E1", text="Synthetic observation", available_at=0, source="test"),))
    manager = ClinicalProblemManager(state)
    manager.create_problem("P1", "Synthetic problem", "primary_team", clock=0, rationale="test")
    state = manager.into_state(state)
    model = DeterministicMockAdapter({"action_generator": {"candidates": [{"candidate_id": "A", "action_type": "REASSESS", "action": "复评", "rationale": "测试", "problem_id": "P1"}], "candidate_citations": {"A": ["invented-source"]}}})
    events = []
    coordinator = LiveCoordinator(model, lambda *a: events.append(a), allow_private=False, retriever=EmptyRetriever())
    recommendation = coordinator.propose(state)
    assert len(recommendation.candidates) == 3
    assert recommendation.candidate_citations["A"] == ()
    assert any(e[2].get("code") == "fabricated_citation" for e in events)
def test_patient_reference_aliases_preserve_text_and_unknown_ids():
    from clintraj.server.pipeline import patient_reference_aliases

    original = {"state": {"available_evidence": [{"evidence_id": "patient-long-id", "text": "E1 is literal source text"}]},
        "evidence_ids": ["patient-long-id", "unknown-patient-id"], "candidate_citations": {"C1": ["K1"]}}
    compact = patient_reference_aliases(original, {"patient-long-id": "E1"})
    assert compact["state"]["available_evidence"][0]["evidence_id"] == "E1"
    assert compact["state"]["available_evidence"][0]["text"] == original["state"]["available_evidence"][0]["text"]
    assert compact["evidence_ids"] == ["E1", "unknown-patient-id"]
    assert compact["candidate_citations"] == {"C1": ["K1"]}
    assert patient_reference_aliases(compact, {"E1": "patient-long-id"}) == original
