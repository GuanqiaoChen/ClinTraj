from enum import StrEnum


class RelationType(StrEnum):
    START = "START"
    CONTINUE = "CONTINUE"
    BRANCH = "BRANCH"
    CONSULT = "CONSULT"
    TRANSFER = "TRANSFER"
    RETURN = "RETURN"
