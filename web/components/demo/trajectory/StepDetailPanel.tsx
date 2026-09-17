"use client";

import { motion } from "motion/react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClinicalStep } from "@/lib/demo/types";
import { REPLAY_CONFIG } from "@/lib/demo/config";
import { zh } from "@/lib/ui-zh";

export function StepDetailPanel({ step, completed, onClose }: { step: ClinicalStep; completed: boolean; onClose: () => void }) {
  return <motion.aside className="step-inspector" aria-label="所选步骤详情" data-testid="step-details" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: REPLAY_CONFIG.stageTransitionMs / 1000 }}>
    <div className="inspector-heading"><span>{step.stepId} / {zh(step.actionType)}</span><Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭步骤详情"><X size={16} /></Button></div>
    <h3>{step.title}</h3>
    <p className="inspector-action">{step.action}</p>
    <section><h4>证据</h4><ul>{step.newEvidence.map(item => <li key={item}>{item}</li>)}</ul></section>
    <section><h4>临床理由</h4><p>{step.clinicalRationale}</p></section>
    {step.safety && <p className="safety-notice">{step.safety}</p>}
    <div className="inspector-footer"><strong>{zh(step.owner)}</strong><span>{completed ? "已完成" : step.relation === "CONSULT" ? "仅为会诊意见" : step.relation === "TRANSFER" ? "拟转交主管" : step.relation === "RETURN" ? "新的重新评估" : "待审核"}</span></div>
  </motion.aside>;
}
