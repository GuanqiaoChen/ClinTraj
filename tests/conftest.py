"""Tests have no network capability, including optional provider/telemetry clients."""

import os
import socket

import pytest

os.environ["LANGCHAIN_TRACING_V2"] = "false"
os.environ["LANGSMITH_TRACING"] = "false"
os.environ["CLINTRAJ_ALLOW_EXTERNAL_MODELS"] = "false"


@pytest.fixture(autouse=True)
def forbid_network(monkeypatch):
    def denied(*args, **kwargs):
        raise AssertionError("Automated tests must not transmit data")
    monkeypatch.setattr(socket.socket, "connect", denied)
    monkeypatch.setattr(socket, "create_connection", denied)
