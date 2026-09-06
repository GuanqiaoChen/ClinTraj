"""Versioned role prompts and strict structured-output validation."""

import hashlib
import json
from importlib.resources.abc import Traversable
from typing import TypeVar

import yaml
from pydantic import BaseModel

from clintraj.models.base import ModelAdapter, ModelRequest

T = TypeVar("T", bound=BaseModel)


class StructuredOutputError(ValueError):
    """Model output was rejected without echoing potentially identifying text."""


class RoleAgent:
    def __init__(self, role: str, model: ModelAdapter, prompt_directory: Traversable) -> None:
        self.role = role
        self.model = model
        path = prompt_directory / f"{role}.yaml"
        content = path.read_bytes()
        prompt = yaml.safe_load(content.decode("utf-8"))
        if not isinstance(prompt, dict) or not all(key in prompt for key in ("role", "version", "instructions")):
            raise ValueError(f"Invalid prompt artifact: {path.name}")
        if prompt["role"] != role:
            raise ValueError("Prompt role mismatch")
        self.version = str(prompt["version"])
        self.instructions = str(prompt["instructions"])
        self.content_sha256 = hashlib.sha256(content).hexdigest()

    def run(self, payload: dict, response_type: type[T]) -> T:
        request = ModelRequest(role=self.role, prompt_version=self.version, instructions=self.instructions,
                               payload=payload, output_schema=response_type.model_json_schema())
        output = self.model.generate(request)
        try:
            if not isinstance(json.loads(output), dict):
                raise ValueError("Expected object")
            return response_type.model_validate_json(output)
        except (ValueError, TypeError):
            raise StructuredOutputError(f"Invalid structured output from role {self.role}") from None
