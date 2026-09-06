"""Provider-neutral structured output contract and opt-in network boundary."""

import json
from collections.abc import Callable
from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict, Field


class ModelMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    provider: str
    model_identifier: str
    model_version: str | None = None
    temperature: float = Field(default=0.0, ge=0)
    seed: int | None = 0


class ModelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    role: str
    prompt_version: str
    instructions: str
    payload: dict[str, Any]
    output_schema: dict[str, Any]


class ModelAdapter(Protocol):
    metadata: ModelMetadata

    def generate(self, request: ModelRequest) -> str:
        """Return exactly one JSON object, without Markdown or hidden tool calls."""
        ...


class ExternalTransmissionDenied(PermissionError):
    pass


class ExternalJSONAdapter:
    """Inject an audited provider transport; bundled code has no provider client.

    Both consent switches are deliberately false. A de-identified case reference
    does not prove free-text evidence is free of PHI. No automatic retries or raw
    payload logging are performed. Provider credentials belong in the transport's
    environment, never in prompts or this repository.
    """

    def __init__(
        self,
        transport: Callable[[ModelRequest], str],
        metadata: ModelMetadata,
        *,
        allow_external_calls: bool = False,
        allow_clinical_data_transmission: bool = False,
    ) -> None:
        self.transport = transport
        self.metadata = metadata
        self.allow_external_calls = allow_external_calls
        self.allow_clinical_data_transmission = allow_clinical_data_transmission

    def generate(self, request: ModelRequest) -> str:
        if not (self.allow_external_calls and self.allow_clinical_data_transmission):
            raise ExternalTransmissionDenied("External clinical model calls require both explicit opt-ins")
        response = self.transport(request)
        if not isinstance(response, str) or not isinstance(json.loads(response), dict):
            raise ValueError("Provider transport must return a JSON object string")
        return response
