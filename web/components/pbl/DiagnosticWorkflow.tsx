"use client";

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Background, BackgroundVariant, BaseEdge, getSmoothStepPath, Handle, MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider, ViewportPortal, useReactFlow, useStore, useUpdateNodeInternals, type Edge, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import { ArrowDownRight, ArrowRight, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Crosshair, Expand, FileCheck2, GitBranch, Layers2, Maximize2, Minimize2, Minus, Pause, Play, Plus, RotateCcw, ScanLine, Search, Stethoscope, X } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { getWorkflowSnapshot, workflowStages, workflowProvenance, type WorkflowNode, type WorkflowEdge, type WorkflowNodeKind } from "@/lib/pbl/diagnostic-workflow";
import { buildWorkflowView, getRelatedPathIds, VIEW_NODE_WIDTH, VIEW_NODE_HEIGHT } from "@/lib/pbl/workflow-view";
import { planWorkflowRoutes, type WorkflowRoute } from "@/lib/pbl/workflow-routing";
import { FLOW_LABELS } from "@/lib/ui-zh";
import { WorkflowInspector } from "./WorkflowInspector";
import "./diagnostic-workflow.css";

type Addition = { node: WorkflowNode; edges: WorkflowEdge[] };
type Port = { id: string; offset: number };
type GraphNode = Node<{ item: WorkflowNode; selected: boolean; muted: boolean; fresh: boolean; shared: number; incoming: Port[]; outgoing: Port[]; onAdd: (id: string) => void }, "diagnosis">;
type GraphEdge = Edge<WorkflowRoute & { description: string; [key: string]: unknown }, "path">;
type AddKind = "hypothesis" | "test" | "consultation";
const labels: Record<WorkflowNodeKind, string> = { hypothesis: "假设", test: "检查", evidence: "证据", consultation: "检查", conclusion: "假设" };
const icons = { hypothesis: GitBranch, test: ScanLine, evidence: FileCheck2, consultation: Stethoscope, conclusion: CheckCheck };

function Tool({ label, children, onClick, disabled, pressed }: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean; pressed?: boolean }) {
  return <button type="button" className="dw-icon-button" aria-label={label} title={label} disabled={disabled} aria-pressed={pressed} onClick={onClick}>{children}</button>;
}

const DiagnosisNode = memo(function DiagnosisNode({ data }: NodeProps<GraphNode>) {
  const { item, selected, muted, fresh, shared } = data;
  const Icon = icons[item.kind];
  const closed = item.status === "ruled-out";
  const updateNodeInternals = useUpdateNodeInternals();
  const portKey = JSON.stringify([data.incoming, data.outgoing]);
  useEffect(() => { updateNodeInternals(item.id); }, [item.id, portKey, updateNodeInternals]);
  return <article className={`dw-node dw-kind-${item.kind} dw-status-${item.status}${selected ? " is-selected" : ""}${muted ? " is-muted" : ""}${fresh ? " is-new" : ""}`} data-testid="diagnostic-node" data-node-id={item.id}>
    {data.incoming.map(port => <Handle key={port.id} id={port.id} type="target" position={Position.Top} style={{ left: `${port.offset * 100}%` }} />)}
    <div className="dw-node-top"><span><Icon size={14} />{labels[item.kind]}</span>{shared > 1 && <span className="dw-shared"><GitBranch size={12} />共用 · {shared}</span>}{fresh && shared < 2 && <span className="dw-new-label">新增</span>}</div>
    <h3>{item.title}</h3><p>{item.summary}</p>
    <div className="dw-node-bottom"><span>{closed ? <X size={12} /> : item.status === "confirmed" || item.status === "complete" ? <Check size={12} /> : <i />}{item.statusLabel}</span><ArrowRight size={13} /></div>
    {!closed && item.kind !== "conclusion" && <button className="dw-node-add nodrag nopan" title="继续此路径" aria-label={`从${item.title}继续`} onClick={event => { event.stopPropagation(); data.onAdd(item.id); }}><Plus size={13} /></button>}
    {data.outgoing.map(port => <Handle key={port.id} id={port.id} type="source" position={Position.Bottom} style={{ left: `${port.offset * 100}%` }} />)}
  </article>;
});

