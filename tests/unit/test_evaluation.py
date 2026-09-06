import pytest

from clintraj.evaluation.metrics import StepEvaluation, case_bootstrap_interval, evaluate_steps
from clintraj.evaluation.protocol import ExperimentConfig, case_split


def test_missing_annotations_are_not_failure_or_success():
    result = evaluate_steps([StepEvaluation(case_ref="test", reference_type="TEST", predicted_type="TEST")])
    assert result["action_type_agreement"].value == 1
    assert result["clinical_acceptability"].value is None
    assert result["clinical_acceptability"].denominator == 0
    assert result["unsafe_action_rate"].value is None


def test_acceptability_and_calibration_require_explicit_labels():
    result = evaluate_steps([StepEvaluation(case_ref="test", reference_type="TEST", predicted_type="TEST",
                            decision_correctness=2, confidence=.5)])
    assert result["clinical_acceptability"].value == 1
    assert result["clinician_correct"].value == 0
    assert result["brier_score"].value == .25


def test_splits_are_disjoint_reproducible_and_hold_exemplars_out():
    refs = tuple(f"synthetic-{i}" for i in range(100))
    split = case_split(refs, held_out_exemplars=frozenset({refs[0]}))
    assert split == case_split(tuple(reversed(refs)), held_out_exemplars=frozenset({refs[0]}))
    assert split["exemplars"] == (refs[0],)
    assert len(set(x for group in split.values() for x in group)) == 100
    assert sum(map(len, split.values())) == 100


def test_bootstrap_is_at_case_level_and_seeded():
    assert case_bootstrap_interval([.5]) is None
    assert case_bootstrap_interval([.1, .5, .9]) == case_bootstrap_interval([.1, .5, .9])


def test_unsafe_ablations_do_not_silently_run_full_model():
    with pytest.raises(NotImplementedError):
        ExperimentConfig(name="without_temporal", temporal_gating=False).assert_supported()


def test_relation_abstention_is_not_counted_as_a_correct_negative():
    result = evaluate_steps([StepEvaluation(case_ref="test", reference_type="TEST",
                                           reference_relation="CONTINUE")])
    assert result["branch_accuracy"].value == 0
    assert result["return_accuracy"].value == 0
    assert result["relation_prediction_coverage"].value == 0
