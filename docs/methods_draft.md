# Methods draft

This document describes the implemented research framework and a prospective evaluation
plan. It does not report clinical effectiveness, model superiority, or a completed
validation study. Dataset counts describe repository inspection rather than an adjudicated
analysis cohort. Software behavior must be interpreted within the limits documented below.

## Study overview

ClinTraj represents longitudinal clinical decision support as a partially observable,
temporally ordered process over a dynamic clinical problem graph. The intended user is a
physician who reviews a proposed clinical action and may accept, modify, or reject it.
The current implementation supports local, retrospective trajectory replay and synthetic
software verification. It neither executes clinical orders nor generates validated
counterfactual patient outcomes. The proposed scientific comparison concerns the effect
of explicit clinical problem structure, ownership tracking, specialist routing, and safety
review on next-action and trajectory-level performance.

Read-only inspection of the supplied workbook identified 400 cases and 3,328 trajectory
nodes. The four columns intended to record clinician review were unpopulated. Accordingly,
the workbook is treated as a source of reference trajectories with an optional review
protocol, rather than evidence of completed clinician adjudication. Review labels are
not required for technical implementation, and the canonical trajectory schema remains
unchanged when future content or annotations are revised. The five designated
examples were selected for architectural coverage and are used for integration verification.
They are not an independently sampled validation cohort. Source construction, inclusion
criteria, clinical setting, and any review conducted outside the workbook require further
documentation by the data custodian.

## Clinical decision trajectory representation

A reference node comprises a case identifier, step identifier, newly available evidence,
action type, action text, and clinical rationale. Reference edges comprise parent and
child step identifiers and one of six relations: START, CONTINUE, BRANCH, CONSULT,
TRANSFER, or RETURN. The action ontology comprises ASK_HISTORY, EXAM, TEST, CONSULT,
TRANSFER, TREATMENT, PROCEDURE, PATHOLOGY, REASSESS, and DISCHARGE_FOLLOWUP. Strict
schemas reject categories outside these ontologies. Canonical reference records remain
separate from runtime state, execution metadata, and evaluation annotations.

The loader preserves source content and reports malformed identifiers, duplicate nodes,
missing parents, invalid relations, temporal inconsistencies, and structural defects.
Structural validity does not establish that a clinical action was appropriate or that a
relation was correctly annotated. Discrepancies between the workbook and the five-case
reference image are documented rather than repaired silently. Conceptual scenarios used
to verify required relation behavior are explicitly distinguished from faithful source
reconstructions; for example, a missing source RETURN edge is not manufactured as a gold
label. See [data inspection](data_inspection.md).

## Temporal evidence environment

The patient environment retains the complete reference case outside the agent context.
The temporal evidence gate constructs an observation containing only evidence released
by the current ordinal time and satisfied action/event prerequisites. Agents receive
this observation and an independently constructed current clinical state. Future
reference actions, reference rationales, downstream outcomes, and review labels are not
agent inputs. Evidence identifiers and provenance allow output support to be checked
against the currently visible evidence set.

The workbook does not establish comprehensive observation, order, collection, and result
availability timestamps. Ordinal step-based replay therefore approximates information
availability; it does not prove that every released sentence was available to the treating
clinician at that time. Retrospectively written source summaries may themselves contain
hindsight. A future timestamp audit must distinguish the occurrence of a clinical event
from the time its documentation or result became accessible. Static source checking and
evaluation-only future-evidence comparisons supplement the gate, but do not provide a
general proof that unconstrained clinical language contains no hidden information.

## Dynamic clinical problem graph

Runtime clinical decisions are represented separately from the reference graph and from
the orchestration graph. Each clinical problem has a stable identifier, status, and
management owner. Programmatic operations create, update, suspend, resume, resolve,
transfer, and reintegrate problems. CONTINUE preserves problem identity and ownership.
BRANCH instantiates a distinct problem pathway. CONSULT records advisory specialty input
while preserving primary management ownership. TRANSFER records a change of owner.
RETURN creates a new, later integration or reassessment event rather than linking to a
historical decision node. This representation allows an unresolved problem to resume
after stabilization of an intercurrent problem without introducing a temporal cycle.

