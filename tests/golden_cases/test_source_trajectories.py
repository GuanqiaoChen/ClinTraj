"""Source fidelity tests, intentionally distinct from conceptual scenario tests.

No patient narrative is copied into fixtures or assertion messages. Missing
physician annotations never prevent graph loading or execution of these tests.
"""

import hashlib
from pathlib import Path

import pytest

from clintraj.data.excel_loader import SOURCE_SHA256, load_workbook

SOURCE_STRUCTURES = {
    "5b6e050e83a4b6c025aec7dec0b8f752a5b590c6a12c6d84dca1edf1cfbbdf0a": (
        (1, None, "START", "ASK_HISTORY"),
        (2, 1, "CONTINUE", "EXAM"),
        (3, 2, "CONTINUE", "TEST"),
        (4, 3, "CONTINUE", "PROCEDURE"),
        (5, 4, "CONTINUE", "PATHOLOGY"),
        (6, 5, "CONTINUE", "REASSESS"),
        (7, 6, "CONTINUE", "DISCHARGE_FOLLOWUP"),
        (8, 7, "CONTINUE", "DISCHARGE_FOLLOWUP"),
    ),
    "e58643b89e1f64c313d6408dc900481839b300fd374b7883ecceb71f3718fa1d": (
        (1, None, "START", "ASK_HISTORY"),
        (2, 1, "CONTINUE", "EXAM"),
        (3, 2, "BRANCH", "TEST"),
        (4, 3, "BRANCH", "PROCEDURE"),
        (5, 4, "CONTINUE", "PATHOLOGY"),
        (6, 5, "CONTINUE", "TREATMENT"),
        (7, 6, "CONTINUE", "CONSULT"),
        (8, 7, "CONSULT", "REASSESS"),
        (9, 8, "CONTINUE", "DISCHARGE_FOLLOWUP"),
        (10, 9, "CONTINUE", "DISCHARGE_FOLLOWUP"),
    ),
    "50bcdce028b0502d7068618ddfedb74aa35d43d6beb4970d8e9bc5a8a0d8598c": (
        (1, None, "START", "ASK_HISTORY"),
        (2, 1, "CONTINUE", "EXAM"),
        (3, 2, "BRANCH", "TEST"),
        (4, 3, "CONTINUE", "TEST"),
        (5, 4, "CONTINUE", "CONSULT"),
        (6, 5, "CONSULT", "TRANSFER"),
        (7, 6, "TRANSFER", "TREATMENT"),
        (8, 7, "CONTINUE", "REASSESS"),
        (9, 6, "RETURN", "TRANSFER"),
        (10, 9, "TRANSFER", "TEST"),
        (11, 10, "CONTINUE", "PROCEDURE"),
        (12, 11, "CONTINUE", "REASSESS"),
        (13, 12, "CONTINUE", "PROCEDURE"),
        (14, 13, "CONTINUE", "DISCHARGE_FOLLOWUP"),
        (15, 14, "CONTINUE", "DISCHARGE_FOLLOWUP"),
    ),
    "898ef30e3401cad09142e6b89de4ce27de0e9845c08180cba61cd3c4d5979428": (
        (1, None, "START", "ASK_HISTORY"),
        (2, 1, "CONTINUE", "EXAM"),
        (3, 2, "CONTINUE", "TEST"),
        (4, 3, "CONTINUE", "TEST"),
        (5, 4, "BRANCH", "TEST"),
        (6, 3, "RETURN", "TREATMENT"),
        (7, 6, "CONTINUE", "TRANSFER"),
        (8, 5, "TRANSFER", "CONSULT"),
        (9, 7, "CONSULT", "TREATMENT"),
        (10, 9, "CONTINUE", "TEST"),
        (11, 10, "CONTINUE", "PROCEDURE"),
        (12, 8, "RETURN", "PATHOLOGY"),
        (13, 12, "CONTINUE", "DISCHARGE_FOLLOWUP"),
        (14, 13, "CONTINUE", "DISCHARGE_FOLLOWUP"),
    ),
    "e0dc8fce1628b3f2746d0b0f8ea22a1c96e860944c3d73d595a94deaa1bf4ad6": (
        (1, None, "START", "ASK_HISTORY"),
        (2, 1, "CONTINUE", "EXAM"),
        (3, 2, "CONTINUE", "TEST"),
        (4, 3, "CONTINUE", "TREATMENT"),
        (5, 4, "BRANCH", "TRANSFER"),
        (6, 5, "TRANSFER", "TRANSFER"),
        (7, 5, "TRANSFER", "TEST"),
        (8, 7, "CONTINUE", "TEST"),
        (9, 8, "CONTINUE", "TRANSFER"),
        (10, 9, "TRANSFER", "TRANSFER"),
        (11, 4, "TRANSFER", "TRANSFER"),
        (12, 11, "TRANSFER", "TEST"),
        (13, 12, "CONTINUE", "PROCEDURE"),
        (14, 13, "CONTINUE", "PATHOLOGY"),
        (15, 14, "CONTINUE", "TREATMENT"),
        (16, 10, "RETURN", "REASSESS"),
        (17, 15, "RETURN", "DISCHARGE_FOLLOWUP"),
        (18, 17, "CONTINUE", "DISCHARGE_FOLLOWUP"),
    ),
}


