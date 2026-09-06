from .schemas import StrictModel


class OwnershipChange(StrictModel):
    problem_id: str
    previous_owner: str
    new_owner: str
    event_id: str
    clock: int
    reason: str
