"""Malformed-input tests use synthetic cells only, never patient records."""

import pytest

from clintraj.data import DataValidationError, load_workbook
from clintraj.data.excel_loader import parse_record
from clintraj.data.review import DecisionRating, RationaleRating


def record():
    return [
        "SYNTHETIC_CASE", 1, None, "START", "ASK_HISTORY",
        "Synthetic initial evidence", "Synthetic history request",
        "Synthetic reference justification", None, None, None, None,
    ]


def test_missing_review_is_allowed_and_golden_schema_stays_minimal():
    node, edge, review = parse_record(tuple(record()), row_number=3)
    assert not review.is_complete
    assert not review.has_annotation
    assert edge.parent_step_id is None
    assert set(node.model_dump()) == {
        "case_id", "step_id", "new_evidence", "action_type", "action", "clinical_rationale"
    }


@pytest.mark.parametrize("column,value", [
    (1, True), (1, 1.5), (1, "1"), (1, -1), (2, 0),
    (3, "UNREVIEWED_NEW_RELATION"), (4, "DISCHARGE"),
    (0, None), (5, None), (6, ""), (7, 4), (8, 4), (8, True),
])
def test_invalid_cells_fail_with_safe_row_diagnostic(column, value):
    values = record()
    values[column] = value
    with pytest.raises(DataValidationError) as failure:
        parse_record(tuple(values), row_number=7)
    assert failure.value.row == 7
    assert "SYNTHETIC_CASE" not in str(failure.value)
    assert "Synthetic initial evidence" not in str(failure.value)


def test_review_revisions_are_retained_separately_and_not_applied_to_source():
    values = record()
    values[8:] = [3, "Synthetic revised action", 2, "Synthetic revised rationale"]
    node, _, review = parse_record(tuple(values), row_number=3)
    assert review.is_complete
    assert review.decision_rating == DecisionRating.INCORRECT
    assert review.rationale_rating == RationaleRating.PARTIAL
    assert review.revised_action == "Synthetic revised action"
    assert node.action == "Synthetic history request"
    assert node.clinical_rationale == "Synthetic reference justification"


@pytest.mark.parametrize("review_values", [[3, None, None, None], [1, None, 2, None]])
def test_explicit_incorrect_review_requires_revision(review_values):
    values = record()
    values[8:] = review_values
    with pytest.raises(DataValidationError, match="invalid_canonical_record_or_review"):
        parse_record(tuple(values), row_number=3)


def test_unreadable_workbook_does_not_expose_path_or_record_values(tmp_path):
    source = tmp_path / "SYNTHETIC_PRIVATE_NAME.xlsx"
    source.write_bytes(b"not an Excel workbook")
    with pytest.raises(DataValidationError) as failure:
        load_workbook(source)
    assert str(failure.value) == "unreadable_workbook"
