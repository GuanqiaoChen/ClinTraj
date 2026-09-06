# Experiment protocols

`python -m clintraj experiment --config multi_agent_graph_safety`
runs a three-step **synthetic wiring test**, with explicitly simulated physician responses.
It does not evaluate clinical intelligence. The reference and mock intentionally share a
public fixture action. Clinical acceptability and safety outcomes remain missing rather
than being imputed from successful software execution.

Six required baseline configurations change executed agent calls and visible representations.
Additional executable configurations remove specialist routing, information-gain scoring,
the independent model critic, ownership context, or graph context. The temporal-gate and
physician-intervention removal files are declared protocols and fail explicitly in this
physician-facing runner; no silent fallback to the full architecture occurs.

An ablation's safety_critic=false removes the proposal-stage clinical critic. Structural
provenance and final physician-review checks remain invariant. These are representation/
proposal ablations, not unrestricted clinical-policy deployments. Removal of explicit
ownership removes the owner index, per-problem owner, and routing by owner from agent inputs;
domain integrity remains enforced at execution. Graph-free runs use the same staged
environment action/evidence protocol without applying a runtime decision graph.

Reports record effective config, seed, model version, prompt hashes, source hash, dependency
versions, executed role calls, step counts, and unavailable metric denominators. A common
per-decision call cap is enforced; this is not a matched-token experiment. Real comparative
studies must predefine model/token/tool budgets, repeat seeds, case/patient grouping,
clinician equivalence labels where needed, uncertainty intervals, failure handling, and
held-out data. `case_split` reserves exemplars and supports deterministic case-disjoint splits.

No external experiment is executed by this repository's CLI. The provider-neutral transport
interface is intended for a separately governed integration with actual models.
`--config` also accepts an explicit YAML path when developing a new local protocol.
