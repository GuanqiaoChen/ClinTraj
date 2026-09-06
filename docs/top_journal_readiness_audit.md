# Research readiness audit

This audit evaluates the scope of the software evidence, not acceptance by any journal
or conference. PASS means that a bounded engineering requirement is implemented and
verified; it does not mean that a clinical claim has been established. PARTIAL means
that a mechanism exists with material limitations. BLOCKED identifies an empirical
claim requiring external data, access, or a study. NOT_APPLICABLE means the criterion
does not fit the current study type. Optional clinician annotations are not a blocker
to technical construction or future source-content changes.

The repository currently supports method development, local replay, and software
verification. It must not be described as a validated clinical decision support product.

## Engineering and methodological evidence

| Criterion | Status | Repository evidence | Remaining gap | Required next action |
|---|---|---|---|---|
| Source-preserving canonical representation | PASS | `clintraj/data/excel_loader.py`; `tests/test_data_loader.py`; `tests/golden_cases/test_source_trajectories.py` | Passing source/hash/graph tests establishes faithful ingestion, not clinical correctness. | Preserve the source and update content-specific expectations explicitly after authorized dataset revisions. |
| Framework-independent domain method | PASS | `clintraj/domain/`; `tests/unit/test_domain.py`; `tests/golden_cases/test_conceptual_scenarios.py` | Runtime portability beyond the supplied adapter has not been benchmarked. | Retain one-way runtime-to-domain imports when adding adapters. |
| Explicit consultation, transfer, and reintegration operations | PASS | `clintraj/domain/problem_manager.py`; domain and conceptual-scenario tests | Tests establish programmed semantics; source ownership labels do not establish every retrospective transition. | Keep source reconstruction distinct from conceptual fixtures and obtain semantic labels for related empirical endpoints. |
| Ordinal time and prerequisite gate | PASS | `clintraj/environment/temporal.py`; `tests/leakage/test_temporal.py` | Step order approximates actual availability; retrospective prose may contain hindsight. | Preserve conjunctive time/prerequisite tests; audit event/result/document availability before temporal clinical claims. |
| Hidden reference field isolation | PASS | Separate reference/observed graph schemas; initial-state sentinel and future-reference tests | This verifies known field/identifier exclusion, not arbitrary semantic leakage or hostile Python isolation. | Extend prompt inspections with new agents and retain evaluation-only hidden-oracle separation. |
| Semantic future-information prevention | PARTIAL | Gate provenance; evaluation-only `audit_future_leakage` | Exact-string screening misses paraphrases and hindsight already embedded in source observations. | Conduct independent source/timestamp review and clinician-rated leakage analysis. |
| Strict replay and unsupported alternatives | PASS | `clintraj/environment/replay.py`; wrong-same-type, approved-equivalence, and counterfactual-rejection tests | Text matching cannot establish clinical equivalence; off-policy outcomes remain unobserved. | Keep exact lexical agreement separate from clinical acceptability; add only explicitly approved outcome mappings. |
| Independent safety constraint | PARTIAL | `clintraj/agents/safety.py`; candidate-veto, malformed-critic, and modification-risk regression tests | Tested constraints are bounded; same-model critique does not establish clinical hazard sensitivity. | Evaluate unsafe-action recall and false vetoes on independently labeled cases. |
| Local physician decision boundary | PASS | `tests/integration/test_langgraph_runtime.py`; stale-state and modification-risk tests in `tests/unit/test_agents.py` | Caller-supplied physician identifier is not authenticated identity; local replay is not clinical order execution. | Retain explicit review and revalidation; add institutional identity/audit controls for a clinical study. |
| Execution retry and persistence | PARTIAL | Runtime uses `InMemorySaver`, in-process receipts, and an approved-execution retry method | State/receipts do not survive restart; failure after an external side effect requires executor idempotency. | Add governed durable checkpoints/receipts and verify crash recovery before deployment claims. |
| Provider neutrality and PHI controls | PARTIAL | `clintraj/models/base.py`; two-opt-in denial and external-tracing tests | Opt-in switches do not establish de-identification or institutional permission; checkpoints may hold sensitive state. | Keep tests offline; govern approved transports, checkpoint retention, and access before clinical-data calls. |
| Citation identity and release-time checks | PASS | `clintraj/retrieval/local.py`; fabricated-reference and temporal-source tests in `tests/unit/test_agents.py` | Presence of a citation does not prove entailment or guideline currency; no clinical guideline corpus is bundled. | Freeze clinician-approved sources and assess claim-level support for a clinical study. |
| Reproducible model experiments | PARTIAL | Locked environment, model metadata, prompt versions/hashes, source/config/reference digests, and aggregate run manifests | No completed remote model study; unknown model revisions and hosted inference may remain nondeterministic. | Archive resolved artifacts and repeat seeds before external-model evaluation. |
| Six executable baselines and scoped ablations | PASS | `configs/experiments/`; `tests/integration/test_experiment_runner.py`; isolated role/payload/ranking ablation tests | Tests establish different computation on synthetic inputs; equal clinical inference budgets and comparative benefit remain untested. | Run prespecified real-model comparisons; report tokens, calls, latency, tools, and context. Temporal/HITL-removal files remain explicit unsupported protocols. |
| Policy calibration | NOT_APPLICABLE | `ActionAssessment` labels scores as uncalibrated ordinals | Current rankings are not probabilities, measured utility, or treatment effects. | Keep claims ordinal; introduce a separate calibration study if probabilistic/utility claims are made. |
| Specialist and grounding influence on arbitration | PARTIAL | Advice and retrieved support enter the critic/explanation context; ordinal ranking precedes them | They can affect safety exclusion but do not numerically rescore current candidates. | Evaluate this bounded mechanism; add and ablate explicit post-advice reassessment only with a defensible scoring protocol. |
| Clinician acceptability and rationale labels | BLOCKED | Review semantics are optional evaluation metadata; source columns currently unpopulated | Reference-action agreement does not establish acceptability or rationale quality. | Obtain labels only for an empirical study that claims these endpoints; no schema change is required. |
| Independent external validation | BLOCKED | Five chosen examples are integration fixtures; inspected corpus is one supplied resource | No independently sampled institutional or temporal cohort is established. | Define eligibility, secure an independent cohort, and lock analysis before access. |
| Comparative multi-agent benefit | BLOCKED | Components support mechanistic comparisons | No controlled model study, power analysis, or demonstrated effect size. | Run budget-matched paired comparisons with case-level uncertainty and failure reporting. |
| Clinical utility, human factors, and outcomes | BLOCKED | Local recommendation/review boundary | No prospective physician study or observed intervention effects. | Design staged physician evaluation and appropriate subsequent interventional study. |
| Fairness, subgroup performance, and distribution shift | BLOCKED | No completed subgroup performance analysis | Demographic/site completeness, subgroup sizes, and deployment distribution are unverified. | Prespecify appropriate subgroups and evaluate uncertainty without inventing unavailable attributes. |
| Research governance and data rights | BLOCKED | Local processing and source preservation are design controls | The repository does not establish ethics approval/waiver, data license, institutional consent, or publication permissions. | Have the responsible investigators document the applicable approvals and permitted uses before patient-data experiments/publication. |