These operations enforce explicit state invariants. They do not establish that an
agent's proposed decomposition is clinically meaningful; that judgment requires clinician
annotations and comparison with alternative decompositions. Missing ownership or problem
labels in source data must remain an annotation limitation.

## Multi-agent architecture and specialist routing

The method separates evidence interpretation, problem formulation, candidate action
generation, information-value assessment, specialty input, evidence grounding, safety
review, and final arbitration. Each component exchanges validated structured objects.
The separation is functional: additional agents are justified only when their distinct
information, constraints, or evaluation targets can be tested. Repeated calls to the
same foundation model are not assumed to constitute independent expert opinions.

Specialists are selected from the current problem state and candidate actions rather
than executed indiscriminately. A specialist provides advice; software agent routing
alone does not constitute a clinical consultation or management transfer. Those clinical
events require an explicit domain operation and physician decision. Versioned prompts
restrict agents to available evidence, require uncertainty disclosure and structured
outputs, and prohibit fabricated evidence and citations. The offline provider supports
deterministic software verification. It is not a clinically validated reasoning model.

## Clinical action arbitration

Candidate actions include an action type, concrete action description, rationale, and
references to visible supporting evidence. A configurable scoring interface represents
information value, anticipated clinical benefit, urgency, harm, burden, and delay.
The conceptual objective is a weighted combination of favorable and unfavorable terms,
subject to admissibility and safety constraints. Rule-based, model-produced, and future
learned scores can share this interface.

Current component scores and weights are engineering heuristics rather than calibrated
clinical utilities, causal treatment effects, or probabilities. Numerical differences
must not be interpreted as measured patient benefit. Arbitration integrates these
attributes and safety findings rather than using majority voting. In the current
implementation, specialist advice and retrieved support inform the subsequent critic
and explanation. They do not directly rescore the earlier ordinal assessments; their
effect on selection is through safety exclusions. An absence of an
admissible action produces abstention or a request for physician reassessment. A future
policy study must prespecify weight selection, sensitivity analyses, and whether any
quantities are estimated from independent data.

## Evidence grounding, safety, and physician review

Grounding uses explicitly supplied, attributable evidence resources. A returned citation
must correspond to a retrievable source record; absent supporting resources are reported
as missing support. A citation's existence does not prove entailment, clinical currency,
or applicability to a patient. External clinical knowledge, if introduced, must be
versioned with publication and access dates and governed independently from EHR evidence.

The safety component is separated from action generation and can veto an action or
request reconsideration. Checks address available-evidence support and configured risks
such as contraindications, deterioration, invasive intervention, and premature discharge.
These checks are bounded software controls rather than a comprehensive clinical safety
model. Physician modification is a new proposed action and must undergo validation before
replay. Rejection must not execute an action or release downstream evidence.

