import sys

import pytest

from clintraj.cli import main


@pytest.mark.parametrize("arguments", [
    ["clintraj", "experiment", "--config", "missing_config"],
    ["clintraj", "experiment", "--config", "without_temporal_gate_protocol_only"],
    ["clintraj", "inspect", "missing.xlsx"],
])
def test_expected_cli_failures_are_concise(monkeypatch, capsys, arguments):
    monkeypatch.setattr(sys, "argv", arguments)
    with pytest.raises(SystemExit) as error:
        main()
    assert error.value.code == 2
    assert "Traceback" not in capsys.readouterr().err
