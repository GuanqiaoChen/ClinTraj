# Local V1 architecture

## Boundaries

| Layer | Storage and responsibility |
|---|---|
| Public medical knowledge | Versioned `knowledge_sources` and `knowledge_chunks`, corpus `public`; licensed source text, SHA-256, article/terminology distinction |
| Historical knowledge | `historical_cases`, chunks with `historical`, `synthetic_history`, or `private_mimic`; Neo4j case/decision/action/evidence relationships |
| Current patient | Separate `current_patient_sessions`, `current_patient_evidence`, `current_decision_runs`, `current_trace_events`; never indexed as knowledge |
| Clinical domain | Existing `ClinicalState`, `ClinicalProblemManager`, `ClinicalDecisionGraph`, `TemporalEvidenceGate`; no LangGraph dependency |
| Runtime | Existing LangGraph adapter extended with PostgreSQL checkpoints; independent model-role pipeline, interrupt, explicit physician resume |

All services and model calls run locally by default. The web server proxies `/api` with streaming response bodies. Keys stay in backend environment variables. DeepSeek is an explicit session selection, with synthetic-only use available when a key is configured. Clinical cloud use requires both a server opt-in and session consent. Private historical text is excluded from every cloud retrieval bundle regardless of that consent.

## Live pipeline

1. Reconstruct temporal releases from current-patient storage; admit only evidence whose availability clock and prerequisite events both hold.
2. Interpret visible evidence and propose a differential/problem formulation. New flags can be added, not silently removed.
3. Search PostgreSQL FTS and a local learned multilingual dense encoder in pgvector. Traverse Neo4j concept and historical decision relationships. Fuse the three ranked lists using reciprocal-rank fusion; separate public/historical quotas prevent one corpus crowding out the other.
4. Route at most two specialties from current problems. Critical-care routing has precedence for explicit escalation flags. Specialist advice precedes action generation.
5. Generate candidate actions with evidence references, explicit clinical graph semantics and ordinal benefit/urgency/harm/burden/information/delay assessments.
6. Ground each candidate against actual retrieved chunk IDs. Unknown references abort the proposal. The LLM does not author bibliographic metadata.
7. Run an independent model Safety Critic plus deterministic temporal, graph, prerequisite, contraindication and escalation checks. Treatment, procedure and discharge proposals also require linked public article support.
8. Remove vetoed candidates and use the existing ordinal policy. The arbiter explains the result and uncertainty; it cannot override a veto. These scores are not calibrated clinical utilities.
9. Persist the recommendation and interrupt for physician review. Accept/Modify/Reject are bound to a state fingerprint and recommendation ID. A modification receives fresh grounding and independent safety review.
10. Approved execution appends a domain event and records the action. It records a physician decision and management intent; it does not place orders or claim physical completion. The physician enters the actual new observations for the next round.

## Durable review and event delivery

Session row locks serialize mutations. A session cannot accept new evidence or another run while a proposal/review is in progress. A decision is reserved before resuming the durable LangGraph checkpoint; repeated identical submissions return the stored result. A different decision for a reserved/completed run is rejected. The interrupt node checkpoints physician intent before a separate, error-prone review node, so transient model failures can resume the same decision. This follows the [LangGraph interrupt guidance](https://docs.langchain.com/oss/python/langgraph/interrupts) to separate interrupts from error-prone work. Pure domain execution can be safely replayed after a process crash because current-state finalization and the audit event commit in one PostgreSQL transaction.

At startup, interrupted proposals are marked failed and can be rerun. Interrupted reviews return to the pending state, retaining the exact reserved decision for safe retry. Run a single backend process in this V1; startup recovery assumes there are no other active backend workers. Multi-worker scheduling/leases and clinical identity authentication are future work.

Each role commits `AGENT_STARTED` before inference and `AGENT_COMPLETED` after validated output. SSE reads the append-only event table and includes a monotonic `id`, heartbeats, and `Last-Event-ID` recovery. The UI deduplicates IDs and polls session state while a run is active. Traces contain stage names, event types, counts and references. Raw provider reasoning fields and raw model responses are neither persisted nor sent to the browser.

Model prompts use compact patient-evidence aliases (`E1`) and separate knowledge aliases (`K1`), then restore actual stored IDs before domain validation. Unknown references remain invalid; prose is never rewritten. This reduces small-model copying errors while preserving temporal and provenance checks.

## Clinical graph meaning

The original semantics in [clinical_graph_semantics.md](clinical_graph_semantics.md) continue to apply. Consultation retains the managing owner; transfer explicitly changes it. A branch creates a distinct stable problem under an existing active parent. Return creates a new REASSESS event on an ancestor with both the branch and ancestor's latest events as parents. Earlier events are never edited or used as backward destinations.

Historical source edges are preserved verbatim even when their annotations differ from live runtime conventions. The source workbook supplies neither stable problem identifiers nor explicit ownership. Neo4j marks its corresponding problem placeholder `unannotated`; it does not invent physician annotations. Gold cases remain source-fidelity tests, separate from conceptual runtime tests.

## Temporal limitations

Patient clocks are explicit ordinal observation steps, not wall-clock clinical timestamps. A physician may schedule later evidence and release it when its prerequisites are present. The agent never receives scheduled text. Current free-text observations can still contain hindsight entered by a human; the gate cannot prove narrative truth. MIMIC lab imports preserve `charttime` and `storetime`, exclude unknown/contradictory release times, and remain private historical records.

## Knowledge scope and integrity

The starter corpus contains an attributed HPO subset and a CC-BY PMC guideline article, plus five repository-authored synthetic historical process examples. The local workbook is imported when mounted. LOINC and RxNorm importers preserve actual terms, codes, versions, license metadata and file hashes, but their entire datasets are not bundled. No BMJ Best Practice, NICE, SNOMED or unauthorized MIMIC source is downloaded.

The multilingual encoder is general-purpose, not clinically calibrated. PostgreSQL FTS uses token OR matching and Chinese bigrams; the lexical score is PostgreSQL `ts_rank_cd`, not an exact BM25 implementation. HNSW is present; the PostgreSQL planner may choose an exact scan for this small corpus. Neo4j traverses original HPO IS_A relations, concept co-occurrences and forward historical decision relationships. Source-qualified `MedicalAssertion` nodes link typed concepts to exact public chunks, source versions, hashes, applicability and attributed excerpts. Three starter assertions cover a sepsis care setting and two qualified guideline recommendations against specific interventions. They are retrieved with their supporting chunks. The manifest schema also supports symptom, test, drug, procedure and contraindication relationships; importing a relationship requires an actual stored public source. This is a small initial medical graph, not a comprehensive drug-interaction or contraindication database.

Licensing and source metadata are preserved; retrieval relevance and a valid citation do not establish that a recommendation is clinically correct. The prototype has not undergone prospective clinical validation.
