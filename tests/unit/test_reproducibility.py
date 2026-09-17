from importlib.resources import files

from clintraj.utils.reproducibility import run_manifest


def test_manifest_tolerates_missing_git_and_has_no_clinical_content(monkeypatch):
    def missing_git(*args, **kwargs):
        raise FileNotFoundError("git unavailable")

    monkeypatch.setattr("clintraj.utils.reproducibility.subprocess.run", missing_git)
    manifest = run_manifest(config={"name": "synthetic"},
        prompt_directory=files("configs.prompts"), dataset_hash="fixture-hash",
        model_metadata={"provider": "local_fixture"})
    assert manifest["git_commit"] is None
    assert manifest["git_dirty"] is None
    assert manifest["external_calls"] is False
    assert manifest["source_hash_scope"] in {"source_checkout", "installed_package"}
    assert manifest["source_artifact_count"] > 40
    assert set(manifest["prompt_sha256"]) == {p.name for p in files("configs.prompts").iterdir() if p.name.endswith(".yaml")}
    assert "available_evidence" not in str(manifest)
