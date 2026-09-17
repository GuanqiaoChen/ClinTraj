# 中文医生工作台演示

`http://localhost:3000/demo` 现为 **2 分 36 秒的中文慢阻肺医生工作台体验**。它使用当前工作台的患者状态、三候选、医生审核和证据录入布局，按预设时间轴展示两轮完整流程：

1. 输入合成患者的主诉、现病史、查体和未知结果，创建会话。
2. 展示第一轮生成过程与全部三个候选。
3. 医生勾选两项方案、填写理由并确认。
4. 临床时间推进约一小时，输入并提交新的合成血气、影像与观察结果。
5. 基于已提交证据生成第二轮三候选，医生再次选择并确认。
6. 展示完成状态，可从头重播或回看章节。

点击 **开始观看**，支持播放/暂停、拖动进度条、七章跳转、0.75×/1×/1.5×/2×倍速和浏览器全屏。空格切换播放，左右箭头前后 5 秒，R 从头重播；键盘焦点位于控件时保留原有操作。切换到后台标签会暂停，返回后可以继续。视频式演示使用中文字幕，没有配音，也不需要下载视频文件。

患者、血气结果、候选与医生操作全部为原创合成脚本。演示没有模型/API/数据库请求，不读写真实工作台会话或浏览器中的患者会话记录；病例声明与证据 provenance 保留在脚本中。新结果在录入提交前只作为输入草稿，不提前进入当前可见证据。医学参考使用公开 NICE 指南，来源可在候选下展开；这不是实际检索结果或临床有效性验证。

实现：`web/components/demo/WorkspaceTour.tsx`、同目录 `workspace-tour.css`、`web/lib/demo/workspace-tour.ts`。时间轴投影为纯函数，任意定位和重播都会从相同时间重建完整状态。测试覆盖时序/来源、多选与三候选保留，以及实际 React 播放控件的暂停、倍速、跳转、末尾和重播；不需要运行 Python/模型。

本次验证：类型检查、ESLint、30 项前端测试与生产构建通过；localhost 演示、原工作台与健康接口通过 HTTP 检查。浏览器自动视觉检查因当前浏览器连接不可用未执行，布局可在本地直接查看。

旧版五病例轨迹图演示保留在 [http://localhost:3000/demo/trajectory](http://localhost:3000/demo/trajectory)，真实工作台仍是 [http://localhost:3000/workspace](http://localhost:3000/workspace)。根路径 `/` 继续进入真实工作台。下文记录旧版轨迹图的操作方式。

## 旧版轨迹图回放

The `/demo/trajectory` page is an independent Next.js frontend in `web/`. It replays authored synthetic clinical scenarios through two synchronized React Flow views: a clinical decision trajectory and the implemented ClinTraj method's component activity. It makes no model, clinical backend, database, LangGraph, retrieval-service, or SSE calls. Next.js serves the page and its local assets; development mode also uses its normal development connection.

## Run locally

Use Node.js 22.12 or later and npm (including the jsdom-based player tests). From the repository root:

```bash
cd web
npm ci
npm run dev
```

Open [http://localhost:3000/demo](http://localhost:3000/demo) for the new physician-workspace tour, or [http://localhost:3000/demo/trajectory](http://localhost:3000/demo/trajectory) for the legacy graph replay. The server binds to the loopback interface. `/` redirects to `/workspace`, which additionally needs the backend. Neither replay requires a Python environment, source workbook, API key, or model service. Stop a foreground server with `Ctrl+C`.

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
