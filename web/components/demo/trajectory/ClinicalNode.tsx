"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { ClinicalStep } from "@/lib/demo/types";

export type ClinicalFlowNode = Node<{ step: ClinicalStep; active: boolean; completed: boolean; playing: boolean }, "clinical">;

export const ClinicalNode = memo(function ClinicalNode({ data }: NodeProps<ClinicalFlowNode>) {
  const { step, active, completed, playing } = data;
  return <div className={`clinical-node ${active ? "is-active" : ""} ${completed ? "is-completed" : ""} ${active && playing ? "is-playing" : ""}`}>
    <Handle type="target" position={Position.Left} />
    <div className="node-meta"><span>{step.stepId}</span><span>{step.actionType.replaceAll("_", " ")}</span><i aria-label={completed ? "Completed" : active ? "Current" : "Upcoming"} /></div>
    <strong>{step.title}</strong>
    <Handle type="source" position={Position.Right} />
  </div>;
});