function DiagnosisEdge(props: EdgeProps<GraphEdge>) {
  const { sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, data } = props;
  let [path] = getSmoothStepPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, sourcePosition: Position.Bottom, targetPosition: Position.Top, borderRadius: 9, centerY: data?.centerY });
  if (data?.detourX !== undefined) {
    const lane = data.detourX, exit = data.centerY, entry = ty - (18 + data.targetOffset * 30);
    const a = Math.sign(lane - sx), b = Math.sign(tx - lane);
    path = `M${sx},${sy} L${sx},${exit - 8} Q${sx},${exit} ${sx + a * 8},${exit} L${lane - a * 8},${exit} Q${lane},${exit} ${lane},${exit + 8} L${lane},${entry - 8} Q${lane},${entry} ${lane + b * 8},${entry} L${tx - b * 8},${entry} Q${tx},${entry} ${tx},${entry + 8} L${tx},${ty}`;
  }
  return <g><title>{data?.description}</title><path d={path} fill="none" stroke="#f5f7f8" strokeWidth={7} style={{ pointerEvents: "none", opacity: props.style?.opacity }} /><BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} style={props.style} interactionWidth={18} /></g>;
}
const nodeTypes = { diagnosis: DiagnosisNode };
const edgeTypes = { path: DiagnosisEdge };

function Composer({ nodes, parentId, onClose, onAdd }: { nodes: WorkflowNode[]; parentId: string | null; onClose: () => void; onAdd: (kind: AddKind, title: string, purpose: string, parents: string[]) => void }) {
  const [kind, setKind] = useState<AddKind>("hypothesis");
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [parents, setParents] = useState<string[]>(parentId ? [parentId] : []);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const headingId = useId();
  useEffect(() => { input.current?.focus(); }, []);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || parents.length === 0) { setError("填写节点名称，并选择至少一个上游节点。"); return; }
    onAdd(kind, title.trim(), purpose.trim(), parents);
  }
  return <div className="dw-modal-layer" onClick={onClose}><form className="dw-composer" data-testid="diagnostic-composer" role="dialog" aria-modal="true" aria-labelledby={headingId} onClick={event => event.stopPropagation()} onSubmit={submit} onKeyDown={event => {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    if (event.key === "Tab") {
      const fields = [...event.currentTarget.querySelectorAll<HTMLElement>("button, input, textarea")].filter(field => !field.hasAttribute("disabled"));
      if (event.shiftKey && document.activeElement === fields[0]) { event.preventDefault(); fields.at(-1)?.focus(); }
      if (!event.shiftKey && document.activeElement === fields.at(-1)) { event.preventDefault(); fields[0]?.focus(); }
    }
  }}>
    <header><div><span className="dw-overline">扩展验证路径</span><h3 id={headingId}>添加一个节点</h3></div><Tool label="关闭追加节点" onClick={onClose}><X size={18} /></Tool></header>
    <div className="dw-composer-types">{(["hypothesis", "test", "consultation"] as const).map(value => { const Icon = icons[value]; return <button type="button" key={value} aria-pressed={kind === value} onClick={() => setKind(value)}><Icon size={17} />{value === "hypothesis" ? "假设" : value === "test" ? "检查" : "会诊"}</button>; })}</div>
    <label className="dw-field">节点名称<input ref={input} type="text" value={title} onChange={event => setTitle(event.target.value)} maxLength={40} required placeholder="输入假设、检查或会诊名称" /></label>
    <label className="dw-field">验证目的<textarea value={purpose} onChange={event => setPurpose(event.target.value)} maxLength={240} rows={2} placeholder="这一步需要回答什么问题？" /></label>
    <fieldset><legend>连接到 <span>{parents.length} 个上游节点</span></legend><div className="dw-parent-search"><Search size={14} /><input aria-label="搜索上游节点" placeholder="搜索已有节点" value={query} onChange={event => setQuery(event.target.value)} /></div><div className="dw-parent-list">{nodes.filter(node => node.status !== "ruled-out" && node.kind !== "conclusion" && node.title.includes(query)).map(node => <label key={node.id} className="dw-parent-option"><input type="checkbox" aria-label={node.title} checked={parents.includes(node.id)} onChange={event => setParents(current => event.target.checked ? [...current, node.id] : current.filter(id => id !== node.id))} /><span>{node.title}<small>{labels[node.kind]}</small></span></label>)}</div></fieldset>
    {error && <p className="dw-form-error" role="alert">{error}</p>}
    <footer><span>仅添加到本次合成推演</span><button type="submit" className="dw-button dw-button-primary">添加并连接<ArrowRight size={15} /></button></footer>
  </form></div>;
}

