import hashlib
import importlib.metadata
import json
import platform
import subprocess
import uuid
from datetime import datetime, timezone
from importlib.resources.abc import Traversable
from pathlib import Path
from typing import Any


def file_hash(path: Traversable) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_manifest(*, config: dict[str, Any], prompt_directory: Traversable,
                 dataset_hash: str, model_metadata: dict[str, Any]) -> dict[str, Any]:
    """Synthetic-run metadata without case IDs, observations, prompts, or responses.

    This helper is used only by the bundled synthetic runner; an external-model runner
    must use a separately reviewed manifest policy and accurately report transmission.
    """
    source_root = Path(__file__).resolve().parents[2]
    git_commit: str | None = None
    git_dirty: bool | None = None
    if source_root.joinpath(".git").exists():
        try:
            git = subprocess.run(["git", "rev-parse", "HEAD"], cwd=source_root,
                                 capture_output=True, text=True, check=False)
            dirty = subprocess.run(["git", "status", "--porcelain"], cwd=source_root,
                                   capture_output=True, text=True, check=False)
            git_commit = git.stdout.strip() if git.returncode == 0 else None
            git_dirty = bool(dirty.stdout.strip()) if dirty.returncode == 0 else None
        except OSError:
            pass
    source_hash = hashlib.sha256()
    source_files = [*source_root.joinpath("clintraj").rglob("*.py"),
                    *source_root.joinpath("configs").rglob("*.py"),
                    *source_root.joinpath("configs").rglob("*.yaml")]
    source_files += [path for name in ("pyproject.toml", "requirements.lock", "Dockerfile")
                     if (path := source_root / name).is_file()]
    for path in sorted(source_files):
        source_hash.update(path.relative_to(source_root).as_posix().encode())
        source_hash.update(path.read_bytes())
    return {
        "run_id": str(uuid.uuid4()), "created_at": datetime.now(timezone.utc).isoformat(),
        "python": platform.python_version(), "platform": platform.platform(),
        "dependencies": {d.metadata["Name"]: d.version for d in importlib.metadata.distributions()},
        "git_commit": git_commit, "git_dirty": git_dirty, "source_sha256": source_hash.hexdigest(),
        "source_hash_scope": "source_checkout" if source_root.joinpath("pyproject.toml").is_file()
                             else "installed_package",
        "source_artifact_count": len(source_files),
        "dataset_sha256": dataset_hash,
        "config": config, "config_sha256": hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest(),
        "model": model_metadata,
        "prompt_sha256": {p.name: file_hash(p) for p in sorted(prompt_directory.iterdir(), key=lambda item: item.name)
                          if p.name.endswith(".yaml")},
        "external_calls": False, "data_classification": "synthetic",
    }


def write_aggregate_run(directory: Path, manifest: dict[str, Any],
                        results: dict[str, Any]) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    output = directory / f"{manifest['run_id']}.json"
    output.write_text(json.dumps({"manifest": manifest, "aggregate_results": results},
                                 indent=2, ensure_ascii=False), encoding="utf-8")
    return output
