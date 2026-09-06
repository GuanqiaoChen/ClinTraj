# Reviewer red-team and remediation plan

The following reviews deliberately test the strongest claims a manuscript might be
tempted to make. They assess a preclinical research framework. Optional clinician review
labels are not necessary to build the system; they become necessary only for empirical
claims that depend on clinician judgment. Current source content can change without
altering the canonical schema.

## Reviewer A: clinical AI / Nature Medicine

**Recommendation on a clinical effectiveness submission: reject.** The repository does
not establish an intervention's clinical benefit. The distinction between a physician
approval interface and demonstrated safe human–AI collaboration must be maintained.

| Major criticism | Why it threatens the claim | Concrete remediation | Current architectural response |
|---|---|---|---|
| The term "golden" risks overstating clinical authority. | Agreement with a reference trajectory may reproduce a source error, local preference, or a retrospectively convenient path. | State how references were constructed; obtain blinded independent adjudication for acceptability endpoints, preserve disagreement, and report reviewer agreement. | Keep reference data and optional clinician labels separate; do not reinterpret missing labels as correctness. |
| Temporal truth has not been established. | A retrospectively written evidence cell can reveal a later diagnosis even when its row index passes the gate. | Audit event, documentation, and result-availability timestamps and source prose; build a timestamp-verified subset; quantify exclusion and uncertainty. | Use an explicit observation gate and provenance; label ordinal replay as an assumption. |
| Safety tests cover the hazards the developers anticipated. | Rule checks can miss negation, interactions, atypical deterioration, missing data, and harms introduced by delay or false veto. | Assemble an independent clinician-designed hazard set; measure both unsafe-action recall and unnecessary vetoes; review all critical failures. | Keep safety separate from generation, allow abstention, and revalidate modified actions. |
| Physician oversight is asserted without studying actual users. | Acceptance may reflect automation bias, misunderstanding, workload, or authority effects; a review field does not measure informed judgment. | Conduct a staged physician study with training, workflow observations, review time, override reasons, error recovery, and human factors endpoints. | Provide explicit accept/modify/reject semantics and future audit hooks; do not imply completed usability validation. |
| Retrospective replay cannot show that recommended alternatives improve outcomes. | The result of an unperformed test or treatment is unobserved; matching a recorded pathway is not a causal effect. | Restrict current claims to observed-path evaluation; study alternative outcomes only with additional data and an appropriate causal/prospective design. | Stop unsupported paths and require explicit mappings for accepted alternatives. |

