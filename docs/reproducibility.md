# Reproducibility guide

This guide separates three reproducibility targets:

1. **Software behavior** uses only synthetic fixtures and requires no clinical data or external model.
2. **Source-graph fidelity** additionally requires the controlled local workbook.
3. **Clinical or model performance** is not reproduced by this repository because there are no completed clinician labels, evaluated foundation-model runs, or prospective outcomes.

## Environment construction

The project requires Python 3.11 or later and was checked with Python 3.11.9. `requirements.lock` pins the validated Python environment, including test and static-analysis tools. `pyproject.toml` pins the build backend and declares the smaller runtime dependency set.

From the repository root:

```bash
python -m venv .venv
source .venv/bin/activate  # Linux/macOS
python -m pip install -r requirements.lock
python -m pip install --no-deps -e .
python -m pip check
```

PowerShell activation is:

```powershell
.venv\Scripts\Activate.ps1
```

The second install uses the already pinned dependencies and installs the local console package without resolving a second dependency set. Building the pinned backend in an isolated build environment may require package-index access on first use.

For a distributable wheel:

```bash
python -m pip wheel --no-deps --wheel-dir dist .
```

## Data availability and integrity

The controlled workbook and reference image are excluded by `.gitignore` and `.dockerignore`. Technical unit, integration, and leakage tests run without them. Tests in `tests/golden_cases/test_source_trajectories.py` skip when `./医生审核版.xlsx` is missing.

To reproduce source-graph checks:

1. Obtain the workbook through the project's authorized data channel.
2. Place it at `./医生审核版.xlsx` without editing it.
3. Verify that its SHA-256 is `23e067a5de05a5fe119a541cf90fcc2f40399b5b538131058f4a939497a2741d`.
4. Run the aggregate inspection and selected-case tests.

```bash
python -m clintraj inspect "医生审核版.xlsx"
python -m pytest tests/golden_cases/test_source_trajectories.py -q
```

The loader opens the workbook read-only, expects the `待标注数据` worksheet, preserves source values, and reports validation issues rather than silently repairing them. Validation events replace raw source IDs with load-local ordinal references such as `case_0001`; these support anomaly location within a report but are not cryptographic de-identification and must not be treated as longitudinal patient tokens. The source has ordinal step order but no verified evidence-release timestamps; replay therefore treats each row's new evidence as visible immediately before that row's decision. This assumption must remain explicit in any analysis.

The five selected cases are examples used both for exact source-graph tests and for separate synthetic semantics tests. The synthetic tests do not replace or relabel the source graph. Detailed discrepancies are recorded in [data_inspection.md](data_inspection.md).

## Verification commands

Run:

```bash
python -m pytest
python -m ruff check .
python -m mypy clintraj
```

At the time this guide was written, the repository produced:

- 94 passing tests with the controlled workbook present;
- no Ruff findings;
- no MyPy findings in the 40 production modules.

The configured MyPy command intentionally targets `clintraj`. The test suite executes successfully at runtime, but `python -m mypy clintraj tests` currently reports test-fixture typing errors and is not a passing project check.

## Deterministic synthetic workflow

The non-interactive smoke test is:

```bash
python -m clintraj demo --decision reject --steps 1
```

The executable experiment command is:

```bash
python -m clintraj experiment \
  --config multi_agent_graph_safety \
  --output experiments/runs
```

Each run uses a fixed synthetic three-step reference and the local deterministic adapter. The reference and adapter intentionally share a public reassessment action, so exact agreement establishes wiring only. A unique run ID and UTC timestamp make output filenames and manifests differ between runs; with the same source, environment, and configuration, the aggregate fixture behavior should agree.

## Experiment configurations

The six baseline-family configurations are:

| Configuration | Executed representation/role change |
|---|---|
| `single_llm.yaml` | One action-generation call with unstructured observable input; no retrieval or dynamic graph |
| `single_llm_same_tools.yaml` | One action-generation call plus local retrieval/grounding; no structured state or graph |
| `single_structured_state.yaml` | One action-generation call plus structured state and retrieval; no dynamic graph |
| `multi_agent_no_graph.yaml` | Multi-role workflow without graph, ownership, specialist, information-gain, or safety-critic context |
| `multi_agent_graph.yaml` | Dynamic-graph multi-agent workflow with the independent model safety critic disabled |
| `multi_agent_graph_safety.yaml` | Full configured workflow including dynamic graph and independent model safety critique |

