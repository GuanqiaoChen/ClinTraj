"use client";

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Background, BackgroundVariant, BaseEdge, getSmoothStepPath, Handle, MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider, useReactFlow, useStore, type Edge, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import { ArrowRight, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Circle, CircleCheck, Crosshair, Expand, FileCheck2, FlaskConical, GitBranch, Lightbulb, Maximize2, Minimize2, Minus, Pause, Play, Plus, RotateCcw, Scan, Stethoscope, X } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { getWorkflowNodeHistory, getWorkflowSnapshot, NODE_HEIGHT, NODE_WIDTH, workflowStages, workflowSources } from "@/lib/pbl/diagnostic-workflow";
import { FLOW_LABELS } from "@/lib/ui-zh";
import "./diagnostic-workflow.css";

type Snapshot = ReturnType<typeof getWorkflowSnapshot>;
type DiagnosticNode = Snapshot["nodes"][number];
type DiagnosticEdge = Snapshot["edges"][number];
type NodeKind = DiagnosticNode["kind"];
type LocalAddition = { node: DiagnosticNode; edges: DiagnosticEdge[] };
type FlowNode = Node<{ item: DiagnosticNode; fresh: boolean; related: boolean; selected: boolean; connections: number }, "diagnostic">;
type FlowEdge = Edge<{ detourY?: number }, "diagnostic">;
const kindLabels: Record<NodeKind, string> = { hypothesis: "诊断假设", test: "检查决策", evidence: "医学证据", consultation: "专科会诊", conclusion: "诊断确认" };
const kindIcons = { hypothesis: Lightbulb, test: Scan, evidence: FileCheck2, consultation: Stethoscope, conclusion: CircleCheck };
const nodeColors = { hypothesis: "#9580d9", test: "#739bd5", evidence: "#72b6a7", consultation: "#c5a06d", conclusion: "#4b9b7b" };

function IconButton({ label, children, onClick, disabled, pressed }: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean; pressed?: boolean }) {
  return <button type="button" className={`pbl-icon-button ${pressed ? "is-on" : ""}`} title={label} aria-label={label} aria-pressed={pressed} onClick={onClick} disabled={disabled}>{children}</button>;
}

const DiagnosticGraphNode = memo(function DiagnosticGraphNode({ data }: NodeProps<FlowNode>) {
  const { item, fresh, related, selected, connections } = data;
  const Icon = kindIcons[item.kind];
  const StatusIcon = item.status === "ruled-out" ? X : item.status === "confirmed" || item.status === "complete" ? CheckCheck : item.status === "supported" ? Check : Circle;
  return <div className={`pbl-node kind-${item.kind} status-${item.status} ${fresh ? "is-new" : ""} ${selected ? "is-selected" : ""} ${related ? "" : "is-muted"}`} data-node-id={item.id}>
    <Handle type="target" position={Position.Left} />
    <div className="pbl-node-meta"><Icon size={13} /><span>{kindLabels[item.kind]}</span><span className="pbl-node-code">{item.id.startsWith("manual-") ? "＋" : item.id.replace(/^[a-z]+-/, "").slice(0, 8).toUpperCase()}</span></div>
    <strong>{item.title}</strong><p title={item.summary}>{item.summary}</p>
    <div className="pbl-node-footer"><span className="pbl-node-status"><StatusIcon size={11} />{item.statusLabel}</span>{connections > 1 && <span className="pbl-node-count"><GitBranch size={10} />{connections} 路径共用</span>}</div>
    <Handle type="source" position={Position.Right} />
  </div>;
});
const nodeTypes = { diagnostic: DiagnosticGraphNode };

function DiagnosticGraphEdge(props: EdgeProps<FlowEdge>) {
  const { sourceX, sourceY, targetX, targetY, data } = props;
  let [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition: Position.Right, targetPosition: Position.Left, borderRadius: 12 });
  if (data?.detourY !== undefined) {
    const lane = data.detourY;
    const exit = sourceX + 28;
    const entry = targetX - 28;
    const startDirection = Math.sign(lane - sourceY);
    const endDirection = Math.sign(targetY - lane);
    path = `M ${sourceX} ${sourceY} L ${exit - 8} ${sourceY} Q ${exit} ${sourceY} ${exit} ${sourceY + startDirection * 8} L ${exit} ${lane - startDirection * 8} Q ${exit} ${lane} ${exit + 8} ${lane} L ${entry - 8} ${lane} Q ${entry} ${lane} ${entry} ${lane + endDirection * 8} L ${entry} ${targetY - endDirection * 8} Q ${entry} ${targetY} ${entry + 8} ${targetY} L ${targetX} ${targetY}`;
    labelX = (exit + entry) / 2; labelY = lane;
  }
  return <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} style={props.style} label={props.label} labelX={labelX} labelY={labelY} labelStyle={props.labelStyle} labelBgStyle={props.labelBgStyle} labelBgPadding={props.labelBgPadding} labelBgBorderRadius={props.labelBgBorderRadius} />;
}
const edgeTypes = { diagnostic: DiagnosticGraphEdge };

