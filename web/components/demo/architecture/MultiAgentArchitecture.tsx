"use client";

import { memo, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  ArrowUpRight,
  Check,
  Circle,
  Cpu,
  GitBranch,
  Info,
  ShieldCheck,
  Sparkles,
  UserRound,
  Workflow,
} from "lucide-react";
import { ARCHITECTURE_AGENTS, ARCHITECTURE_EDGES } from "@/lib/demo/architecture";
import type { AgentStatus } from "@/lib/demo/types";
import "./architecture.css";

interface MultiAgentArchitectureProps {
  agentStatuses: Record<string, AgentStatus>;
  specialties: string[];
  isPlaying: boolean;
  currentStepId: string;
}

type ArchitectureAgent = (typeof ARCHITECTURE_AGENTS)[number];

interface ArchitectureNodeData extends Record<string, unknown> {
  agent: ArchitectureAgent;
  status: AgentStatus;
  specialties: string[];
  inspected: boolean;
  onInspect: (id: string) => void;
}

type ArchitectureFlowNode = Node<ArchitectureNodeData, "architecture">;

const STATUS_LABELS: Record<AgentStatus, string> = {
  IDLE: "Idle",
  PENDING: "Pending",
  ACTIVE: "Working",
  COMPLETED: "Done",
  WARNING: "Warning",
};

const KIND_LABELS = {
  agent: "Model",
  infrastructure: "System",
  human: "Human",
};

const PORTS = [Position.Left, Position.Right, Position.Top, Position.Bottom];
const COLUMN_COUNT = 6;
const COLUMN_GAP = 215;
const ROW_GAP = 128;

const COMPACT_TITLES: Record<string, string> = {
  environment: "Replay environment",
  state_interpreter: "State interpreter",
  action_generator: "Candidate generation",
  specialist_pool: "Selected specialists",
  validation: "Evidence + domain checks",
  arbiter: "Arbiter explanation",
};

function agentPosition(index: number) {
  const row = Math.floor(index / COLUMN_COUNT);
  const column = index % COLUMN_COUNT;
  return {
    x: (row % 2 === 0 ? column : COLUMN_COUNT - column - 1) * COLUMN_GAP,
    y: row * ROW_GAP,
  };
}

