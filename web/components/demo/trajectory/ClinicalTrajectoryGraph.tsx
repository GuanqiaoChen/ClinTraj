"use client";

import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";
import { MarkerType, ReactFlow, ReactFlowProvider, useReactFlow, useStore } from "@xyflow/react";
import { Maximize, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DemoCase } from "@/lib/demo/types";
import { REPLAY_CONFIG } from "@/lib/demo/config";
import { ClinicalNode, type ClinicalFlowNode } from "./ClinicalNode";
import { ClinicalEdge, type ClinicalFlowEdge } from "./ClinicalEdge";

const nodeTypes = { clinical: ClinicalNode };
const edgeTypes = { clinical: ClinicalEdge };
type Props = { caseData: DemoCase; activeStepId: string; finalizedStepIds: string[]; isPlaying: boolean; onSelectStep: (stepId: string) => void; onShowDetails: () => void };

function Graph({ caseData, activeStepId, finalizedStepIds, isPlaying, onSelectStep, onShowDetails }: Props) {
  const flow = useReactFlow<ClinicalFlowNode, ClinicalFlowEdge>();
  const reducedMotion = useReducedMotion();
  const graphWidth = useStore(state => state.width);
  const [overview, setOverview] = useState(false);
  const duration = reducedMotion ? 0 : REPLAY_CONFIG.focusDurationMs;
  const nodes: ClinicalFlowNode[] = useMemo(() => caseData.nodes.map(step => ({ id: step.stepId, type: "clinical", width: 212, height: 90, position: { x: step.position.x / 280 * 260, y: step.position.y / 210 * 156 }, data: { step, active: step.stepId === activeStepId, completed: finalizedStepIds.includes(step.stepId), playing: isPlaying }, ariaLabel: `${step.stepId}: ${step.title}. ${step.actionType}`, className: finalizedStepIds.includes(step.stepId) || step.stepId === activeStepId ? "revealed-node" : "future-node" })), [caseData, activeStepId, finalizedStepIds, isPlaying]);
  const edges: ClinicalFlowEdge[] = useMemo(() => caseData.edges.map(edge => ({ ...edge, type: "clinical", data: { relation: edge.relation, active: edge.target === activeStepId && isPlaying, completed: finalizedStepIds.includes(edge.target) }, markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: edge.relation === "TRANSFER" ? "#5968a6" : "#adb3c2" } })), [caseData, activeStepId, finalizedStepIds, isPlaying]);
  useEffect(() => {
    if (overview) return;
    const step = caseData.nodes.find(node => node.stepId === activeStepId);
    if (step) {
      const x = step.position.x / 280 * 260;
      void flow.setViewport({ x: graphWidth < 600 ? Math.max(20, (graphWidth - 212) / 2) - x : 40 - Math.max(0, x - 260), y: 30, zoom: 1 }, { duration });
    }
  }, [activeStepId, caseData, flow, overview, duration, graphWidth]);
  return <section className="trajectory-card" aria-label="Clinical decision trajectory">
    <div className="graph-heading"><h2>Decision trajectory</h2><div><button className="text-control" onClick={onShowDetails}>Step details</button><button className={"text-control " + (overview ? "control-active" : "")} onClick={() => { setOverview(value => !value); if (!overview) void flow.fitView({ padding: 0.08, duration }); }}>{overview ? "Follow step" : "Overview"}</button></div></div>
    <div className="trajectory-canvas" data-testid="trajectory-graph">
      <ReactFlow<ClinicalFlowNode, ClinicalFlowEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodeClick={(_, node) => onSelectStep(node.id)} nodesDraggable={false} nodesConnectable={false} minZoom={0.12} maxZoom={1.5} defaultViewport={{ x: 35, y: 30, zoom: 1 }} attributionPosition="bottom-right" preventScrolling={false} fitView={false} aria-label="Interactive clinical trajectory" />
      <div className="graph-tools"><Button variant="ghost" size="icon" aria-label="Zoom out trajectory" onClick={() => void flow.zoomOut({ duration })}><Minus size={14} /></Button><Button variant="ghost" size="icon" aria-label="Zoom in trajectory" onClick={() => void flow.zoomIn({ duration })}><Plus size={14} /></Button><Button variant="ghost" size="icon" aria-label="Fit trajectory" onClick={() => { setOverview(true); void flow.fitView({ padding: 0.08, duration }); }}><Maximize size={13} /></Button></div>
    </div>
    <div className="graph-legend"><span><i />Continue</span><span><i className="consult" />Consult</span><span><i className="transfer" />Transfer</span><span>Branch & return follow the arrows</span></div>
  </section>;
}

export function ClinicalTrajectoryGraph(props: Props) { return <ReactFlowProvider><Graph {...props} /></ReactFlowProvider>; }