Executable component ablations are `without_specialist_routing.yaml`, `without_information_gain.yaml`, `without_safety_critic.yaml`, `without_explicit_ownership.yaml`, and `without_graph_semantics.yaml`. They keep temporal gating and physician approval active. An ablation changes agent inputs or invoked roles; it does not remove final deterministic validation or permit autonomous execution.

`without_temporal_gate_protocol_only.yaml` and `without_clinician_intervention_protocol_only.yaml` are intentionally unsupported protocol declarations. The physician CLI exits with an explicit unsupported-protocol error; there is no silent fallback. A future offline evaluator may implement these research comparisons without weakening the physician runtime.

All bundled configurations use the same synthetic fixture. They enable experiment plumbing but do not supply evidence that multi-agent decomposition, graph semantics, specialist routing, or the safety critic improves clinical performance. A comparative study must pre-register case/patient-level splits, model and tool budgets, repeat seeds where stochastic, clinician equivalence labels, exclusion and failure rules, and uncertainty intervals.

## Run artifacts

The experiment runner writes one JSON object with `manifest` and `aggregate_results`. The manifest records:

- a UUID run ID and UTC creation time;
- Python, platform, and installed distribution versions;
- available Git commit and dirty-worktree status;
- a hash over the available Python source and YAML configurations, plus package metadata, dependency lock, and Dockerfile when running from a checkout that contains them;
- the source-hash scope (`source_checkout` or `installed_package`) and artifact count;
- the effective configuration and its hash;
- the synthetic reference hash;
- model-adapter metadata;
- per-file prompt SHA-256 hashes;
- an explicit `external_calls: false` and `data_classification: synthetic` declaration.

Aggregate results contain only fixture purpose, simulated physician-response status, completed-step counts, invoked role names, effective prompt versions, unavailable token status, aggregate metrics, and the final graph-event count. They do not contain source workbook narratives, case identifiers, prompts, model requests, or model responses.

The exact source-hash coverage depends on the installed artifact: a normal wheel contains the Python packages and packaged YAML files but not the repository-level lock file or Dockerfile. Hashes from a wheel and a checkout are therefore not directly comparable. The source hash is useful for detecting method-code changes within one installation mode but is not a complete repository or container digest. Archive the Git commit, dirty diff if any, `pyproject.toml`, `requirements.lock`, Dockerfile, configuration files, run artifact, and data-governance approvals together for a study release.

## Prompt and model provenance

Role instructions live in `configs/prompts/*.yaml`. Recommendations record the version and content hash for every invoked role. Aggregate synthetic artifacts retain the effective prompt versions and hash every prompt file, including roles not invoked by an ablation. The runner validates the configured model identity, temperature, seed, and prompt version against the effective local adapter and packaged prompt artifacts before executing.

The bundled CLI supports only the deterministic local adapter. `ExternalJSONAdapter` is an injection boundary, not a configured provider client. It requires explicit constructor consent for both external calls and clinical-data transmission; environment variables in `.env.example` do not enable it. Adding OpenAI, Gemini, Anthropic, vLLM, tracing, or any other transport requires a separate governed runner, an audited payload policy, and accurate logging of what left the local environment.

## Docker reproduction

Build the Linux image and run the default offline rejection workflow:

```bash
docker build -t clintraj:0.1.0 .
docker run --rm clintraj:0.1.0
```

The image runs as an unprivileged user, disables LangSmith/LangChain tracing flags, and does not contain the ignored workbook or image. To persist synthetic experiment output, mount only the output directory:

```bash
mkdir -p experiments/runs
docker run --rm \
  -v "$(pwd)/experiments/runs:/app/experiments/runs" \
  clintraj:0.1.0 experiment \
  --config multi_agent_graph_safety \
  --output experiments/runs
```

If source inspection is authorized, mount the workbook read-only as shown in the root README. Do not bake controlled clinical data or secrets into an image.

The base image is version-tagged rather than digest-pinned, and `requirements.lock` pins versions without artifact hashes. The Docker workflow is therefore version-constrained but not byte-for-byte supply-chain reproducible. Record the resolved base-image digest and wheel hashes for an archival empirical release.

## Interpretation boundary

No command in this guide reproduces evidence of clinical utility. The missing requirements include completed clinician adjudication, validated acceptable alternatives, external-model evaluation, leakage review beyond exact-string screening, patient-level split verification across admissions, statistical comparison, external validation, prospective workflow evaluation, and deployment governance. Those are study requirements rather than hidden properties of successful software execution.