const ArchitectureNode = memo(function ArchitectureNode({ data }: NodeProps<ArchitectureFlowNode>) {
  const { agent, status, specialties, inspected, onInspect } = data;
  const hasRouting = agent.id === "specialist_pool" && ["ACTIVE", "COMPLETED", "WARNING"].includes(status);
  const subtitle = hasRouting && specialties.length ? specialties.join(" · ") : agent.subtitle;
  const Icon = agent.kind === "human" ? UserRound : agent.kind === "agent" ? Sparkles : Cpu;

  return (
    <div
      className={`architecture-node architecture-node--${status.toLowerCase()}${inspected ? " architecture-node--inspected" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`${agent.title}. ${KIND_LABELS[agent.kind]} ${STATUS_LABELS[status]}. Show component details.`}
      onClick={() => onInspect(agent.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onInspect(agent.id);
        }
      }}
    >
      {PORTS.map((position) => (
        <Handle key={`in-${position}`} type="target" position={position} id={`in-${position}`} isConnectable={false} />
      ))}
      <div className="architecture-node__meta">
        <span className="architecture-node__kind"><Icon size={11} strokeWidth={1.7} />{KIND_LABELS[agent.kind]}</span>
        <span className="architecture-node__status">
          {status === "COMPLETED" ? <Check size={10} strokeWidth={2} /> : <span className="architecture-node__status-dot" />}
          {STATUS_LABELS[status]}
        </span>
      </div>
      <div className="architecture-node__title" title={agent.title}>{COMPACT_TITLES[agent.id] ?? agent.title}</div>
      <div className={`architecture-node__subtitle${hasRouting && specialties.length ? " architecture-node__subtitle--routed" : ""}`} title={subtitle}>{subtitle}</div>
      {PORTS.map((position) => (
        <Handle key={`out-${position}`} type="source" position={position} id={`out-${position}`} isConnectable={false} />
      ))}
    </div>
  );
});

const NODE_TYPES = { architecture: ArchitectureNode };

function NextDecisionEdge({ id, sourceX, sourceY, targetX, targetY, style, markerEnd }: EdgeProps) {
  const bottom = sourceY + 17;
  const left = targetX - 24;
  const path = `M ${sourceX} ${sourceY} L ${sourceX} ${bottom - 7} Q ${sourceX} ${bottom} ${sourceX - 7} ${bottom} L ${left + 8} ${bottom} Q ${left} ${bottom} ${left} ${bottom - 8} L ${left} ${targetY + 8} Q ${left} ${targetY} ${left + 8} ${targetY} L ${targetX} ${targetY}`;
  return <BaseEdge id={id} path={path} style={{ ...style, strokeDasharray: "4 4", strokeWidth: 1 }} markerEnd={markerEnd} label="Next evidence, after approval" labelX={sourceX / 2} labelY={bottom} labelStyle={{ fontSize: 9, fill: "#969eaf" }} labelBgStyle={{ fill: "#fcfcfe" }} labelBgPadding={[6, 3]} />;
}

const EDGE_TYPES = { nextDecision: NextDecisionEdge };

export function MultiAgentArchitecture({ agentStatuses, specialties, isPlaying, currentStepId }: MultiAgentArchitectureProps) {
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const activeAgent = ARCHITECTURE_AGENTS.find((agent) => agentStatuses[agent.id] === "ACTIVE" || agentStatuses[agent.id] === "WARNING");
  const inspectedAgent = ARCHITECTURE_AGENTS.find((agent) => agent.id === inspectedId);
  const detailAgent = inspectedAgent ?? activeAgent;
  const completeCount = ARCHITECTURE_AGENTS.filter((agent) => agentStatuses[agent.id] === "COMPLETED").length;

  const nodes = useMemo<ArchitectureFlowNode[]>(() => ARCHITECTURE_AGENTS.map((agent, index) => ({
    id: agent.id,
    type: "architecture",
    position: agentPosition(index),
    data: {
      agent,
      status: agentStatuses[agent.id] ?? "IDLE",
      specialties,
      inspected: agent.id === inspectedId,
      onInspect: setInspectedId,
    },
    draggable: false,
    connectable: false,
    focusable: false,
    selectable: false,
  })), [agentStatuses, specialties, inspectedId]);

  const edges = useMemo<Edge[]>(() => ARCHITECTURE_EDGES.map((edge) => {
    const sourceIndex = ARCHITECTURE_AGENTS.findIndex((agent) => agent.id === edge.source);
    const targetIndex = ARCHITECTURE_AGENTS.findIndex((agent) => agent.id === edge.target);
    const sourcePosition = agentPosition(sourceIndex);
    const targetPosition = agentPosition(targetIndex);
    const changesRow = sourcePosition.y !== targetPosition.y;
    const nextDecision = targetIndex < sourceIndex;
    const pointsLeft = targetPosition.x < sourcePosition.x;
    const incomingActive = agentStatuses[edge.target] === "ACTIVE" && agentStatuses[edge.source] === "COMPLETED";
    const completed = agentStatuses[edge.source] === "COMPLETED" && agentStatuses[edge.target] === "COMPLETED";
    const color = incomingActive ? "#6473d1" : completed ? "#a5acbd" : "#d6dbe4";
    return {
      ...edge,
      type: nextDecision ? "nextDecision" : "smoothstep",
      sourceHandle: `out-${changesRow ? Position.Bottom : pointsLeft ? Position.Left : Position.Right}`,
      targetHandle: `in-${nextDecision ? Position.Left : changesRow ? Position.Top : pointsLeft ? Position.Right : Position.Left}`,
      animated: incomingActive && isPlaying,
      style: { stroke: color, strokeWidth: incomingActive ? 1.7 : 1.2 },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 11, height: 11 },
      interactionWidth: 12,
      labelStyle: { fontSize: 9, fill: "#7b8090" },
      labelBgStyle: { fill: "#fcfcfe" },
      pathOptions: { borderRadius: 12 },
    };
  }), [agentStatuses, isPlaying]);

  return (
    <section className="architecture-panel" aria-label="Multi-agent architecture execution">
      <header className="architecture-panel__header">
        <div className="architecture-panel__heading">
          <span className="architecture-panel__icon"><Workflow size={17} strokeWidth={1.7} /></span>
          <div>
            <h2>Multi-agent execution</h2>
            <p>Current ClinTraj method <span aria-hidden="true">·</span> synchronized with <span className="architecture-panel__step">{currentStepId || "current decision"}</span></p>
          </div>
        </div>
        <div className="architecture-panel__execution">
          <span className={`architecture-panel__execution-dot${isPlaying ? " architecture-panel__execution-dot--playing" : ""}`} />
          <span>Fixture trace</span>
          <span className="architecture-panel__execution-count">{String(completeCount).padStart(2, "0")} / {ARCHITECTURE_AGENTS.length}</span>
        </div>
      </header>
      <div className="architecture-panel__canvas">
        <ReactFlow<ArchitectureFlowNode>
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.045, maxZoom: 1 }}
          minZoom={0.35}
          maxZoom={1.8}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch
          preventScrolling={false}
          attributionPosition="top-right"
          aria-label="Current ClinTraj workflow stages. Drag to pan, use controls to zoom, select a stage for details."
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={0.65} color="#d9dde7" />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
      </div>
      <div className="architecture-panel__legend" aria-label="Component types and statuses">
        <div className="architecture-panel__legend-types">
          <span><Sparkles size={12} />Model role</span>
          <span><Cpu size={12} />Deterministic stage</span>
          <span><UserRound size={12} />Physician</span>
        </div>
        <div className="architecture-panel__legend-states">
          <span><Circle size={8} fill="#aab0be" strokeWidth={0} />Idle</span>
          <span><Circle size={8} fill="#6473d1" strokeWidth={0} />Working</span>
          <span><Check size={11} />Complete</span>
        </div>
      </div>
      <div className="architecture-panel__detail" aria-live="polite">
        {detailAgent ? (
          <>
            <Info size={14} className="architecture-panel__detail-icon" />
            <p><strong>{detailAgent.title}</strong><span>{detailAgent.summary}</span>{detailAgent.id === "specialist_pool" && specialties.length > 0 && ["ACTIVE", "COMPLETED", "WARNING"].includes(agentStatuses[detailAgent.id] ?? "IDLE") && <span> Routed: {specialties.join(", ")}.</span>}</p>
            {inspectedAgent && <button className="architecture-panel__follow" onClick={() => setInspectedId(null)} title="Show details for the active component">Follow trace<ArrowUpRight size={12} /></button>}
          </>
        ) : (
          <>
            <GitBranch size={14} className="architecture-panel__detail-icon" />
            <p><strong>One decision, distinct responsibilities.</strong><span>Select a component to inspect its role. Only physician-approved actions advance the clinical state.</span></p>
            <ShieldCheck size={15} className="architecture-panel__safeguard" />
          </>
        )}
      </div>
    </section>
  );
}
