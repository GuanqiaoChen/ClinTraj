"""Reference DAG integrity and a separate observed runtime graph.

Source graphs cannot prove problem ownership without annotations. Runtime events carry
explicit ownership and problem identity; their semantics are enforced by the manager.
"""

from pydantic import Field, model_validator

from .action_types import ActionType
from .relation_types import RelationType
from .schemas import GoldenEdge, GoldenNode, StrictModel


class GraphValidationError(ValueError):
    """A structural invariant failed; messages intentionally exclude clinical text."""


class ClinicalDecisionGraph(StrictModel):
    nodes: tuple[GoldenNode, ...]
    edges: tuple[GoldenEdge, ...]

    @model_validator(mode="after")
    def check_graph(self) -> "ClinicalDecisionGraph":
        self.validate_integrity()
        return self

    @property
    def case_id(self) -> str:
        return self.nodes[0].case_id

    def node(self, step_id: int) -> GoldenNode:
        for node in self.nodes:
            if node.step_id == step_id:
                return node
        raise KeyError("Unknown step")

    def ordered_nodes(self) -> tuple[GoldenNode, ...]:
        return tuple(sorted(self.nodes, key=lambda node: node.step_id))

    def validate_integrity(self) -> None:
        if not self.nodes:
            raise GraphValidationError("Empty graph")
        ids = {node.step_id for node in self.nodes}
        if len(ids) != len(self.nodes):
            raise GraphValidationError("Duplicate step IDs")
        if len({node.case_id for node in self.nodes}) != 1:
            raise GraphValidationError("A graph must contain exactly one case")
        edge_keys = {(e.parent_step_id, e.child_step_id, e.relation) for e in self.edges}
        if len(edge_keys) != len(self.edges):
            raise GraphValidationError("Duplicate edges")
        incoming: dict[int, list[GoldenEdge]] = {step: [] for step in ids}
        starts: set[int] = set()
        for edge in self.edges:
            if edge.child_step_id not in ids:
                raise GraphValidationError("Orphan edge child")
            incoming[edge.child_step_id].append(edge)
            if edge.relation == RelationType.START:
                starts.add(edge.child_step_id)
            else:
                if edge.parent_step_id not in ids:
                    raise GraphValidationError("Missing parent node")
                if edge.parent_step_id is None or edge.parent_step_id >= edge.child_step_id:
                    raise GraphValidationError("Backward edge or cycle; RETURN must be forward")
        if not starts:
            raise GraphValidationError("Graph requires START")
        for step, edges in incoming.items():
            if not edges:
                raise GraphValidationError("Orphan node without incoming edge")
            if step in starts and len(edges) != 1:
                raise GraphValidationError("START node cannot also have a clinical parent")
        # Strictly increasing IDs imply acyclicity. Reachability is still checked explicitly.
        reached = set(starts)
        for node in self.ordered_nodes():
            if node.step_id not in starts:
                if not all(e.parent_step_id in reached for e in incoming[node.step_id]):
                    raise GraphValidationError("Node not reachable from START")
                reached.add(node.step_id)


class DecisionEvent(StrictModel):
    """An observed recommendation/execution event, never a hidden gold node."""

    event_id: str = Field(min_length=1)
    clock: int = Field(ge=0, strict=True)
    problem_id: str = Field(min_length=1)
    owner: str = Field(min_length=1)
    action_type: ActionType
    relation: RelationType
    parent_event_ids: tuple[str, ...] = ()
    evidence_ids: tuple[str, ...] = ()
    rationale: str = Field(min_length=1)
    advisory_specialty: str | None = None


class ObservedDecisionGraph(StrictModel):
    events: tuple[DecisionEvent, ...] = ()

    @model_validator(mode="after")
    def integrity(self) -> "ObservedDecisionGraph":
        seen: dict[str, DecisionEvent] = {}
        for event in self.events:
            if event.event_id in seen:
                raise GraphValidationError("Duplicate runtime event")
            if len(set(event.parent_event_ids)) != len(event.parent_event_ids):
                raise GraphValidationError("Duplicate runtime parents")
            if event.relation == RelationType.START:
                if event.parent_event_ids:
                    raise GraphValidationError("START cannot have parents")
            elif not event.parent_event_ids:
                raise GraphValidationError("Non-START event requires a parent")
            for parent in event.parent_event_ids:
                if parent not in seen:
                    raise GraphValidationError("Runtime parent missing or backward")
                if seen[parent].clock >= event.clock:
                    raise GraphValidationError("Runtime edges must advance time")
            seen[event.event_id] = event
        return self
