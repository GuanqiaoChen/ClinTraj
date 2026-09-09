# ClinTraj

ClinTraj is an offline research framework for temporally grounded, physician-facing clinical decision support. It represents longitudinal care as an observable clinical state plus an append-only clinical decision graph, while LangGraph provides checkpointing and the human-review interruption lifecycle.

The repository is a technical and experimental foundation. Its bundled model is a deterministic synthetic fixture, not a clinical model. Passing the software tests does not establish clinical correctness, safety, utility, generalization, or superiority over a baseline.

## What is implemented

- strict action and relation ontologies;
- a framework-independent `ClinicalState`, `ClinicalDecisionGraph`, and `ClinicalProblemManager`;
- temporal evidence gating and conservative retrospective replay;
- structured agent roles, selective specialist routing, local retrieval, an independent safety critic, and an ordinal action-ranking policy;
- an explicit physician `ACCEPT` / `MODIFY` / `REJECT` boundary;
- a LangGraph runtime adapter with local in-memory checkpoints;
- source-workbook validation, five selected-case structural tests, leakage tests, and synthetic workflow tests;
- config-driven synthetic baselines and ablations with aggregate run manifests.
- a standalone interactive localhost demo with five synthetic scenarios, synchronized clinical and architecture graphs, and deterministic event replay.

Clinician annotations are not required to build or exercise these technical components. They are required for clinical correctness, acceptable-alternative, and rationale-quality endpoints; the supplied workbook has no completed review rows. See [data inspection](docs/data_inspection.md) for the source findings and limitations.

## Setup

Requirements:

- Python 3.11 (the checked environment uses Python 3.11.9);
- Git for source provenance when available;
- Docker only if using the container workflow.

Clone the repository, then create an isolated environment:

```bash
git clone https://github.com/GuanqiaoChen/ClinTraj.git
cd ClinTraj
```

```bash
python -m venv .venv
```

Activate it on Linux or macOS:

```bash
source .venv/bin/activate
```

Or activate it in PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

Then install:

```bash
python -m pip install -r requirements.lock
python -m pip install --no-deps -e .
python -m pip check
```

No credential is needed for the bundled workflows. `.env.example` documents reserved security and provider settings; the CLI does not automatically load that file and exposes only the local mock workflow.

## Verify the implementation

Run the behavioral suite and configured source checks:

```bash
python -m pytest
python -m ruff check .
python -m mypy clintraj
```

The real-source tests expect the access-controlled workbook at `./医生审核版.xlsx`. If it is absent, those tests skip and the synthetic semantic tests still run. With the workbook present, run its selected-case checks directly:

```bash
python -m pytest tests/golden_cases/test_source_trajectories.py -q
```

The workbook and reference image are intentionally ignored by Git and excluded from Docker build contexts.

## Inspect the local workbook

The inspection command reads the workbook without modifying it and emits aggregate structural metadata, a SHA-256 digest, and validation events with load-local ordinal case references instead of raw source IDs:

```bash
python -m clintraj inspect "医生审核版.xlsx"
```

For the inspected source version, the expected SHA-256 is `23e067a5de05a5fe119a541cf90fcc2f40399b5b538131058f4a939497a2741d`. Do not commit the workbook, patient narratives, or patient-level exports.

## Run the synthetic physician workflow

Start an interactive local workflow:

```bash
python -m clintraj demo
```

At each interruption, enter `ACCEPT`, `MODIFY`, or `REJECT`. A modification requires a complete `CandidateAction` JSON object. For a non-interactive smoke test:

```bash
python -m clintraj demo --decision reject --steps 1
```

This demo uses synthetic evidence, a deterministic local fixture, and an offline executor. It does not call an external model or perform an EHR action.

## Run the interactive browser demo

The standalone Next.js frontend requires Node.js 20.9 or later and npm:

```bash
cd web
npm ci
npm run dev
```

Open [http://localhost:3000/demo](http://localhost:3000/demo). Select a case and use playback, decision navigation, and graph controls to explore synchronized clinical and component activity. The frontend uses authored synthetic fixtures with IDs supplied by the demo brief, rather than source-workbook patient narratives. Its physician events are simulated, and no Python runtime, LLM, database, or clinical backend is connected.

Run `npm run lint`, `npm run type-check`, `npm run test`, and `npm run build` from `web/`. See [demo documentation](docs/demo.md) for controls, fixture provenance, the implemented architecture, and the future trace-source boundary.

## Run a synthetic experiment

Run the full method wiring configuration:

```bash
python -m clintraj experiment \
  --config multi_agent_graph_safety \
  --output experiments/runs
```

PowerShell accepts the same command on one line:

```powershell
python -m clintraj experiment --config multi_agent_graph_safety --output experiments/runs
```

The command writes one JSON artifact containing an environment/configuration manifest and aggregate synthetic results. The result verifies orchestration and ablation wiring; its exact-match metric is deliberately based on a shared public fixture and is not a clinical performance estimate.

Six baseline configurations and the executable component ablations live in `configs/experiments/`. The temporal-gate and clinician-intervention removal files are protocol declarations that fail explicitly in the physician-facing runner. See [reproducibility](docs/reproducibility.md) and [experiment protocols](experiments/README.md) before interpreting any run.

## Docker

Build and run the default synthetic rejection smoke test:

```bash
docker build -t clintraj:0.1.0 .
docker run --rm clintraj:0.1.0
```

Run a synthetic experiment and retain its aggregate output:

```bash
mkdir -p experiments/runs
docker run --rm \
  -v "$(pwd)/experiments/runs:/app/experiments/runs" \
  clintraj:0.1.0 experiment \
  --config multi_agent_graph_safety \
  --output experiments/runs
```

Mount source clinical data read-only only when local inspection is required; it is never copied into the image:

```bash
docker run --rm \
  -v "$(pwd)/医生审核版.xlsx:/data/source.xlsx:ro" \
  clintraj:0.1.0 inspect /data/source.xlsx
```

## Repository guide

- [Architecture](docs/architecture.md): method layers, data flow, agent contracts, safety boundary, runtime, and evaluation.
- [Interactive demo](docs/demo.md): localhost setup, replay controls, five synthetic scenarios, and frontend integration boundaries.
- [Clinical graph semantics](docs/clinical_graph_semantics.md): exact `CONTINUE`, `BRANCH`, `CONSULT`, `TRANSFER`, and `RETURN` invariants.
- [Data inspection](docs/data_inspection.md): workbook structure, five selected cases, source/image discrepancies, and replay assumptions.
- [Reproducibility](docs/reproducibility.md): environments, data integrity, experiment matrix, manifests, and known limits.
- [Methods draft](docs/methods_draft.md), [novelty statement](docs/novelty_statement.md), [reviewer red team](docs/reviewer_red_team.md), and [readiness audit](docs/top_journal_readiness_audit.md): publication-oriented method description and unresolved empirical requirements.

External model transport, production EHR execution, durable authenticated approvals, prospective evaluation, and claims of clinical benefit remain outside the bundled system.
