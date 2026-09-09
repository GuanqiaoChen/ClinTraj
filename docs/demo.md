# Interactive localhost demo

The `/demo` page is an independent Next.js frontend in `web/`. It replays authored synthetic clinical scenarios through two synchronized React Flow views: a clinical decision trajectory and the implemented ClinTraj method's component activity. It makes no model, clinical backend, database, LangGraph, retrieval-service, or SSE calls. Next.js serves the page and its local assets; development mode also uses its normal development connection.

## Run locally

Use Node.js 20.9 or later and npm. From the repository root:

```bash
cd web
npm ci
npm run dev
```

Open [http://localhost:3000/demo](http://localhost:3000/demo). The server binds to the loopback interface. `/` redirects to `/demo`. No Python environment, source workbook, API key, or model service is required. Stop a foreground server with `Ctrl+C`.

For a production build served locally:

```bash
cd web
npm ci
npm run build
npm run start
```

Run the frontend checks from `web/`:

```bash
npm run lint
npm run type-check
npm run test
npm run build
```

The Python framework and its verification commands remain separate; see the [repository README](../README.md).

## Explore the replay

- Choose one of five compact case tabs. Switching cases resets the replay, component statuses, and open details.
- **Play / Pause** advances or freezes individual trace events. **Next / Previous** moves between finalized decision boundaries. **Restart** returns to the ready state; **Replay** starts again after completion.
- Click a decision on the timeline or clinical graph to pause and seek to that decision's first event. Both graphs show that point in the same replay. Clicking a clinical node also opens its step inspector.
- Change replay speed using the speed selector. Clinical and agent activity always use the same event cursor.
- Drag either graph to pan and use its zoom or fit controls. **Overview** fits the clinical trajectory; **Follow step** resumes automatic focus on the current decision.
- Select an architecture component to show one sentence about its responsibility. Click it again, click the canvas, use the close button, or press `Escape` to dismiss the explanation.

The replay strip sits above the full-width clinical graph and reports the current decision and component. A second full-width graph presents the multi-agent method. The step inspector appears on demand and keeps only the action, evidence, rationale, and responsible owner. Long introductions, case descriptions, badges, the permanent activity feed, architecture legends, and default architecture explanations are omitted so the two animated graphs remain the focus.

Outside focused controls, `Space` toggles playback, `Left` / `Right` moves between decisions, and `R` restarts. `Escape` dismisses the step inspector. Standard keyboard controls remain available for buttons, selectors, and graph components. Motion respects the operating system's reduced-motion preference, and graph navigation remains available on narrow screens.

Future clinical nodes are deliberately visible as a muted fixture preview. Selecting one seeks the replay; it does not release evidence in the Python runtime. Evidence, rationales, component contributions, and safety attention are authored summaries; raw model chain-of-thought is never displayed.

## Fixture provenance and five structures

The supplied demo brief provides the five scenario IDs and conceptual patterns. All narrative evidence, recommendations, rationales, and replay events in this frontend are synthetic authored examples. They are not extracted from the source workbook and are not reproductions of its golden records. The workbook findings and actual source-graph checks remain documented in [data inspection](data_inspection.md).

| Scenario ID | Structural purpose |
|---|---|
| `ZY080001040320` | Predominantly linear breast-care sequence, using `CONTINUE` edges. |
| `ZY020001071253` | GI and ENT-related pathways, advisory `CONSULT`, and forward reintegration. |
| `ZY010001076087` | Pulmonary and vertebral-fracture pathways, distinguishing specialist advice from management `TRANSFER`. |
| `ZY030000642578` | Neurological presentation and an incidental breast problem, parallel workups, specialty handoff, and integrated reassessment. |
| `ZY010001090829` | Urologic management interrupted by acute deterioration, ICU transfer, stabilization, and resumption through a new reassessment. |

`BRANCH` visibly forks a distinct problem pathway. `CONSULT` uses a lighter dashed edge and retains the current team's ownership. `TRANSFER` has stronger visual weight and changes primary management ownership. `RETURN` edges run forward into a new current-state node, with multiple incoming parents where pathways reintegrate. They never connect back to an earlier historical decision. Neutral `CONTINUE` edges keep sequential care visually quiet.

## Alignment with the implemented framework

Current Python code and [architecture](architecture.md) take precedence over the demo brief. The architecture view uses 13 presentation nodes while preserving all 17 runtime component status IDs. Infrastructure is grouped at the evidence gate, specialist routing/advice, retrieval/grounding, and execution/graph-transition boundaries. Every active or warning member remains visible through its group's highlight.

All eight model roles remain individually identifiable: state interpreter, problem formulation, action generation, diagnostic strategy, specialist advice, evidence grounding, safety critic, and arbiter explanation. Three faint zones—**Understand**, **Assess**, and **Review & act**—organize the dependency diagram. Specialist and grounding branches describe information dependencies; their placement does not claim parallel execution or depict sequential invocation topology. Safety-filtered deterministic ranking precedes the explanatory arbiter, physician review, and approved execution.

The compact rounded nodes, restrained edges, and strong active-node outline take visual inspiration from the agent diagram shown in the [Google ADK repository README](https://github.com/google/adk-python#readme). This is a visual reference only; the graph preserves current ClinTraj roles and semantics and adds no ADK runtime dependency.

Problem formulation is an agent role that describes stable problem IDs and a differential. `ClinicalProblemManager` applies clinical graph transitions after approved execution. Specialist advice does not itself transfer ownership. Safety vetoes precede ordinal ranking; the arbiter explains the selected action and cannot override a veto or substitute its own candidate. The displayed path summarizes the full method configuration; it is not the LangGraph execution topology, and it does not simulate every role ablation or failure route.

The Python runtime requires an explicit recommendation-bound physician `ACCEPT`, `MODIFY`, or `REJECT` decision, validates the resulting action, and only then executes and releases subsequent observations. The frontend instead displays pre-authored **simulated acceptance** events. Its playback controls are not clinical approvals, and no frontend event executes a Python action or writes an EHR order. The architecture's feedback link means the next evidence cycle after approval; the clinical trajectory remains a forward graph.

These fixtures demonstrate interface behavior and semantic patterns. They provide no clinical performance, safety, correctness, or outcome evidence.

## Components and replay contract

| Location under `web/` | Responsibility |
|---|---|
| `app/demo/page.tsx`, `components/demo/DemoShell.tsx` | Page entry, case selection, and a single shared replay state. |
| `components/demo/trajectory/` | Custom clinical nodes and edges, graph navigation, and the step inspector. |
| `components/demo/architecture/` | Grouped method dependency graph, active-node emphasis, and on-demand role explanations. |
| `components/demo/ReplayControls.tsx` | Compact transport strip, decision timeline, and current decision/component state readout. |
| `data/demo/` | Five typed synthetic scenarios and deterministic trace events. |
| `lib/demo/types.ts`, `lib/demo/architecture.ts` | Strict ontologies, fixture/event contracts, and actual method components. |
| `lib/demo/architecture-view.ts` | Thirteen presentation nodes, dependency edges, and aggregation of all 17 component statuses. |
| `lib/demo/replay-state.ts`, `lib/demo/use-replay.ts` | Pure event-prefix projection and timed playback/navigation. |
| `lib/demo/config.ts` | Shared replay timing, animation timing, and supported speeds. |
| `lib/demo/trace-event-source.ts`, `lib/demo/mock-trace-event-source.ts` | Source interface and its local fixture implementation. |

`DemoCase` contains metadata, clinical nodes, explicit edges, and ordered `TraceEvent` records. Nodes retain action/relation enums, stable problem identities, ownership, lifecycle status, evidence references, and ordinal position, in addition to display text and graph coordinates. Explicit edge arrays support branches and multiple-parent returns without overloading a single parent field.

A trace event has a stable ID, case and step IDs, sequence, elapsed demo timestamp, type, optional component ID, and concise summary. Started/completed events, safety warnings, simulated physician decisions, and node finalization supply the replay phases. `deriveReplayState` reconstructs the current decision, component statuses, finalized decisions, and event history from the same event prefix. The interface uses the current-state readout instead of a permanent activity list. Seeking and reverse navigation rebuild that projection instead of leaving stale component state behind. Agent statuses reset for each new decision, and only the selected specialists are shown as routed.

`TraceEventSource` is the replacement boundary for future real traces; `MockTraceEventSource` supplies synchronous local case and event snapshots today. A future SSE adapter would need authenticated transport, ordered-event buffering, validation, cancellation, and a subscription bridge into the replay controller. The current interface is a starting contract, not an implemented streaming client. Such integration must preserve the observable-state boundary and mandatory runtime physician review rather than treating frontend playback as authorization.

## Present limits

Implementation verification: `npm run lint`, `npm run type-check`, `npm run build`, and all 21 frontend tests passed. The added architecture checks cover complete runtime-component mapping, active/warning status preservation within groups, and the safety/ranking/physician boundaries. The 94 passing Python tests are previous framework validation; this frontend-only redesign changes no Python behavior and requires no new Python tests. Browser checks cover case selection, playback, decision navigation, seeking, restart, speed selection, on-demand inspection, and desktop/mobile layout. Tests demonstrate software behavior rather than clinical validity.

The frontend uses fixed, hand-authored graph positions for these five scenarios. General trace layout, arbitrary runtime case loading, durable replay persistence, live approvals, model output rendering, and external trace transport are not implemented. The page makes source data and simulated activity boundaries visible and keeps future integration separate from current runtime guarantees.