function NodeComposer({ nodes, selectedId, onClose, onAdd }: { nodes: DiagnosticNode[]; selectedId: string | null; onClose: () => void; onAdd: (kind: "hypothesis" | "test" | "consultation", title: string, summary: string, parents: string[]) => void }) {
  const [kind, setKind] = useState<"hypothesis" | "test" | "consultation">("hypothesis");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [parents, setParents] = useState<string[]>(selectedId ? [selectedId] : []);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const headingId = useId();
  useEffect(() => { formRef.current?.querySelector<HTMLInputElement>("input[type=text]")?.focus(); }, []);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !parents.length) { setError("填写节点名称，并选择至少一个上游节点。"); return; }
    onAdd(kind, title.trim(), summary.trim(), parents);
  }
  return <><div className="pbl-composer-scrim" onClick={onClose} /><form ref={formRef} className="pbl-composer" role="dialog" aria-modal="true" aria-labelledby={headingId} onSubmit={submit} onKeyDown={event => {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    if (event.key === "Tab") {
      const fields = [...event.currentTarget.querySelectorAll<HTMLElement>('button, input, textarea, select, [tabindex="0"]')].filter(el => !el.hasAttribute("disabled"));
      if (event.shiftKey && document.activeElement === fields[0]) { event.preventDefault(); fields.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === fields.at(-1)) { event.preventDefault(); fields[0]?.focus(); }
    }
  }}>
    <header><h3 id={headingId}>追加节点</h3><IconButton label="关闭追加节点" onClick={onClose}><X size={16} /></IconButton></header>
    <div className="pbl-form-types" aria-label="节点类型">{(["hypothesis", "test", "consultation"] as const).map(value => <button key={value} type="button" className={kind === value ? "is-on" : ""} aria-pressed={kind === value} onClick={() => setKind(value)}>{kindLabels[value]}</button>)}</div>
    <label>节点名称<input type="text" value={title} onChange={event => setTitle(event.target.value)} maxLength={40} placeholder={kind === "hypothesis" ? "新的鉴别诊断" : "需要验证的检查或会诊"} required /></label>
    <label>验证目的<textarea value={summary} onChange={event => setSummary(event.target.value)} maxLength={240} rows={2} placeholder="需要回答的诊断问题" /></label>
    <fieldset><legend>连接上游节点 <span>可多选合流</span></legend>{nodes.filter(node => node.status !== "ruled-out" && node.kind !== "conclusion").map(node => <label className="pbl-parent-option" key={node.id}><input type="checkbox" checked={parents.includes(node.id)} onChange={event => setParents(current => event.target.checked ? [...current, node.id] : current.filter(id => id !== node.id))} /><span>{node.title}</span></label>)}</fieldset>
    {error && <p className="pbl-form-error" role="alert">{error}</p>}
    <footer><span>合成研究 · 本次推演</span><button className="pbl-button pbl-primary" type="submit"><Plus size={14} />添加并连接</button></footer>
  </form></>;
}

