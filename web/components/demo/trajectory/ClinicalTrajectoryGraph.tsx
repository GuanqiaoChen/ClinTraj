"use client";

import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";
import { Background, BackgroundVariant, MarkerType, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { Focus, GitBranch, Maximize, Minus, Plus, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DemoCase } from "@/lib/demo/types";
import { REPLAY_CONFIG } from "@/lib/demo/config";
import { ClinicalNode, type ClinicalFlowNode } from "./ClinicalNode";
import { ClinicalEdge, type ClinicalFlowEdge } from "./ClinicalEdge";

const nodeTypes = { clinical: ClinicalNode };
const edgeTypes = { clinical: ClinicalEdge };

type Props = { caseData: DemoCase; activeStepId: string; finalizedStepIds: string[]; isPlaying: boolean; onSelectStep: (stepId: string) => void };

function Graph({ caseData, activeStepId, finalizedStepIds, isPlaying, onSelectStep }: Props) {
  const flow = useReactFlow<ClinicalFlowNode, ClinicalFlowEdge>();
  const reducedMotion = useReducedMotion();
  const [overview, setOverview] = useState(false);
  const nodes: ClinicalFlowNode[] = useMemo(() => caseData.nodes.map(step => ({ id: step.stepId, type: "clinical", position: step.position, data: { step, active: step.stepId === activeStepId, completed: finalizedStepIds.includes(step.stepId), playing: isPlaying }, ariaLabel: `${step.stepId}: ${step.title}. ${step.actionType}`, className: finalizedStepIds.includes(step.stepId) || step.stepId === activeStepId ? "revealed-node" : "future-node" })), [caseData, activeStepId, finalizedStepIds, isPlaying]);
  const edges: ClinicalFlowEdge[] = useMemo(() => caseData.edges.map(edge => ({ ...edge, type: "clinical", data: { relation: edge.relation, active: edge.target === activeStepId && isPlaying, completed: finalizedStepIds.includes(edge.target) }, markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: edge.relation === "TRANSFER" ? "#6974b8" : "#b5bac8" } })), [caseData, activeStepId, finalizedStepIds, isPlaying]);
  useEffect(() => {
    if (overview) return;
    const step = caseData.nodes.find(node => node.stepId === activeStepId);
    if (step) void flow.setCenter(step.position.x + 220, step.position.y + 70, { zoom: 0.86, duration: reducedMotion ? 0 : REPLAY_CONFIG.focusDurationMs });
  }, [activeStepId, caseData, flow, overview, reducedMotion]);

  return <section className="trajectory-card panel" aria-label="Clinical decision trajectory">
    <div className="panel-heading"><div className="panel-title"><Route size={17} /><h2>Clinical decision trajectory</h2><span className="count-badge">{caseData.nodes.length} steps</span></div><Button variant="ghost" size="sm" onClick={() => { const next = !overview; setOverview(next); if (next) void flow.fitView({ padding: 0.16, duration: REPLAY_CONFIG.focusDurationMs }); }} title={overview ? "Follow the current step" : "Fit the full trajectory"}>{overview ? <Focus size={14} /> : <Maximize size={14} />}{overview ? "Follow step" : "Overview"}</Button></div>
    <div className="trajectory-canvas" data-testid="trajectory-graph">
      <div className="canvas-caption"><span className="tiny-dot" /> LONGITUDINAL DECISION GRAPH <span className="caption-separator">/</span> TIME MOVES FORWARD <span aria-hidden="true">→</span></div>
      <ReactFlow<ClinicalFlowNode, ClinicalFlowEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodeClick={(_, node) => onSelectStep(node.id)} nodesDraggable={false} nodesConnectable={false} minZoom={0.14} maxZoom={1.4} defaultViewport={{ x: 50, y: 70, zoom: 0.86 }} attributionPosition="top-right" preventScrolling={false} fitView={false} aria-label="Interactive clinical trajectory">
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d9dde8" />
      </ReactFlow>
      <div className="graph-tools"><Button variant="ghost" size="icon" aria-label="Zoom out trajectory" onClick={() => void flow.zoomOut()}><Minus size={15} /></Button><Button variant="ghost" size="icon" aria-label="Zoom in trajectory" onClick={() => void flow.zoomIn()}><Plus size={15} /></Button><span /><Button variant="ghost" size="icon" aria-label="Fit trajectory" onClick={() => { setOverview(true); void flow.fitView({ padding: 0.16, duration: REPLAY_CONFIG.focusDurationMs }); }}><Maximize size={14} /></Button></div>
      <div className="canvas-hint">Drag to pan · Scroll to zoom · Select a step to replay</div>
    </div>
    <div className="graph-legend"><span><i className="legend-line continue" />Continue</span><span title="A new problem pathway"><GitBranch size={13} />Branch</span><span title="Advisory; ownership retained"><i className="legend-line consult" />Consult</span><span title="Management ownership changes"><i className="legend-line transfer" />Transfer</span><span title="Merge into a new downstream reassessment"><i className="legend-line return" />Return</span><span className="legend-note">Future steps are a fixture preview</span></div>
  </section>;
}

export function ClinicalTrajectoryGraph(props: Props) { return <ReactFlowProvider><Graph {...props} /></ReactFlowProvider>; }
