# Scientific contribution and novelty boundary

## Candidate contribution

The proposed contribution is an evaluable representation of longitudinal clinical
decision support: an agent observes a restricted clinical history, decomposes current
problems, selects a next action, tracks responsibility for each problem, and revises the
clinical graph after physician review and new evidence. Its central hypothesis is that
explicit problem identity and forward-only reintegration improve decisions in cases where
parallel problems, advisory consultation, and management transfer interact.

The potentially distinctive combination is (i) a minimal reference trajectory separated
from runtime reasoning state; (ii) an evidence environment that controls information
release; (iii) executable BRANCH, CONSULT, TRANSFER, and RETURN semantics; (iv) explicit
management ownership; and (v) trajectory-level evaluation under physician review. A new
combination is not automatically a new method. Priority and novelty require a systematic
comparison with prior clinical planning, process mining, partially observable decision
models, workflow representations, and medical agent evaluation. That comparison has not
yet been completed and this repository makes no first-of-its-kind claim.

The available workbook is a structured trajectory resource; optional review labels are
not a prerequisite for this architecture. Claims about a clinician-adjudicated benchmark
would require separate evidence. Future content adjustments preserve the canonical
schema. The five selected examples
establish requirements and regression scenarios rather than independent clinical evidence.
The source/image discrepancies are part of the dataset audit, not opportunities to add
missing gold relations by assumption.

## Infrastructure and existing framework capabilities

LangGraph supplies orchestration and resumption infrastructure, including state execution,
conditional control flow, checkpoints, and interrupts. These capabilities are documented
by [LangGraph](https://docs.langchain.com/oss/python/langgraph/interrupts) and are not a
research contribution of ClinTraj. Model transport wrappers, Pydantic schemas, YAML
configuration, structured logs, and local retrieval are similarly engineering choices.
Other agent frameworks may replace the runtime without changing the clinical method;
this repository does not implement or benchmark those alternatives.

The added scientific object is a clinical decision graph with testable invariants and
an observation boundary. Software execution topology alone does not say whether a
specialist owns a problem, whether a pathway creates a new clinical problem, or whether
reintegration refers to a new patient state. Those claims are explicit domain objects
and state transitions. Their usefulness must be assessed separately from the benefits
of additional model calls or better prompts.

## Why multiple agents might help

Functional decomposition permits targeted constraints and observation of failures:
candidate generation explores actions, specialist routing adds focused context,
information-value assessment questions redundant tests, and a separate safety review
can challenge the candidate generator. Arbitration exposes how urgency, support,
burden, and potential harm affect selection. These are mechanisms to test, not evidence
that several agents outperform one model.

Agents sharing the same model, prompt source, or retrieved evidence can fail in correlated
ways. A larger call budget, a longer effective context, additional tools, or access to
hidden references can explain an apparent multi-agent improvement. An independent
software component is not equivalent to an independent clinician or an independently
trained statistical estimator. A safety critic can also introduce harmful false vetoes
and delays. Therefore, comparisons must assess both favorable and unfavorable effects.

## Falsifiable hypotheses and required comparisons

| Hypothesis | Comparison | Required evidence and falsification condition |
|---|---|---|
| Explicit problem graphs help on concurrent pathways | Structured single-agent state versus multi-agent with and without graph | Blinded action and decomposition labels, case-level uncertainty; no improvement after budget matching weakens the claim. |
| Ownership semantics prevent consultation/transfer errors | Full method versus ownership/semantic ablation | Adjudicated ownership events and transition errors; benefit must exceed annotation noise. |
| Forward reintegration improves resumption of unresolved problems | Explicit RETURN versus a comparator with equivalent memory but no reintegration operation | Clinician-defined resumption events and missed follow-up errors; source labels must first be completed. |
| Safety review improves the benefit/harm tradeoff | Identical generator with and without critic | Unsafe action recall, false vetoes, delays, and abstention coverage on independently annotated cases. |
| Specialist routing adds value efficiently | Routed specialists versus no specialist and a matched-budget generalist | Clinical acceptability, token/call count, latency, and specialty-stratified failure analysis. |
| Information-value review reduces redundant actions | Matched system with and without information-value component | Clinician-defined unnecessary action labels and retained critical-action recall. |
| Temporal gating prevents misleading evaluation gains | Restricted context versus intentionally leaky offline stress test | Measured reference/outcome exposure and performance inflation; leaky performance is not a deployable result. |

Report the same provider/model, prompt freeze, retriever snapshot, patient splits, and
inference budget for each comparison. Single-agent baselines must have access to the
same admissible tools and information. Include repeated runs where inference is
stochastic, failure and abstention rates, and paired analysis at the case level.

## Claims supported and unsupported at this stage

Software tests can support claims that a particular implementation rejects malformed
graphs, keeps a specific hidden field out of serialized observations, distinguishes
consultation from ownership transfer, pauses for physician review, or stops unsupported
replay. Such tests are necessary but do not establish clinical safety, completeness of
temporal reconstruction, calibrated utility, or physician benefit.

The implementation therefore supports investigation of a candidate method. It does not
yet support clinical superiority, cost effectiveness, fairness, generalization, outcome
improvement, causal counterfactual reasoning, or publication readiness. The decisive
next work is adjudication, independent evaluation, a controlled ablation study, and
subsequent physician-centered validation.
