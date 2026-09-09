"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";
import { BaseEdge, Controls, Handle, MarkerType, Position, ReactFlow, useReactFlow, useStore, type Edge, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import { X } from "lucide-react";
import { ARCHITECTURE_AGENTS, SPECIALTY_LABELS } from "@/lib/demo/architecture";
import { ARCHITECTURE_VIEW_EDGES, ARCHITECTURE_VIEW_NODES, architectureViewStatus, type ArchitectureViewNode } from "@/lib/demo/architecture-view";
import type { AgentStatus } from "@/lib/demo/types";
import { REPLAY_CONFIG } from "@/lib/demo/config";
import "./architecture.css";

interface MultiAgentArchitectureProps {
  agentStatuses: Record<string, AgentStatus>;
  specialties: string[];
  isPlaying: boolean;
  currentStepId: string;
}
interface ArchitectureNodeData extends Record<string, unknown> {
  component: ArchitectureViewNode;
  status: AgentStatus;
  inspected: boolean;
  onInspect: (id: string) => void;
}
type ArchitectureFlowNode = Node<ArchitectureNodeData, "architecture">;
type ZoneFlowNode = Node<{ label: string }, "zone">;
type FlowNode = ArchitectureFlowNode | ZoneFlowNode;
const PORTS = [Position.Left, Position.Right, Position.Top, Position.Bottom];

const ArchitectureNode = memo(function ArchitectureNode({ data }: NodeProps<ArchitectureFlowNode>) {
  const { component, status, inspected, onInspect } = data;
  return (
    <div
      className={`architecture-node architecture-node--${component.kind} architecture-node--${status.toLowerCase()}${inspected ? " architecture-node--inspected" : ""}`}
      role="button" tabIndex={0}
      aria-label={`${component.title}, ${status.toLowerCase()}. Show details.`} aria-expanded={inspected}
      onClick={(event) => { event.stopPropagation(); onInspect(component.id); }}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onInspect(component.id); } }}
    >
      {PORTS.map((position) => <Handle key={`in-${position}`} type="target" position={position} id={`in-${position}`} isConnectable={false} />)}
      <span className="architecture-node__title">{component.title}</span>
      {"caption" in component && <span className="architecture-node__caption">{component.caption}</span>}
      {PORTS.map((position) => <Handle key={`out-${position}`} type="source" position={position} id={`out-${position}`} isConnectable={false} />)}
    </div>
  );
});

function StageZone({ data }: NodeProps<ZoneFlowNode>) {
  return <div className="architecture-zone"><span>{data.label}</span></div>;
}

function RoutedEdge({ id, sourceX, sourceY, targetX, targetY, style, markerEnd, data }: EdgeProps) {
  const continuation = data?.route === "continuation";
  const floor = continuation ? 365 : 332;
  const path = continuation
    ? `M ${sourceX} ${sourceY} L ${sourceX} ${floor - 12} Q ${sourceX} ${floor} ${sourceX - 12} ${floor} L 6 ${floor} Q -6 ${floor} -6 ${floor - 12} L -6 ${targetY + 12} Q -6 ${targetY} 6 ${targetY} L ${targetX} ${targetY}`
    : `M ${sourceX} ${sourceY} L ${sourceX} ${floor - 10} Q ${sourceX} ${floor} ${sourceX + 10} ${floor} L ${targetX - 10} ${floor} Q ${targetX} ${floor} ${targetX} ${floor - 10} L ${targetX} ${targetY}`;
  return <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />;
}

const NODE_TYPES = { architecture: ArchitectureNode, zone: StageZone };
const EDGE_TYPES = { routed: RoutedEdge };
const ZONES: ZoneFlowNode[] = [
  { id: 'zone-understand', type: 'zone', position: { x: 12, y: 0 }, data: { label: 'Understand' }, style: { width: 371, height: 315 }, zIndex: -2, selectable: false, draggable: false, focusable: false },
  { id: 'zone-assess', type: 'zone', position: { x: 398, y: 0 }, data: { label: 'Assess' }, style: { width: 550, height: 315 }, zIndex: -2, selectable: false, draggable: false, focusable: false },
  { id: 'zone-decide', type: 'zone', position: { x: 963, y: 0 }, data: { label: 'Review & act' }, style: { width: 365, height: 315 }, zIndex: -2, selectable: false, draggable: false, focusable: false },
];

function ResponsiveGraph({ activeId }: { activeId?: string }) {
  const width = useStore(state => state.width);
  const flow = useReactFlow();
  const initialized = flow.viewportInitialized;
  const reducedMotion = useReducedMotion();
  const duration = reducedMotion ? 0 : REPLAY_CONFIG.focusDurationMs;
  useEffect(() => {
    if (initialized && width >= 650) void flow.fitView({ padding: { top: "16px", right: "28px", bottom: "70px", left: "28px" }, maxZoom: 1, duration });
  }, [initialized, width, flow, duration]);
  useEffect(() => {
    if (!initialized || width >= 650) return;
    const node = ARCHITECTURE_VIEW_NODES.find(item => item.members.some(member => member === activeId)) ?? ARCHITECTURE_VIEW_NODES[0];
    void flow.setCenter(node.position.x + 75, node.position.y + 28, { zoom: 0.95, duration });
  }, [initialized, width, activeId, flow, duration]);
  return null;
}