The study must also report the clinical setting, cohort selection, missingness, and
distribution of disorders and specialties. External clinical validation and appropriate
institutional governance are prerequisites for clinical claims, not changes that software
can supply. DECIDE-AI is relevant to a future early live study, rather than a certification
of this offline framework ([primary statement](https://www.nature.com/articles/s41591-022-01772-9)).

## Reviewer B: methodological / NeurIPS, ICML, ICLR

**Recommendation on a superiority submission: reject.** A graph, several prompts, and a
safety role do not by themselves constitute a demonstrated algorithmic contribution.

| Major criticism | Why it threatens the claim | Concrete remediation | Current architectural response |
|---|---|---|---|
| The contribution could be additional inference compute. | More calls, a larger aggregate context, or better retrieval may explain the entire gain. | Compare against single-agent systems with matched tools, admissible information, tokens/calls, latency budgets, and prompt-tuning budget; report a cost–performance frontier. | Modular role and runtime boundaries permit controlled comparisons; execution-path tests must verify that switches actually change computation. |
| Clinical graph semantics may merely encode the evaluation answer. | Gold branch/transfer/return labels can make graph construction artificially easy if passed to the agent or derived from future nodes. | Build the runtime graph solely from current observations and proposed transitions; inspect all serialized contexts; evaluate graph predictions before labels are revealed. | Separate observed events from reference graphs and keep hidden evaluators outside model context. |
| Selected examples invite overfitting and lack statistical independence. | Five chosen cases cover requested structures but cannot establish prevalence, generalization, or significance; treating steps as independent inflates precision. | Exclude development examples from held-out claims, split by patient, prespecify an endpoint, justify sample size, and use paired case-level inference. | Treat five cases as regression scenarios; expose case-level evaluation units and explicit missing-label handling. |
| The objective contains uncalibrated numbers. | Ordinal model judgments are not expected information gain, treatment benefit, or harm in a shared cardinal unit. | State the heuristic scale, analyze weight sensitivity, compare with simple ranking rules, and estimate calibrated quantities only with suitable independent supervision. | Label component assessments and scores as uncalibrated and support replacement scoring policies. |
| No mechanism-specific hypothesis is falsifiable. | A broad "multi-agent helps" claim survives any post-hoc explanation and obscures which component matters. | Register component-level hypotheses and failure criteria; test interactions and negative controls; report null results and multiplicity handling. | A [novelty statement](novelty_statement.md) specifies candidate mechanisms and required comparisons without asserting superiority. |
| Unsupported paths can produce survivorship bias. | Reporting scores only where replay continues rewards systems that happen to remain on the narrow reference path. | Count all initiated cases, expose stop reasons, report coverage and completion, and evaluate alternative proposals separately when labels exist. | Replay must halt explicitly and report unsupported transitions; it must not silently drop these episodes. |

The next manuscript needs a literature comparison against clinical planning, workflow and
process representations, partially observable decision methods, and agent evaluation.
LangGraph is execution infrastructure, not the novelty. No framework runtime benchmark can
substitute for a test of the clinical method.

## Reviewer C: NLP / ACL, EMNLP, TACL

**Recommendation on an agent-evaluation submission: reject.** Reproducible orchestration
is not yet reproducible language-model evidence, and structured JSON is not faithful
clinical reasoning.

| Major criticism | Why it threatens the claim | Concrete remediation | Current architectural response |
|---|---|---|---|
| Same-model agents have correlated failure modes. | Rephrased role instructions can create apparent debate without independent scrutiny; the arbiter may inherit the generator's error. | Compare same-model and independently varied critics where justified; measure correction and error propagation; include a matched single-model self-review baseline. | Distinct role schemas make contributions observable; independence is described as functional, not statistical. |
| Evidence IDs and valid citations do not establish entailment. | An invented conclusion can reference a real visible item, and a real citation can be irrelevant or outdated. | Annotate claim-level support, contradiction, omission, and citation appropriateness; test unsupported paraphrases and fabricated citation identifiers. | Validate identifiers and isolate retrieval; retain explicit uncertainty and support limitations. |
| Prompt artifacts can leak answers or change across runs. | Source examples in prompts, hidden case IDs, mutable prompt files, or differing template versions can invalidate a comparison. | Freeze and hash rendered templates/configurations, inspect prompts locally, remove hidden references, record known/unknown model revisions, and repeat stochastic runs. | Version prompts and metadata; keep provider calls behind explicit transmission controls. |
| Exact text replay can conflate lexical variation with clinical error. | Equivalent Chinese/English phrasing, abbreviations, and action granularity can fail string agreement, while identical words may have different clinical context. | Report exact matching as a reproducible lexical endpoint only; add blinded clinician-defined equivalence sets and language-specific analyses for clinical claims. | Separate strict action matching from explicitly approved alternative transitions; preserve original source wording. |
| Invalid generations and abstentions may disappear from evaluation. | Excluding malformed JSON, missing actions, rejected recommendations, timeouts, or safety vetoes inflates reported accuracy. | Define denominators before evaluation, report each failure class, and present selective performance alongside coverage. | Strict output schemas and explicit review/stop states create observable failures; reporting must retain them. |
| Persistence and observability can leak patient information. | Thread checkpoints, exception strings, transport logs, and hosted tracing can expose narratives despite hashed case identifiers. | Audit every output sink; keep default tests offline; use sensitive local checkpoints with access/retention policy; sanitize ordinary run manifests. | Default-deny external transports and aggregate logging are controls, not proof of anonymization. |

Release should include enough synthetic fixtures, pinned setup instructions, prompts,
configuration, and expected output structure to reproduce engineering behavior without
access to the private workbook. Any public dataset release requires a separate data-rights
and privacy assessment; no upload is part of the present task.

## Adversarial implementation review checklist

The final review should challenge the actual code with the following probes and record
the resulting fixes or limitations in the readiness audit:

1. Attempt to release future pathology through a later clock, an incorrect prerequisite,
   a same-type but different action, and a fabricated evidence identifier.
2. Inspect requests for every agent role; verify that reference action text, reference
   rationale, future graph nodes, and evaluation labels never enter serialized input.
3. Attempt ownership changes through CONSULT, backward RETURN, invalid parent events,
   duplicate step/event identifiers, and inconsistent state partitions.
4. Modify a previously safe recommendation into an unsupported or vetoed action; reject
   a recommendation; resume a stale review; resume twice. Confirm that none silently
   executes or reveals new evidence.
5. Interrupt with a real LangGraph runtime, reopen a persistent checkpoint if supported,
   and confirm that the approval boundary is retained and no side effect repeats.
6. Supply malformed structured outputs, unknown citations, unsupported specialist IDs,
   missing safety assessments, and empty candidate sets; verify explicit failure or
   abstention rather than guessed clinical content.
7. Exercise each ablation and inspect its effective role calls, state exposure, and
   safety/HITL behavior; do not count a configuration file as an experiment.
8. Inspect aggregate logs and default external-call behavior, including error paths.

Passing these probes supports bounded implementation claims. It cannot establish that
the source's timing is correct, the policy is clinically safe, or physicians benefit.

## Implementation findings and fixes

The independent review identified concrete defects during implementation. START was
initially rejected by the unknown-problem safety check, and interpreter-added risk
flags could be lost when reviewing a modified action. Both were corrected and tested.
Problem-parent validation now rejects missing parents and cycles, and reintegration
has a defensive traversal guard. The evidence gate rejects invalid ordinal clock
types before mutation. Specialist consultation records retain the consulted specialty
while preserving ownership.

A failed approved executor originally left no adapter-level recovery path. The runtime
now exposes an explicit retry with the original execution identifier; recovery after a
side effect still requires executor idempotency. Checkpoints remain local and volatile.
The review also established an explicit methodological limit: specialist advice and
retrieved support affect safety review and explanation, while current ordinal ranking
does not directly rescore candidates from this advice. The Methods describe that
mechanism without overstating arbitration capability.

An isolated ownership ablation initially left historical event owners in model-visible
graph context; these fields are now removed and tested without disabling the graph.
Review responses are bound to recommendation identifiers so a delayed response cannot
approve the next decision after advancement. Missing relation predictions are assessed
as missing/incorrect rather than rewarded as correct negative classifications. These
changes were included in the final 94-test passing suite.

These fixes address bounded software properties. The final test evidence and outstanding
study requirements are recorded in the [readiness audit](top_journal_readiness_audit.md).
