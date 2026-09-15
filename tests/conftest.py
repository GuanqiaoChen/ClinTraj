"""Tests have no network capability, including optional provider/telemetry clients."""

import os
import socket
from urllib.parse import urlparse

import pytest

os.environ["LANGCHAIN_TRACING_V2"] = "false"
os.environ["LANGSMITH_TRACING"] = "false"
os.environ["CLINTRAJ_ALLOW_EXTERNAL_MODELS"] = "false"


@pytest.fixture(autouse=True)
def forbid_network(monkeypatch, request):
    original_connect = socket.socket.connect
    original_create_connection = socket.create_connection
    integration = os.getenv("CLINTRAJ_INTEGRATION") == "1" and request.node.get_closest_marker("services") is not None
    service_hosts = {"127.0.0.1", "::1", "localhost", "postgres", "neo4j"}
    if integration:
        configured_hosts = {urlparse(os.getenv(key, "")).hostname for key in ("DATABASE_URL", "NEO4J_URI")}
        for host in {"postgres", "neo4j"} & configured_hosts:
            try:
                service_hosts.update(info[4][0] for info in socket.getaddrinfo(host, None))
            except socket.gaierror:
                pass

    def allowed(address):
        return integration and isinstance(address, tuple) and address[0] in service_hosts and address[1] in {5432, 55432, 7687}

    def connect(sock, address):
        if allowed(address):
            return original_connect(sock, address)
        raise AssertionError("Automated tests must not transmit data outside local test services")

    def create_connection(address, *args, **kwargs):
        if allowed(address):
            return original_create_connection(address, *args, **kwargs)
        raise AssertionError("Automated tests must not transmit data outside local test services")

    monkeypatch.setattr(socket.socket, "connect", connect)
    monkeypatch.setattr(socket, "create_connection", create_connection)
