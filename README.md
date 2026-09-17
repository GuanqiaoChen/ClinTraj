# ClinTraj — physician-authoritative research workspace

A physician-facing research workspace: enter observations, receive three candidate decisions, accept one or more or write your own, and continue a persistent trajectory. Internal audits and native LangGraph events appear separately at `/observation`. The original research domain, five golden-case checks and `/demo` replay are preserved.

## Start

Requires Docker Desktop/Engine with Compose v2.24+, approximately 12 GB available RAM, and internet access for the first image/model/public-source download. Ports 3000, 8000, 55432, 7474, 7687 and 11434 bind to loopback only.

```bash
docker compose up --build
```

Open **[http://localhost:3000/workspace](http://localhost:3000/workspace)** for physician review and **[http://localhost:3000/observation](http://localhost:3000/observation)** for agent traces. `/` redirects there. [http://localhost:3000/demo](http://localhost:3000/demo) retains the original synthetic trajectory replay.

Startup runs Alembic migrations, idempotent knowledge/case seeding, and downloads the configured local Ollama model. The first seed builds actual multilingual embeddings; allow several minutes. The UI becomes available after database seeding. If the local model download is still running, its readiness updates automatically. Startup failures are visible in `docker compose logs init model-init backend`. Subsequent starts reuse named volumes and cached public downloads in `outputs/knowledge/`.

The default model is **local Qwen (`qwen2.5:3b`) through Ollama**, not the deterministic test fixture. All default patient processing and embeddings remain local. Incomplete model generation is marked `generation_mode=degraded`, with three explicit fallback choices. Rule findings are advisory and do not veto physician decisions. Use a more capable local model for substantive evaluation.

### DeepSeek configuration

An existing `.env` key named `Deepseek_API_KEY` or `DEEPSEEK_API_KEY` is recognized. It is read only by backend/init services and is never returned to the browser. Select **DeepSeek** when opening a session; loading a synthetic example sets the synthetic-data declaration.

```dotenv
DEEPSEEK_API_KEY=your-private-key
DEEPSEEK_MODEL=deepseek-chat
```

DeepSeek sends the selected session's visible observations to its API. Real clinical cloud use is disabled by default; it requires both `ALLOW_EXTERNAL_CLINICAL_DATA=true` and explicit per-session consent. Private workbook/MIMIC text is excluded from cloud retrieval even with that consent. No remote tracing is enabled. `.env` is ignored by Git and Docker build contexts.

### Local model selection

Copy `.env.example` to `.env` only if you do not already have one; preserve existing keys. Change the model and restart:

```dotenv
LOCAL_MODEL_NAME=qwen2.5:7b
# For an existing OpenAI-compatible vLLM/Ollama server on the host:
# LOCAL_MODEL_URL=http://host.docker.internal:8001/v1
# LOCAL_MODEL_NAME=your-served-Qwen-or-MedGemma-model
```

`OpenAICompatibleAdapter` supports `/chat/completions` JSON output and `/models` readiness. Qwen, MedGemma and other models are selected by their served name; model weights and clinical capability are not assumed. Only local/private hosts are accepted as local endpoints. No fallback silently replaces a failed model with a mock.

## Physician workflow

1. Open a session with current patient information and a presenting problem, or load one of five clearly labeled synthetic examples.
2. Review visible evidence, active problems, risk flags and management ownership.
3. Click **Run next decision**. Watch actual runtime stages and SSE events.
4. Review three candidate actions, concise rationales, citations and specialty advice; inspect rule findings in `/observation`. Expand a source to inspect its version, document/chunk, concept IDs, license and hash.
5. **Accept one or more**, **Reject all and enter a custom decision**, or **Reject all**. Automatic checks are recorded in `/observation`. Internal rule findings do not veto physician choices.
6. Add actual new observations or schedule later evidence. **Unlock** advances the observation clock while still enforcing prerequisite events. Continue the next round.
7. Reload the page or restart the backend: sessions, checkpoints, approvals, graph and trace remain in PostgreSQL.

Accept records a physician-approved action and graph transition. It does not place an EHR order or assert that the clinical action physically occurred. Real-session results come from physician/EHR input. Explicitly synthetic sessions can automatically generate labeled, provenance-linked model observations after physician choices. Local reviewer names are attribution, not authenticated hospital identities; this V1 is a single-user localhost application.

## Knowledge and import commands

Three separate layers are enforced: public medical knowledge, historical case knowledge and current-patient state. Current patients are never inserted into retrieval indexes.

| Source | V1 behavior |
|---|---|
| HPO | Download/cache official ontology; seed an attributed 92-term subset and original ancestor relations; full local OBO importer |
| PMC OA | Seed [J-SSCG 2024, PMC11907869](https://pmc.ncbi.nlm.nih.gov/articles/PMC11907869/) from Europe PMC fullTextXML; inspect article permissions; accept CC-BY/CC0 only |
| Medical KG | HPO relations plus three source-qualified guideline assertions; extensible concept/relation manifest with exact supporting excerpts |
| `医生审核版.xlsx` | Read-only import of all available source trajectories, reviewer status and original graph edges; source IDs hashed in storage |
| Five golden cases | Retained source-fidelity integration tests and seeded through the workbook importer |
| Synthetic examples | Five repository-authored process examples with no real patient narratives or asserted outcomes |
| LOINC | Import an official locally downloaded `Loinc.csv`, explicit release version and license file; no account bypass or automatic full download |
| RxNorm core | Import `RXNCONSO.RRF`; retain only English unsuppressed `SAB=RXNORM` records, exclude proprietary source vocabularies |
| MIMIC-IV | Local authorized `admissions.csv[.gz]` and `labevents.csv[.gz]` adapter/import command; no download, no fabricated records |

The current workbook contains **400 cases / 3,328 nodes and no completed reviewer annotations**. Its filename is not evidence of completed review. Source graph discrepancies remain preserved and documented in [data inspection](docs/data_inspection.md); runtime `RETURN` always creates a new downstream reassessment.

Files under the repository are available read-only at `/source` in backend containers. Example commands:

```bash
# Import a complete locally downloaded ontology
docker compose exec backend python -m clintraj.server.ingest hpo /source/outputs/knowledge/hp.obo
# Download only a specific permissively licensed PMC OA article, or pass --path to local XML
docker compose exec backend python -m clintraj.server.ingest pmc PMC11907869
# Official licensed local terminology files; explicit version and acknowledgement
docker compose exec backend python -m clintraj.server.ingest loinc /source/outputs/Loinc.csv --version 2.83 --license-ack --license-file /source/outputs/license.txt
docker compose exec backend python -m clintraj.server.ingest rxnorm /source/outputs/RXNCONSO.RRF --version 2026-09
# Authorized local MIMIC files; missing inputs fail instead of fetching data
docker compose exec backend python -m clintraj.server.ingest mimic /source/outputs/mimic-iv --version 3.1 --license-ack --offset 0 --max-admissions 1000
# Import curated medical assertions linked to existing public chunks
docker compose exec backend python -m clintraj.server.ingest medical-kg /source/outputs/medical-relations.json
# Repeat the complete seed safely
docker compose run --rm init
```

The MIMIC adapter preserves collection and actual release timestamps (`charttime`/`storetime`), excludes labs with missing or contradictory release times, and imports to a private historical store. It does not infer adjudicated clinical decisions from billing/observation data. Imports default to a bounded batch of 1,000 admissions; increment `--offset` for subsequent batches. Each batch streams the lab file and retains only matching admissions; a full MIMIC import can take substantial time and storage.

The medical relation manifest is a JSON array of `MedicalRelation` objects (schema in `clintraj/server/medical_graph.py`). Each needs typed `head`/`tail` concepts, a relation, `supporting_chunk_id`, an exact `source_excerpt`, `applicability` and `curator`. Ingestion rejects absent/private sources and excerpts missing from the cited chunk. Seed assertions preserve the guideline's qualified wording and recommendation strength; local concept IDs are explicitly namespaced `CLINTRAJ:`.

Public downloads retain the original bytes, source release/version and SHA-256. Reuse the cached files to reproduce a particular import. A new source version creates a new immutable source record. The legacy MiniLM 384D index is retained. Migration `0002_research` adds separate BGE-M3 1024D and learned-sparse indexes. Start the `research` Compose profile and run `python -m clintraj.server.reindex_m3`; this build is additive and resumable. Hybrid recall combines lexical, dense, sparse and graph channels, followed by BGE-reranker-v2-m3 and specialty task facets. Unavailable services and incomplete indexes are disclosed in the observation page.

Licensing references: [HPO](https://human-phenotype-ontology.github.io/license.html), [LOINC](https://loinc.org/license), [RxNorm core](https://www.nlm.nih.gov/research/umls/rxnorm/overview.html), and each PMC article's own permissions. No BMJ Best Practice, NICE, SNOMED or unauthorized PhysioNet corpus is fetched.

## Verification

See the [actual V1 verification record](docs/v1-verification.md) for startup, automated tests, real model runs and the browser physician workflow.

```bash
# Real database, Neo4j, checkpoint and physician-session integration tests plus existing suite
docker compose exec -e CLINTRAJ_INTEGRATION=1 backend python -m pytest -q
# Static checks
docker compose exec backend python -m ruff check clintraj tests scripts
docker compose exec backend python -m mypy clintraj
# A real model + HTTP + SSE synthetic smoke test (default local)
python scripts/smoke_session.py --provider local
# Optional DeepSeek real API smoke test, synthetic data only
python scripts/smoke_session.py --provider deepseek
```

Frontend validation from `web/`:

```bash
npm ci
npm run type-check
npm run lint
npm run test
npm run build
```

The default Python suite keeps external-service tests opt-in (`CLINTRAJ_INTEGRATION=1`). They use a deterministic **test-only** model while exercising real Postgres/Neo4j/checkpoints. Real model runs are separately recorded by the HTTP smoke script and browser verification. The golden tests read `SOURCE_WORKBOOK` or the root workbook; if absent, they explicitly skip.

Native development: Python 3.11+, `python -m pip install -r requirements.lock`, `python -m pip install --no-deps -e .`; start Compose database/model services, run `alembic upgrade head`, `python -m clintraj.server.ingest seed`, then `uvicorn clintraj.server.app:app --host 127.0.0.1 --port 8000 --no-access-log`. Run `npm run dev` in `web/`. The default native PostgreSQL port is **55432** to avoid common local conflicts.

## V2 architecture and deployment

- [Clinical schema, specialty ranking, bounded proposals and evaluation design](docs/research-architecture-v2.md)
- [IONOS / clintraj.icu deployment preparation](docs/deployment.md) — server not yet provisioned; DNS has not been changed
- `configs/specialists.yaml`: extensible COPD, oncology and pneumonia registry
- [V2 validation record](docs/v2-verification.md)

## Implementation map

- [V1 architecture and operational limits](docs/v1-architecture.md)
- [Clinical graph semantics](docs/clinical_graph_semantics.md)
- [Original research workflows](docs/research-workflows.md)
- `clintraj/server/`: FastAPI, durable sessions, hybrid retrieval, ingestion, live role pipeline, SSE
- `clintraj/domain/`, `environment/`, `agents/`, `runtime/`: reused independent domain and runtime contracts
- `web/app/workspace/`, `web/components/workspace/`: live physician UI
- `migrations/`, `docker-compose.yml`, `scripts/`, `tests/`: startup and verification

This is functioning local decision-support software, not a validated clinical device. The starter public corpus is small; retrieval and correct citation IDs do not establish clinical correctness. General-purpose models/embeddings, ordinal ranking, unreviewed historical records and incomplete source timestamps remain explicit limitations. Prospective clinical evaluation, authenticated multi-user deployment, full EHR integration, comprehensive guideline coverage and production operations remain outside this V1.