LangGraph provides execution, checkpointing, and human-in-the-loop interruption through
a runtime adapter. Clinical meaning resides in the framework-independent domain layer.
Resumption uses the same thread identifier and a validated review response. Because an
interrupted node is re-entered on resumption, action execution must avoid duplicate side
effects. The supplied checkpointer and execution receipts are held in process memory,
so they do not survive restart. An explicit retry path can resume a failed approved
execution using its original execution identifier. Recovery after external side effects
requires an idempotent executor. Durable checkpoints require an appropriately governed
backend; checkpoints may contain sensitive observations and are not sanitized logs.
These requirements follow the [LangGraph interrupt contract](https://docs.langchain.com/oss/python/langgraph/interrupts).

## Trajectory replay and clinician review

Strict replay advances only when the proposed action matches the expected reference
action according to the implemented explicit matching rule. Agreement on action type
alone is insufficient: two TEST or TREATMENT actions may have different meanings and
outcomes. Alternative replay requires a documented clinician-approved equivalence to an
observed transition. Unsupported paths stop. This constraint intentionally leaves
counterfactual outcomes unobserved rather than inventing them.

The intended annotation protocol distinguishes correct decisions (1), clinically
reasonable alternatives (2), and incorrect decisions (3). A replacement path terminates
the need to annotate the superseded suffix of the original trajectory. Incorrect
decisions require a replacement action/path and rationale. Rationale scores distinguish
sufficient/correct (1), partial (2), and incorrect (3), with corrected rationale required
for the latter two. Unpopulated labels remain missing and are excluded from denominators
requiring adjudication. Source-action agreement is reported separately from these labels.

## Evaluation framework

The evaluation architecture separates observable outputs from hidden references and
supports action agreement, clinician acceptability when annotated, structural agreement,
sequential completion, critical action recall, safety events, evidence support, and
uncertainty metrics when appropriate labels or probability outputs exist. A metric is
unavailable when its required annotations are absent. No patient-outcome benefit, causal
treatment effect, or clinically acceptable alternative rate can be inferred solely from
matching a retrospective action sequence.

Before model evaluation, the study should prespecify the unit of analysis, one primary
endpoint, clinically important effect size, eligibility rules, stop conditions, exclusions,
and multiple-comparison strategy. All steps from a patient must remain within one split.
An independent temporal or institutional test cohort is required for generalization
claims. For trajectory metrics, uncertainty should respect within-case correlation;
paired case-level resampling is preferable to treating individual steps as independent.
Inter-rater agreement, blinded adjudication, and adjudication of disagreements should
accompany a clinical acceptability endpoint. Missing labels, abstentions, invalid outputs,
unsupported paths, and budget exhaustion must be reported rather than removed silently.

Planned comparisons include a single model, the same model with matched tools, a single
agent with structured state, and multi-agent variants with dynamic graph and safety
components. Executable ablations address ownership, relation semantics, specialists,
and information-value scoring. Disabling temporal gating or physician intervention is
declared as a future offline protocol and is unsupported by the physician runtime. Model versions,
available information, retrieval resources, and inference budgets must be controlled.
Disabling temporal gating is an offline leakage stress test and cannot be interpreted as
a deployable comparator. None of these comparisons establishes benefit until executed
on an appropriate dataset.

## Reproducibility and data governance

Experiment artifacts record configuration, random seed where supported, provider and
model identifiers, prompt versions and hashes, dependency information, dataset digest,
and source revision when available. Unknown provider revisions are recorded as unknown.
Seeds alone cannot guarantee deterministic remote inference. Raw patient narratives and
direct case identifiers are excluded from ordinary aggregate run logs; replacing an
identifier with a hash does not anonymize free text.

Automated verification runs locally with synthetic/mock inputs and read-only source
integration checks. External model calls are opt-in and pass an explicit data-governance
boundary. No external tracing service is required. Authorization, dataset licensing,
ethics review or waiver, retention, access controls, and permitted external processing
require confirmation from the responsible institution before patient-data experiments.

## Reporting scope

The present work is preclinical software and retrospective methodology development.
[DECIDE-AI](https://www.nature.com/articles/s41591-022-01772-9) informs preparation for
future live evaluation. [STARD-AI](https://www.nature.com/articles/s41591-025-03953-8)
would apply to a diagnostic accuracy study, and
[TRIPOD+AI](https://www.bmj.com/content/385/bmj-2023-078378) with
[PROBAST+AI](https://www.bmj.com/content/388/bmj-2024-082505) to appropriate prediction
model studies. [SPIRIT-AI](https://www.nature.com/articles/s41591-020-1037-7) and
[CONSORT-AI](https://www.nature.com/articles/s41591-020-1034-x) concern future trial
protocols and reports. Architectural features do not constitute checklist compliance.
