"use client";

import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Edge, type EdgeProps } from "@xyflow/react";
import type { RelationType } from "@/lib/demo/types";
import { zh } from "@/lib/ui-zh";

export type ClinicalFlowEdge = Edge<{ relation: RelationType; active: boolean; completed: boolean }, "clinical">;

export function ClinicalEdge(props: EdgeProps<ClinicalFlowEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({ ...props, borderRadius: 18 });
  const relation = props.data?.relation ?? "CONTINUE";
  const emphasized = relation !== "CONTINUE" && relation !== "START";
  return <>
    <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} className={`clinical-edge edge-${relation.toLowerCase()} ${props.data?.active ? "edge-active" : ""} ${props.data?.completed ? "edge-completed" : ""}`} />
    {emphasized && <EdgeLabelRenderer><div className={`edge-label label-${relation.toLowerCase()} nodrag nopan`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }} title={relation === "CONSULT" ? "专科提供意见，主管权不变" : relation === "TRANSFER" ? "主管团队发生变更" : relation === "RETURN" ? "在新的当前状态节点上回归主线" : "从父问题分出一个独立的临床问题"}>{zh(relation)}</div></EdgeLabelRenderer>}
  </>;
}