export function MultiAgentArchitecture({ agentStatuses, specialties, isPlaying, currentStepId }: MultiAgentArchitectureProps) {
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const inspected = ARCHITECTURE_VIEW_NODES.find((node) => node.id === inspectedId);
  const activeAgent = ARCHITECTURE_AGENTS.find((agent) => agentStatuses[agent.id] === "ACTIVE" || agentStatuses[agent.id] === "WARNING");
  const focusAgent = activeAgent ?? [...ARCHITECTURE_AGENTS].reverse().find(agent => agentStatuses[agent.id] === "COMPLETED");
  const nodes = useMemo<FlowNode[]>(() => [
    ...ZONES,
    ...ARCHITECTURE_VIEW_NODES.map((component): ArchitectureFlowNode => ({
      id: component.id, type: "architecture", position: component.position, width: 150, height: 57,
      data: { component, status: architectureViewStatus(component.members, agentStatuses), inspected: component.id === inspectedId, onInspect: (id) => setInspectedId((previous) => previous === id ? null : id) },
      draggable: false, connectable: false, focusable: false, selectable: false,
    })),
  ], [agentStatuses, inspectedId]);
  const edges = useMemo<Edge[]>(() => ARCHITECTURE_VIEW_EDGES.map((edge) => {
    const source = ARCHITECTURE_VIEW_NODES.find((node) => node.id === edge.source)!;
    const target = ARCHITECTURE_VIEW_NODES.find((node) => node.id === edge.target)!;
    const sourceStatus = architectureViewStatus(source.members, agentStatuses);
    const targetStatus = architectureViewStatus(target.members, agentStatuses);
    const active = sourceStatus === "COMPLETED" && (targetStatus === "ACTIVE" || targetStatus === "WARNING");
    const complete = sourceStatus === "COMPLETED" && targetStatus === "COMPLETED";
    const continuation = "route" in edge && edge.route === "continuation";
    const color = active ? "#4c5bd4" : complete ? "#9b9aa6" : "#d4d2db";
    return {
      id: `${edge.source}-${edge.target}`, source: edge.source, target: edge.target,
      sourceHandle: `out-${edge.from}`, targetHandle: `in-${edge.to}`,
      type: "route" in edge ? "routed" : "smoothstep", data: "route" in edge ? { route: edge.route } : undefined,
      animated: active && isPlaying && !continuation,
      style: { stroke: color, strokeWidth: active ? 2 : 1.25, ...(continuation ? { strokeDasharray: "4 5", opacity: 0.5 } : {}) },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 12, height: 12 }, pathOptions: { borderRadius: 12, offset: 18 },
    };
  }), [agentStatuses, isPlaying]);

  return (
    <section className="architecture-panel" aria-label="Multi-agent architecture execution" onKeyDown={(event) => { if (event.key === "Escape") setInspectedId(null); }}>
      <header className="architecture-panel__header">
        <h2>Multi-agent reasoning</h2>
        {activeAgent && <span className="architecture-panel__active" aria-live="polite">{activeAgent.title}</span>}
      </header>
      <div className="architecture-panel__canvas">
        <ReactFlow<FlowNode>
          nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES}
          fitViewOptions={{ padding: { top: "16px", right: "28px", bottom: "70px", left: "28px" }, maxZoom: 1 }} minZoom={0.25} maxZoom={1.8}
          nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
          onNodeClick={(_, node) => { if (node.type === "architecture") setInspectedId(previous => previous === node.id ? null : node.id); }}
          panOnScroll={false} zoomOnScroll={false} zoomOnPinch preventScrolling={false}
          onPaneClick={() => setInspectedId(null)} attributionPosition="bottom-left"
          aria-label={`ClinTraj information flow for ${currentStepId || "the current decision"}. Select a role for details.`}
        >
          <ResponsiveGraph activeId={focusAgent?.id} />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
        {inspected && (
          <div className="architecture-panel__detail" role="status">
            <p><strong>{inspected.title}</strong><span>{inspected.id === 'specialist_pool' && specialties.length > 0 && ["ACTIVE", "COMPLETED", "WARNING"].includes(architectureViewStatus(inspected.members, agentStatuses)) ? `${specialties.map(id => SPECIALTY_LABELS[id] ?? id).join(', ')} contribute advice without transferring ownership.` : inspected.detail}</span></p>
            <button type="button" aria-label="Close architecture details" onClick={() => setInspectedId(null)}><X size={16} /></button>
          </div>
        )}
      </div>
    </section>
  );
}