After the documented adversarial fixes, the independent verification command
`.\.venv\Scripts\python.exe -m pytest -q` completed with **94 passed**, with no warnings.
This includes the source integrations, synthetic graph scenarios, temporal gate,
structured agents, six executable baselines, and actual LangGraph review workflow.
The PASS labels remain limited to those verified behaviors. Later added checks should
be included in the final repository validation record. Full source findings are in
[data_inspection.md](data_inspection.md).

## Reporting guideline applicability

| Criterion | Status | Repository evidence | Remaining gap | Required next action |
|---|---|---|---|---|
| DECIDE-AI preparation | PARTIAL | Physician-facing boundary, safety rationale, versioned method description | DECIDE-AI concerns early live evaluation; no such study has been performed. | For a future live study, document workflow, users, training, human factors, modifications, errors, and harms. |
| STARD-AI diagnostic accuracy reporting | NOT_APPLICABLE | Current target is sequential clinical action support | Action-type agreement is not a diagnostic accuracy study with an index test/reference standard. | Apply if a diagnostic accuracy substudy is designed and prespecified. |
| TRIPOD+AI prediction model reporting | NOT_APPLICABLE | No fitted diagnostic/prognostic prediction model is reported | A generic action-ranking heuristic is not an evaluated risk prediction model. | Apply to any future applicable prediction model development/evaluation component. |
| PROBAST+AI appraisal | NOT_APPLICABLE | No applicable prediction model performance study is completed | Development quality and bias in evaluation estimates require distinct appraisal when relevant. | Use for the corresponding future prediction model study; do not treat it as a general agent certification. |
| SPIRIT-AI protocol and CONSORT-AI trial reporting | NOT_APPLICABLE | Current work is local preclinical methodology | There is no trial protocol or randomized intervention report. | Apply the relevant current core guidance and AI extension when designing/reporting a future trial. |

Applicability judgments follow the primary statements:
[DECIDE-AI](https://www.nature.com/articles/s41591-022-01772-9),
[STARD-AI](https://www.nature.com/articles/s41591-025-03953-8),
[TRIPOD+AI](https://www.bmj.com/content/385/bmj-2023-078378),
[PROBAST+AI](https://www.bmj.com/content/388/bmj-2024-082505),
[SPIRIT-AI](https://www.nature.com/articles/s41591-020-1037-7), and
[CONSORT-AI](https://www.nature.com/articles/s41591-020-1034-x).
These are scope mappings, not completed reporting checklists or claims of compliance.

## Venue-facing interpretation

For a clinical AI journal, the unresolved work concerns trustworthy reference construction,
independent clinical validation, intended use, appropriate governance, and a credible path
to physician evaluation. Technical completion does not require optional annotations, but
an empirical endpoint requiring clinician judgment does.

For machine learning venues, the unresolved work concerns methodological novelty, strong
matched baselines, effective ablations, mechanism-specific gains, sample size, statistical
uncertainty, and robust failure analysis. A sophisticated architecture alone is insufficient.

For NLP and agent venues, the unresolved work additionally includes prompt and model
version controls, stochastic repeatability, tool/retrieval parity, language-specific
evaluation, contamination analysis, and faithful reporting of invalid or unsupported
outputs. The implementation is a foundation for these investigations, not their result.