function WorkflowGraph() {
  const [stageIndex, setStageIndex] = useState(0);
  const [playRequested, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [canvasHeight, setCanvasHeight] = useState(520);
  const [composing, setComposing] = useState(false);
  const [additions, setAdditions] = useState<LocalAddition[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const panelRef = useRef<HTMLElement>(null);
  const sequence = useRef(0);
  const flow = useReactFlow<FlowNode>();
  const width = useStore(state => state.width);
  const height = useStore(state => state.height);
  const zoom = useStore(state => state.transform[2]);
  const reducedMotion = useReducedMotion();
  const duration = reducedMotion ? 0 : 550;
  const snapshot = useMemo(() => getWorkflowSnapshot(stageIndex), [stageIndex]);
  const visibleAdditions = useMemo(() => additions.filter(item => item.node.introducedAt <= stageIndex), [additions, stageIndex]);
  const diagnosticNodes = useMemo(() => [...snapshot.nodes, ...visibleAdditions.map(item => item.node)], [snapshot.nodes, visibleAdditions]);
  const diagnosticEdges = useMemo(() => [...snapshot.edges, ...visibleAdditions.flatMap(item => item.edges)].filter(edge => diagnosticNodes.some(node => node.id === edge.source) && diagnosticNodes.some(node => node.id === edge.target)), [snapshot.edges, visibleAdditions, diagnosticNodes]);
  const selected = diagnosticNodes.find(node => node.id === selectedId);
  const connected = useMemo(() => {
    if (!selectedId) return null;
    const ids = new Set([selectedId]);
    diagnosticEdges.forEach(edge => { if (edge.source === selectedId || edge.target === selectedId) { ids.add(edge.source); ids.add(edge.target); } });
    return ids;
  }, [selectedId, diagnosticEdges]);
  const nodes: FlowNode[] = useMemo(() => diagnosticNodes.map(item => ({
    id: item.id, type: "diagnostic", position: { x: item.x, y: item.y }, width: NODE_WIDTH, height: NODE_HEIGHT,
    data: { item, fresh: stageIndex > 0 && item.introducedAt === stageIndex, selected: selectedId === item.id, related: !connected || connected.has(item.id), connections: diagnosticEdges.filter(edge => edge.target === item.id && diagnosticNodes.find(node => node.id === edge.source)?.kind === "hypothesis").length },
    ariaLabel: `${kindLabels[item.kind]}：${item.title}，${item.statusLabel}，点击查看详情`, ariaRole: "button", selected: selectedId === item.id,
  })), [diagnosticNodes, diagnosticEdges, stageIndex, selectedId, connected]);
  const edges: FlowEdge[] = useMemo(() => diagnosticEdges.map(edge => {
    const ruledOut = edge.status === "ruled-out";
    const color = ruledOut ? "#bfc4cc" : edge.status === "active" ? "#9b88ce" : "#98a7b7";
    const source = diagnosticNodes.find(node => node.id === edge.source)!;
    const target = diagnosticNodes.find(node => node.id === edge.target)!;
    const obstacles = diagnosticNodes.filter(node => node.x > source.x && node.x < target.x && node.y + NODE_HEIGHT >= Math.min(source.y, target.y) && node.y <= Math.max(source.y, target.y) + NODE_HEIGHT);
    const detourY = obstacles.length ? Math.min(source.y, target.y, ...obstacles.map(node => node.y)) - 42 : undefined;
    return { ...edge, type: "diagnostic", data: { detourY }, animated: !reducedMotion && !ruledOut && edge.status === "active", interactionWidth: 16,
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 15, height: 15 },
      style: { stroke: color, strokeWidth: 1.45, strokeDasharray: ruledOut ? "4 5" : undefined, opacity: connected && !(connected.has(edge.source) && connected.has(edge.target)) ? 0.22 : 1 },
      labelStyle: { fontSize: 10, fill: ruledOut ? "#959ca7" : "#7c8291" }, labelBgStyle: { fill: "#fbfcfe", fillOpacity: 0.95 }, labelBgPadding: [5, 3] as [number, number], labelBgBorderRadius: 4,
    };
  }), [diagnosticEdges, diagnosticNodes, connected, reducedMotion]);
  const hypotheses = diagnosticNodes.filter(node => node.kind === "hypothesis");
  const ended = stageIndex === workflowStages.length - 1;
  const playing = playRequested && !ended;
  const history = selected && !selected.id.startsWith("manual-") ? getWorkflowNodeHistory(selected.id, stageIndex) : [];

  const fitAll = useCallback(() => { setFollow(false); void flow.fitView({ includeHiddenNodes: true, padding: 0.16, duration, maxZoom: 1, minZoom: 0.12 }); }, [flow, duration]);
  useEffect(() => {
    if (!follow || collapsed || !width || !height) return;
    const frame = requestAnimationFrame(() => {
      const focusIds = visibleAdditions.length && selectedId?.startsWith("manual-") ? [selectedId] : stageIndex === 0 ? snapshot.nodes.map(node => node.id) : snapshot.stage.focusNodeIds;
      // Virtualized off-screen nodes have declared dimensions but are not measured yet.
      // The snapshot itself contains only evidence visible at the selected stage.
      void flow.fitView({ nodes: focusIds.map(id => ({ id })), includeHiddenNodes: true, padding: { top: "68px", bottom: "118px", left: "48px", right: "48px" }, minZoom: 0.12, maxZoom: 1, duration });
    });
    return () => cancelAnimationFrame(frame);
  }, [stageIndex, snapshot.stage, snapshot.nodes, visibleAdditions.length, selectedId, flow, follow, collapsed, width, height, duration]);

  useEffect(() => {
    if (!playing || collapsed) return;
    const timer = window.setTimeout(() => {
      if (ended) { setPlaying(false); return; }
      setStageIndex(index => index + 1); setSelectedId(null);
    }, 4400 / speed);
    return () => window.clearTimeout(timer);
  }, [playing, collapsed, ended, stageIndex, speed]);

  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [expanded]);

  function goTo(index: number) { setStageIndex(index); setPlaying(false); setSelectedId(null); setComposing(false); setAnnouncement(""); }
  function selectNode(id: string) { setSelectedId(id); setPlaying(false); }
  function closeComposer() { setComposing(false); requestAnimationFrame(() => panelRef.current?.querySelector<HTMLButtonElement>('[aria-label="追加节点"]')?.focus()); }
  function addNode(kind: "hypothesis" | "test" | "consultation", title: string, summary: string, parents: string[]) {
    const parentNodes = diagnosticNodes.filter(node => parents.includes(node.id));
    const x = Math.max(...parentNodes.map(node => node.x)) + 320;
    let y = parentNodes.reduce((sum, node) => sum + node.y, 0) / parentNodes.length;
    const allPositions = [...getWorkflowSnapshot(workflowStages.length - 1).nodes, ...additions.map(item => item.node)];
    while (allPositions.some(node => Math.abs(node.x - x) < NODE_WIDTH + 20 && Math.abs(node.y - y) < NODE_HEIGHT + 36)) y += NODE_HEIGHT + 50;
    const id = `manual-${++sequence.current}`;
    const node: DiagnosticNode = {
      ...parentNodes[0], id, kind, title, summary: summary || "待补充验证依据", x, y, introducedAt: stageIndex,
      status: kind === "hypothesis" ? "candidate" : "active", statusLabel: kind === "hypothesis" ? "待验证" : "待审核", rationale: summary || "由研究者手动补充，等待诊断依据。", details: ["本次合成推演中手动追加的节点，未执行检查或生成检查结果。"], evidence: [], sourceIds: [],
      priority: undefined, burden: undefined,
      provenance: { ...parentNodes[0].provenance, label: "合成研究推演 · 研究者手动补充", evidenceIds: parents },
    };
    const addedEdges: DiagnosticEdge[] = parents.map(parent => ({ id: `${parent}-${id}`, source: parent, target: id, status: "active", introducedAt: stageIndex, label: kind === "hypothesis" ? "补充假设" : "继续验证" }));
    setAdditions(current => [...current, { node, edges: addedEdges }]); setSelectedId(id); setFollow(true); closeComposer();
    setAnnouncement(`已添加${title}，连接 ${parents.length} 条上游路径。`);
  }

  return <section ref={panelRef} className={`pbl-workflow ${expanded ? "is-expanded" : ""} ${collapsed ? "is-collapsed" : ""}`} style={{ "--pbl-canvas-height": `${canvasHeight}px` } as CSSProperties} aria-label="动态诊断工作流" onKeyDown={event => {
    const graphNode = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>(".react-flow__node") : null;
    if (graphNode && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); const id = graphNode.dataset.id; if (id) selectNode(id); }
    if (event.key === "Escape") { if (composing) closeComposer(); else if (selectedId) setSelectedId(null); else setExpanded(false); }
    if (expanded && event.key === "Tab" && !composing) {
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], select, [tabindex="0"]')].filter(el => el.getClientRects().length);
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
    }
  }}>
    <div className="pbl-panel-header"><div className="pbl-panel-title"><span className="pbl-mark"><GitBranch size={17} /></span><h2>诊断推演</h2><span className={`pbl-live-dot ${playing ? "is-playing" : ""}`} /><span className="pbl-status-text">{playing ? "推演中" : ended ? "已完成" : "待验证"}</span></div><div className="pbl-panel-actions">
      <IconButton label={collapsed ? "展开模块" : "收起模块"} onClick={() => { setCollapsed(value => !value); setPlaying(false); }}>{collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}</IconButton>
      <IconButton label={expanded ? "退出全屏" : "全屏展开"} pressed={expanded} onClick={() => { setExpanded(value => !value); setCollapsed(false); }}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</IconButton>
    </div></div>
    {!collapsed && <>
      <div className="pbl-toolbar"><div className="pbl-legend"><span><i className="hypothesis" />假设</span><span><i className="test" />检查 / 会诊</span><span><i className="evidence" />证据</span><span><i className="ruled-out" />已否决路径</span></div><div className="pbl-toolbar-actions"><button type="button" className="pbl-button" aria-label="追加节点" onClick={() => { setPlaying(false); setComposing(true); }}><Plus size={13} />追加节点</button></div></div>
      <div className="pbl-canvas-shell">
        <div className="pbl-canvas" data-testid="diagnostic-canvas">
          <ReactFlow<FlowNode, FlowEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} nodesDraggable={false} nodesConnectable={false} edgesFocusable={false} deleteKeyCode={null} minZoom={0.12} maxZoom={1.6} fitView fitViewOptions={{ padding: 0.18, maxZoom: 1 }} onNodeClick={(_, node) => selectNode(node.id)} onPaneClick={() => setSelectedId(null)} onMoveStart={event => { if (event) setFollow(false); }} ariaLabelConfig={FLOW_LABELS} aria-label="诊断假设和检查验证路径" attributionPosition="bottom-right" preventScrolling={false} onlyRenderVisibleElements>
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#dce1ea" />
            <MiniMap<FlowNode> pannable zoomable style={{ width: 144, height: 86 }} nodeStrokeWidth={0} nodeColor={node => node.data.item.status === "ruled-out" ? "#d2d5da" : nodeColors[node.data.item.kind]} maskColor="rgba(236,239,245,.65)" ariaLabel="工作流全局导航" />
          </ReactFlow>
          <div className="pbl-graph-stat"><span>{String(stageIndex + 1).padStart(2, "0")}</span> / {String(workflowStages.length).padStart(2, "0")}<i />{snapshot.stage.label}</div>
          <button className={`pbl-button pbl-follow ${follow ? "is-on" : ""}`} aria-pressed={follow} onClick={() => setFollow(value => !value)}><Crosshair size={12} />跟随进展</button>
          <div className="pbl-view-tools"><IconButton label="缩小画布" onClick={() => { setFollow(false); void flow.zoomOut({ duration }); }}><Minus size={15} /></IconButton><span>{Math.round(zoom * 100)}%</span><IconButton label="放大画布" onClick={() => { setFollow(false); void flow.zoomIn({ duration }); }}><Plus size={15} /></IconButton><i /><IconButton label="查看完整工作流" onClick={fitAll}><Expand size={14} /></IconButton><i /><IconButton label="减小模块高度" disabled={expanded || canvasHeight <= 360} onClick={() => setCanvasHeight(value => Math.max(360, value - 80))}><ChevronUp size={15} /></IconButton><IconButton label="增大模块高度" disabled={expanded || canvasHeight >= 840} onClick={() => setCanvasHeight(value => Math.min(840, value + 80))}><ChevronDown size={15} /></IconButton></div>
        </div>
        {selected && <aside className="pbl-inspector" aria-label="节点详情" key={selected.id}>
          <div className="pbl-inspector-top"><span className="pbl-inspector-kind">{kindLabels[selected.kind]}</span><IconButton label="关闭节点详情" onClick={() => setSelectedId(null)}><X size={15} /></IconButton></div>
          <h3>{selected.title}</h3><span className={`pbl-detail-status status-${selected.status}`}>{selected.statusLabel}</span>
          <section><h4>{selected.kind === "test" || selected.kind === "consultation" ? "为什么选择这一步" : "判断依据"}</h4><p>{selected.rationale}</p></section>
          {(selected.priority || selected.burden) && <div className="pbl-detail-metrics">{selected.priority && <span>优先级<strong>{selected.priority}</strong></span>}{selected.burden && <span>检查负担<strong>{selected.burden}</strong></span>}</div>}
          {selected.details.length > 0 && <section><h4>诊断信息</h4><ul>{selected.details.map((text, index) => <li key={index}>{text}</li>)}</ul></section>}
          {selected.evidence.length > 0 && <section><h4>可见证据</h4><ul>{selected.evidence.map((text, index) => <li key={index}>{text}</li>)}</ul></section>}
          <section className="pbl-related"><h4>关联节点</h4>{diagnosticNodes.filter(node => node.id !== selected.id && connected?.has(node.id)).map(node => <button key={node.id} onClick={() => { selectNode(node.id); void flow.fitView({ nodes: [{ id: node.id }], padding: 0.5, maxZoom: 1, duration }); }}><span>{node.title}</span><ChevronRight size={13} /></button>)}</section>
          {history.length > 0 && <section className="pbl-history"><h4>状态演变</h4>{history.map((entry, index) => <div key={index}><i /><p><strong>{entry.stageLabel} · {entry.statusLabel}</strong><br />{entry.summary}</p></div>)}</section>}
          {selected.sourceIds.length > 0 && <section className="pbl-source"><h4>知识依据</h4>{selected.sourceIds.map(id => workflowSources.find(source => source.id === id)).filter(source => !!source).map(source => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.title}<ArrowRight size={11} /></a>)}</section>}
          <p className="pbl-provenance"><FlaskConical size={11} />合成研究病例 · {selected.id.startsWith("manual-") ? "手动补充" : "SYN-PBL-001"}<br />{selected.id}</p>
          {selected.status !== "ruled-out" && selected.kind !== "conclusion" && <button className="pbl-button" onClick={() => setComposing(true)}><Plus size={13} />从此节点继续</button>}
        </aside>}
        {composing && <NodeComposer nodes={diagnosticNodes} selectedId={selected?.status !== "ruled-out" && selected?.kind !== "conclusion" ? selectedId : null} onClose={closeComposer} onAdd={addNode} />}
      </div>
      <div className="pbl-stage-bar"><div className="pbl-stage-copy"><span className="pbl-stage-number">{String(stageIndex + 1).padStart(2, "0")}</span><div><strong>{snapshot.stage.title}</strong><p>{snapshot.stage.summary}</p></div></div><div className="pbl-stage-actions">
        <IconButton label="上一步" disabled={stageIndex === 0} onClick={() => goTo(stageIndex - 1)}><ChevronLeft size={15} /></IconButton>
        <button className="pbl-button pbl-primary" onClick={() => { if (ended) goTo(0); else goTo(stageIndex + 1); }}>{ended ? <RotateCcw size={13} /> : <ArrowRight size={14} />}{ended ? "重新推演" : "下一步"}</button>
      </div></div>
      <div className="pbl-timeline" aria-label="推演阶段">{workflowStages.map((stage, index) => <button key={stage.id} className={`pbl-stage-button ${stageIndex === index ? "is-current" : ""} ${stageIndex > index ? "is-past" : ""}`} aria-current={stageIndex === index ? "step" : undefined} aria-label={`阶段 ${index + 1}：${stage.label}`} onClick={() => goTo(index)}><span className="pbl-stage-dot">{index < stageIndex ? <Check size={11} /> : String(index + 1).padStart(2, "0")}</span><span>{stage.label}</span></button>)}</div>
      <div className="pbl-bottom-bar"><div><button className="pbl-button" aria-label={playing ? "暂停推演" : "自动推演"} onClick={() => { if (ended) setStageIndex(0); setSelectedId(null); setPlaying(!playing); }}>{playing ? <Pause size={12} /> : <Play size={12} />}{playing ? "暂停" : "自动推演"}</button><select value={speed} aria-label="推演速度" onChange={event => setSpeed(Number(event.target.value))}><option value={1}>1×</option><option value={2}>2×</option></select><IconButton label="回到起点" onClick={() => { goTo(0); setFollow(true); }}><RotateCcw size={12} /></IconButton></div><span className="pbl-bottom-legend">{hypotheses.filter(node => node.status !== "ruled-out").length} 个保留假设<span>·</span>{hypotheses.filter(node => node.status === "ruled-out").length} 条终止路径<span>·</span>{diagnosticNodes.length} 个节点</span></div>
    </>}
    <span className="sr-only" role="status" aria-live="polite">{announcement || snapshot.stage.title}</span>
  </section>;
}

/** Self-contained synthetic research panel; no session API writes or clinical orders. */
export function DiagnosticWorkflow() { return <ReactFlowProvider><WorkflowGraph /></ReactFlowProvider>; }