@pytest.fixture(scope="module")
def source_dataset():
    path = Path(__file__).resolve().parents[2] / "医生审核版.xlsx"
    if not path.is_file():
        pytest.skip("Local source workbook absent; synthetic semantic tests remain available")
    before = hashlib.sha256(path.read_bytes()).hexdigest()
    dataset = load_workbook(path)
    assert hashlib.sha256(path.read_bytes()).hexdigest() == before == SOURCE_SHA256
    return dataset


@pytest.mark.golden
@pytest.mark.parametrize("case_hash", SOURCE_STRUCTURES)
def test_five_source_graphs_are_preserved_and_forward(source_dataset, case_hash):
    graph = source_dataset.case_by_hash(case_hash)
    graph.validate_integrity()
    incoming = {edge.child_step_id: edge for edge in graph.edges}
    observed = tuple(
        (
            node.step_id,
            incoming[node.step_id].parent_step_id,
            incoming[node.step_id].relation.value,
            node.action_type.value,
        )
        for node in graph.ordered_nodes()
    )
    assert observed == SOURCE_STRUCTURES[case_hash]
    assert all(parent is None or parent < step for step, parent, _, _ in observed)


@pytest.mark.golden
def test_all_source_graphs_and_annotations_load_without_review_dependency(source_dataset):
    report = source_dataset.report
    assert (report.case_count, report.node_count) == (400, 3328)
    assert (report.reviewed_node_count, report.annotated_node_count) == (0, 0)
    assert len(source_dataset.graphs) == 400
    for graph in source_dataset.graphs:
        graph.validate_integrity()
    assert sum(report.action_counts.values()) == sum(report.relation_counts.values()) == 3328
    assert report.relation_counts == {
        "START": 400, "CONTINUE": 2205, "BRANCH": 408,
        "CONSULT": 34, "TRANSFER": 29, "RETURN": 252,
    }


@pytest.mark.golden
def test_case_two_disagreement_is_audited_without_inventing_a_return(source_dataset):
    graph = source_dataset.case_by_hash(
        "e58643b89e1f64c313d6408dc900481839b300fd374b7883ecceb71f3718fa1d"
    )
    assert all(edge.relation.value != "RETURN" for edge in graph.edges)
    assert all(node.action_type.value != "TRANSFER" for node in graph.nodes)
    assert any(
        event.code == "selected_case_2_missing_image_return"
        for event in source_dataset.report.events
    )


@pytest.mark.golden
def test_report_excludes_patient_ids_and_narratives(source_dataset):
    report = source_dataset.report.model_dump_json()
    assert all(case_hash not in report for case_hash in SOURCE_STRUCTURES)
    assert "new_evidence" not in report
    assert "clinical_rationale" not in report
    events = source_dataset.report.events
    assert sum(event.code == "skip_explicit_instruction_row" for event in events) == 1
    assert events[0].source_row == 2
