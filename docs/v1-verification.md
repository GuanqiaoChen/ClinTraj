# V1 verification record

Verified on Windows with Docker Desktop and the local Compose stack on 2026-09-15. All model/API/browser scenarios used repository-authored synthetic observations.

## Infrastructure and automated checks

| Check | Observed result |
|---|---|
| `docker compose up --build -d` | Backend/frontend built; PostgreSQL and Neo4j healthy; API and workspace reachable |
| Alembic and seed | Init exited 0; subsequent seeds inserted zero duplicate chunks |
| Public knowledge | 92 HPO terms, 420 PMC article chunks, three qualified medical assertions |
| Historical knowledge | 400 local source cases, 3,328 source nodes, five synthetic workflow chunks |
| Retrieval | Actual PostgreSQL lexical + 384D local vectors + Neo4j traversal; HNSW and GIN indexes checked |
| Python | 116 tests passed in the container, including the five original golden cases and real database integrations |
| Frontend | 21 tests passed; TypeScript, ESLint and production build passed |
| Python static checks | Ruff passed; mypy passed for 51 source files |
| Git boundary | No `.env`, source workbook, patient-level exports or matching configured credentials staged |

The Python service tests use a deterministic test-only model with real PostgreSQL, Neo4j and checkpoints. They cover temporal release, private-source exclusion, fabricated citations, independent veto, duplicate approval, modified-action review, session isolation, branch, consultation ownership, transfer ownership, and downstream multi-parent return. A fault-injection regression verifies that a failed independent review resumes the saved physician intent without generating a new proposal or executing twice.

## Real model and browser checks

The HTTP smoke script exercises a real Ollama/DeepSeek model, SSE, three-channel retrieval, physician review, durable graph finalization and duplicate-decision idempotency. Aggregate receipts are written to local ignored `outputs/smoke-local.json` and `outputs/smoke-deepseek.json`.

Both providers completed real HTTP/SSE checks. An earlier local Qwen run accepted an eligible action and appended a node. The final local run returned no eligible action, was rejected, and correctly retained one node (30 trace events, two grounding citations, and all three retrieval channels); duplicate rejection was idempotent. DeepSeek completed accepted actions and the browser modification flow below. These outcomes are reported as observed, not as a claim that every input yields an eligible recommendation.

Chrome at `/workspace` was exercised through the actual UI:

1. Open a synthetic respiratory patient session with explicitly selected DeepSeek.
2. Observe live role events, routed pulmonology activity, knowledge retrieval and safety findings.
3. Reject an ineligible proposal; confirm no graph node was appended.
4. Enter new observations, generate a fresh recommendation, and Accept; confirm the second node and audit receipt.
5. Enter follow-up history, generate another recommendation, Modify its timing and clinician-review instructions, and submit for fresh grounding and independent safety review.
6. Recover the saved modification after an interrupted review and backend restart; confirm `MODIFY · executed` and a third downstream node.
7. Expand an actual retrieved source and verify its source URL, version, document/chunk ID, hash, license and lexical/dense/graph provenance.

The graph layout and active-agent highlighting were inspected visually. The local source workbook remained read-only, and private workbook text was excluded from all DeepSeek requests.

## Limits observed during verification

Real models sometimes produced extra JSON fields or incorrect references; these attempts stopped visibly. Patient IDs now use reversible prompt aliases and schema-constrained decoding. Knowledge citations remain separate. Failed reviews retain the exact physician intent for retry; they do not imply approval. No mock fallback is used in the workspace.

These are software workflow checks, not clinical efficacy, citation-entailment or prospective safety validation. The starter public corpus is limited, and the source workbook has no completed reviewer annotations. An action with no direct supporting source is identified as such; treatment, procedure and discharge proposals without public article support are vetoed.
