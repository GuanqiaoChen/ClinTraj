"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { ArrowRight, Check, Circle, GitBranch, Stethoscope } from "lucide-react";
import type { ClinicalStep } from "@/lib/demo/types";

export type ClinicalFlowNode = Node<{ step: ClinicalStep; active: boolean; completed: boolean; playing: boolean }, "clinical">;

export const ClinicalNode = memo(function ClinicalNode({ data }: NodeProps<ClinicalFlowNode>) {
  const { step, active, completed, playing } = data;
  return <div className={`clinical-node ${active ? "is-active" : ""} ${completed ? "is-completed" : ""}`}>
    <Handle type="target" position={Position.Left} />
    <div className="node-top"><span className="node-step">{step.stepId}</span><span className={`node-state ${active && playing ? "is-live" : ""}`}>{completed ? <><Check size={11} /> Completed</> : active ? <><span className="status-dot" /> Current</> : <><Circle size={9} /> Upcoming</>}</span></div>
    <div className="node-action">{step.actionType.replaceAll("_", " ")}</div>
    <div className="node-title">{step.title}</div>
    <div className="node-footer"><span>{step.relation === "BRANCH" ? <GitBranch size={12} /> : step.actionType === "CONSULT" ? <Stethoscope size={12} /> : <ArrowRight size={12} />}{step.newEvidence.length} new findings</span><span className="node-owner">{step.owner.replaceAll("_", " ")}</span></div>
    <Handle type="source" position={Position.Right} />
  </div>;
});
