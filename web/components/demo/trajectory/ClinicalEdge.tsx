"use client";

import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Edge, type EdgeProps } from "@xyflow/react";
import type { RelationType } from "@/lib/demo/types";

export type ClinicalFlowEdge = Edge<{ relation: RelationType; active: boolean; completed: boolean }, "clinical">;

export function ClinicalEdge(props: EdgeProps<ClinicalFlowEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({ ...props, borderRadius: 18 });
  const relation = props.data?.relation ?? "CONTINUE";
  const emphasized = relation !== "CONTINUE" && relation !== "START";
  return <>
    <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} className={`clinical-edge edge-${relation.toLowerCase()} ${props.data?.active ? "edge-active" : ""} ${props.data?.completed ? "edge-completed" : ""}`} />
    {emphasized && <EdgeLabelRenderer><div className={`edge-label label-${relation.toLowerCase()} nodrag nopan`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }} title={relation === "CONSULT" ? "Specialist advice; ownership retained" : relation === "TRANSFER" ? "Primary management ownership changes" : relation === "RETURN" ? "Reintegrates at a new current-state node" : "A distinct clinical problem branches from its parent"}>{relation}</div></EdgeLabelRenderer>}
  </>;
}