function WorkflowCanvas() {
  const [stageIndex, setStageIndex] = useState(0);
  const [playRequested, setPlayRequested] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [mode, setMode] = useState<"focus" | "all">("focus");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [focusedEdgeId, setFocusedEdgeId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [bodyHeight, setBodyHeight] = useState(600);
  const [composing, setComposing] = useState(false);
  const [composerParent, setComposerParent] = useState<string | null>(null);
  const [additions, setAdditions] = useState<Addition[]>([]);
  const [mapVisible, setMapVisible] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [following, setFollowing] = useState(true);
  const panel = useRef<HTMLElement>(null);
  const sequence = useRef(0);
  const flow = useReactFlow<GraphNode, GraphEdge>();
  const width = useStore(state => state.width);
  const height = useStore(state => state.height);
  const zoom = useStore(state => state.transform[2]);
  const reducedMotion = useReducedMotion();
  const duration = reducedMotion ? 0 : 400;
  const snapshot = useMemo(() => getWorkflowSnapshot(stageIndex), [stageIndex]);
  const local = useMemo(() => additions.filter(addition => addition.node.introducedAt <= stageIndex), [additions, stageIndex]);
  const allNodes = useMemo(() => [...snapshot.nodes, ...local.map(item => item.node)], [snapshot.nodes, local]);
  const allEdges = useMemo(() => [...snapshot.edges, ...local.flatMap(item => item.edges)].map(edge => allNodes.find(node => node.id === edge.source)?.status === "ruled-out" ? { ...edge, status: "ruled-out" as const } : edge), [snapshot.edges, local, allNodes]);
  const view = useMemo(() => buildWorkflowView({ snapshot, additions: { nodes: local.map(item => item.node), edges: allEdges.filter(edge => edge.target.startsWith("manual-")) }, mode }), [snapshot, local, allEdges, mode]);
  const selected = allNodes.find(node => node.id === selectedId);
  const relatedIds = useMemo(() => selectedId ? getRelatedPathIds(allEdges, selectedId) : null, [allEdges, selectedId]);
  const activeEdgeId = hoveredEdgeId || focusedEdgeId;
  const activeEdge = view.edges.find(edge => edge.id === activeEdgeId);
  const routes = useMemo(() => planWorkflowRoutes(view.nodes, view.edges), [view]);
  const hypotheses = allNodes.filter(node => node.kind === "hypothesis");
  const ended = stageIndex === workflowStages.length - 1;
  const playing = playRequested && !ended;
  const recommended = allNodes.find(node => node.kind === "test" && node.status === "active");
  const openComposer = useCallback((id: string | null = null) => { setComposerParent(id); setComposing(true); setPlayRequested(false); }, []);
  const nodes: GraphNode[] = useMemo(() => view.nodes.map(item => ({ id: item.id, type: "diagnosis", position: { x: item.x, y: item.y }, width: VIEW_NODE_WIDTH, height: VIEW_NODE_HEIGHT,
    data: { item, selected: item.id === selectedId, muted: activeEdge ? item.id !== activeEdge.source && item.id !== activeEdge.target : relatedIds !== null && !relatedIds.has(item.id), fresh: stageIndex > 0 && item.introducedAt === stageIndex, shared: allEdges.filter(edge => edge.target === item.id && allNodes.find(node => node.id === edge.source)?.kind === "hypothesis").length,
      incoming: view.edges.filter(edge => edge.target === item.id).map(edge => ({ id: `in-${edge.id}`, offset: routes.get(edge.id)!.targetOffset })), outgoing: view.edges.filter(edge => edge.source === item.id).map(edge => ({ id: `out-${edge.id}`, offset: routes.get(edge.id)!.sourceOffset })), onAdd: openComposer },
    ariaLabel: `${labels[item.kind]}：${item.title}，${item.statusLabel}`, ariaRole: "button", selected: item.id === selectedId,
  })), [view, selectedId, relatedIds, activeEdge, routes, stageIndex, allEdges, allNodes, openComposer]);
  const edges: GraphEdge[] = useMemo(() => view.edges.map(edge => {
    const source = view.nodes.find(node => node.id === edge.source)!;
    const target = view.nodes.find(node => node.id === edge.target)!;
    const highlighted = edge.id === activeEdgeId;
    const color = edge.status === "ruled-out" ? "#bbc1c9" : highlighted ? "#4965a5" : "#8694a7";
    const muted = activeEdgeId ? !highlighted : relatedIds && !(relatedIds.has(edge.source) && relatedIds.has(edge.target));
    return { ...edge, label: undefined, type: "path", sourceHandle: `out-${edge.id}`, targetHandle: `in-${edge.id}`, data: { ...routes.get(edge.id)!, description: `${source.title} → ${target.title}` }, animated: false, zIndex: highlighted ? 4 : 0,
      markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color }, style: { stroke: color, strokeWidth: highlighted ? 2.5 : 1.65, strokeDasharray: edge.status === "ruled-out" ? "4 5" : undefined, opacity: muted ? 0.14 : 1 },
    };
  }), [view, relatedIds, activeEdgeId, routes]);

  const fit = useCallback(() => void flow.fitView({ includeHiddenNodes: true, padding: { top: "56px", bottom: "68px", left: "28px", right: "28px" }, minZoom: 0.12, maxZoom: 1, duration }), [flow, duration]);
  useEffect(() => {
    if (!following || collapsed || !width || !height) return;
    const frame = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(frame);
  }, [fit, following, collapsed, width, height, stageIndex, local.length, mode]);
  useEffect(() => {
    if (!playing || collapsed || composing) return;
    const timer = window.setTimeout(() => { setStageIndex(index => Math.min(index + 1, workflowStages.length - 1)); setSelectedId(null); setFollowing(true); }, 5000 / speed);
    return () => window.clearTimeout(timer);
  }, [playing, collapsed, composing, stageIndex, speed]);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [expanded]);

  function goTo(index: number) { setStageIndex(index); setPlayRequested(false); setSelectedId(null); setHoveredEdgeId(null); setFocusedEdgeId(null); setComposing(false); setFollowing(true); setAnnouncement(""); }
  function select(id: string) { setSelectedId(id); setFocusedEdgeId(null); setPlayRequested(false); }
  function closeComposer() { setComposing(false); requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>('[aria-label="追加节点"]')?.focus()); }
  function add(kind: AddKind, title: string, purpose: string, parents: string[]) {
    const upstream = allNodes.filter(node => parents.includes(node.id));
    const id = `manual-${++sequence.current}`;
    const node: WorkflowNode = { id, kind, title, summary: purpose || "等待验证依据", status: kind === "hypothesis" ? "candidate" : "active", statusLabel: kind === "hypothesis" ? "待验证" : "待审核", x: Math.max(...upstream.map(item => item.x)) + 320, y: Math.max(...allNodes.map(item => item.y)) + 180, introducedAt: stageIndex, rationale: purpose || "研究者补充的诊断问题，等待验证。", details: ["本次合成推演中手动追加的节点，未执行检查或生成检查结果。"], evidence: [], sourceIds: [], provenance: { ...workflowProvenance, label: "研究者手动补充 · 合成研究", evidenceIds: parents } };
    setAdditions(current => [...current, { node, edges: parents.map(source => ({ id: `${source}-${id}`, source, target: id, status: "active", introducedAt: stageIndex, label: parents.length > 1 ? "联合验证" : undefined })) }]);
    setSelectedId(id); setFollowing(true); closeComposer(); setAnnouncement(`已添加${title}，连接 ${parents.length} 条上游路径。`);
  }

  return <section ref={panel} className={`dw-workflow${expanded ? " is-expanded" : ""}${collapsed ? " is-collapsed" : ""}`} aria-label="动态诊断工作流" style={{ "--dw-body-height": `${bodyHeight}px` } as CSSProperties} onKeyDown={event => {
    const graphNode = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>(".react-flow__node") : null;
    if (graphNode && event.target === graphNode && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); if (graphNode.dataset.id) select(graphNode.dataset.id); }
    if (event.key === "Escape") { if (composing) closeComposer(); else if (selectedId) setSelectedId(null); else setExpanded(false); }
    if (expanded && event.key === "Tab" && !composing) {
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], select, summary, [tabindex="0"]')].filter(element => element.getClientRects().length);
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
    }
  }}>
    <header className="dw-header"><div className="dw-title"><GitBranch size={19} /><h2>诊断路径</h2></div><div className="dw-header-tools"><div className="dw-view-switch" aria-label="画布视图"><button aria-pressed={mode === "focus"} onClick={() => { setMode("focus"); setFollowing(true); }}>当前推演</button><button aria-pressed={mode === "all"} onClick={() => { setMode("all"); setFollowing(true); }}>全部路径</button></div><i /><Tool label={collapsed ? "展开模块" : "收起模块"} onClick={() => { setCollapsed(value => !value); setExpanded(false); setPlayRequested(false); }}>{collapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}</Tool><Tool label={expanded ? "退出全屏" : "全屏展开"} onClick={() => { setExpanded(value => !value); setCollapsed(false); }}>{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</Tool></div></header>
    {!collapsed && <><div className="dw-body">
      <aside className="dw-hypotheses" aria-label="诊断假设列表"><div className="dw-rail-heading"><h3>诊断假设</h3><span>{String(hypotheses.length).padStart(2, "0")}</span></div><div className="dw-hypothesis-list">{hypotheses.map((hypothesis, index) => <button key={hypothesis.id} className={`dw-hypothesis dw-status-${hypothesis.status}${selectedId === hypothesis.id ? " is-selected" : ""}`} aria-label={`聚焦假设：${hypothesis.title}`} aria-pressed={selectedId === hypothesis.id} onClick={() => select(hypothesis.id)}><span className="dw-hypothesis-number">{hypothesis.status === "ruled-out" ? <X size={12} /> : hypothesis.status === "confirmed" ? <Check size={12} /> : String(index + 1).padStart(2, "0")}</span><span><strong>{hypothesis.title}</strong><small><i />{hypothesis.statusLabel}</small></span><ChevronRight size={13} /></button>)}</div>
        <button className="dw-add-button" aria-label="追加节点" onClick={() => openComposer()}><Plus size={16} />添加节点</button>
        <div className="dw-rail-context"><span className="dw-overline">{recommended ? "检查" : "证据"}</span>{recommended ? <button onClick={() => select(recommended.id)}><ScanLine size={17} /><strong>{recommended.title}</strong><ArrowDownRight size={14} /></button> : <strong>{snapshot.stage.title}</strong>}<p>{recommended?.priority || snapshot.stage.summary}</p>{recommended && <span className="dw-burden">{recommended.burden}</span>}</div>

      </aside>
      <div className="dw-canvas" data-testid="diagnostic-canvas">
        {!following && <div className="dw-canvas-heading"><button className="dw-recenter" aria-label="跟随进展" onClick={() => { setFollowing(true); fit(); }}><Crosshair size={14} />定位当前</button></div>}
        <ReactFlow<GraphNode, GraphEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} nodesDraggable={false} nodesConnectable={false} edgesFocusable={false} deleteKeyCode={null} minZoom={0.12} maxZoom={1.6} fitView fitViewOptions={{ includeHiddenNodes: true, padding: 0.15, maxZoom: 1 }} onNodeClick={(_, node) => select(node.id)} onPaneClick={() => { setSelectedId(null); setFocusedEdgeId(null); }} onEdgeMouseEnter={(_, edge) => setHoveredEdgeId(edge.id)} onEdgeMouseLeave={() => setHoveredEdgeId(null)} onEdgeClick={(_, edge) => { setFocusedEdgeId(edge.id); setSelectedId(edge.target); setPlayRequested(false); }} onMoveStart={event => { if (event) setFollowing(false); }} ariaLabelConfig={FLOW_LABELS} aria-label="诊断验证画布" preventScrolling={false} onlyRenderVisibleElements>
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#dce2e5" />
          <ViewportPortal>{view.rows.map(row => <div key={row.y} className="dw-row-label" style={{ left: 0, top: row.y - 34, width: Math.max(...view.nodes.map(node => node.x)) + VIEW_NODE_WIDTH }}>{row.label}<span /></div>)}</ViewportPortal>
          {mapVisible && <MiniMap<GraphNode> pannable zoomable style={{ width: 154, height: 92 }} nodeColor={node => node.data.item.status === "ruled-out" ? "#d2d5d8" : node.data.item.kind === "hypothesis" ? "#bdc8eb" : node.data.item.kind === "evidence" ? "#b9d3c8" : "#a3bed3"} maskColor="rgba(237,241,243,.7)" ariaLabel="工作流全局导航" />}
        </ReactFlow>
        <div className="dw-canvas-bottom"><div className="dw-legend"><span><i className="hypothesis" />假设</span><span><i className="test" />检查</span><span><i className="evidence" />证据</span><span><i className="closed" />已终止</span></div><div className="dw-map-tools"><Tool label="缩小画布" onClick={() => { setFollowing(false); void flow.zoomOut({ duration }); }}><Minus size={15} /></Tool><span>{Math.round(zoom * 100)}%</span><Tool label="放大画布" onClick={() => { setFollowing(false); void flow.zoomIn({ duration }); }}><Plus size={15} /></Tool><i /><Tool label="查看完整工作流" onClick={() => { setMode("all"); setFollowing(true); }}><Expand size={15} /></Tool><Tool label="显示缩略图" pressed={mapVisible} onClick={() => setMapVisible(value => !value)}><Layers2 size={15} /></Tool></div></div>
      </div>
      <div className="dw-detail-dock" data-testid="diagnostic-detail-dock">{selected ? <WorkflowInspector node={selected} stageIndex={stageIndex} related={allNodes.filter(node => node.id !== selected.id && allEdges.some(edge => (edge.source === selected.id && edge.target === node.id) || (edge.target === selected.id && edge.source === node.id)))} onClose={() => setSelectedId(null)} onSelect={select} onContinue={() => openComposer(selected.id)} /> : <div className="dw-detail-placeholder"><ScanLine size={23} /><strong>节点详情</strong><p>选择节点查看依据</p></div>}</div>
    </div>
    <footer className="dw-footer"><div className="dw-playback"><Tool label={playing ? "暂停推演" : "自动推演"} onClick={() => { if (ended) goTo(0); setPlayRequested(!playing); setSelectedId(null); setFollowing(true); }}>{playing ? <Pause size={15} /> : <Play size={15} />}</Tool><select aria-label="推演速度" value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value={1}>1×</option><option value={2}>2×</option></select></div><nav className="dw-timeline" aria-label="推演阶段">{workflowStages.map((stage, index) => <button data-testid="diagnostic-stage" key={stage.id} aria-label={`阶段 ${index + 1}：${stage.label}`} aria-current={stageIndex === index ? "step" : undefined} className={index < stageIndex ? "is-past" : ""} onClick={() => goTo(index)}><span>{index < stageIndex ? <Check size={11} /> : index + 1}</span><strong>{stage.label}</strong></button>)}</nav><div className="dw-advance"><Tool label="上一步" disabled={stageIndex === 0} onClick={() => goTo(stageIndex - 1)}><ChevronLeft size={16} /></Tool><button className="dw-button dw-button-primary" aria-label={ended ? "重新推演" : "下一步"} onClick={() => goTo(ended ? 0 : stageIndex + 1)}>{ended ? <RotateCcw size={14} /> : null}{ended ? "重新推演" : "推进一步"}{!ended && <ArrowRight size={15} />}</button></div></footer>
    <div className="dw-resize-bar"><div><Tool label="减小模块高度" disabled={expanded || bodyHeight <= 420} onClick={() => setBodyHeight(value => Math.max(420, value - 90))}><ChevronUp size={12} /></Tool><Tool label="增大模块高度" disabled={expanded || bodyHeight >= 870} onClick={() => setBodyHeight(value => Math.min(870, value + 90))}><ChevronDown size={12} /></Tool></div></div>
    </>}
    {composing && <Composer nodes={allNodes} parentId={composerParent} onClose={closeComposer} onAdd={add} />}
    <span className="sr-only" role="status" aria-live="polite">{announcement || snapshot.stage.title}</span>
  </section>;
}

export function DiagnosticWorkflow() { return <ReactFlowProvider><WorkflowCanvas /></ReactFlowProvider>; }
