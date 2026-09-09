"use client";

import { motion } from "motion/react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClinicalStep } from "@/lib/demo/types";
import { REPLAY_CONFIG } from "@/lib/demo/config";

export function StepDetailPanel({ step, completed, onClose }: { step: ClinicalStep; completed: boolean; onClose: () => void }) {
  return <motion.aside className="step-inspector" aria-label="Selected step details" data-testid="step-details" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: REPLAY_CONFIG.stageTransitionMs / 1000 }}>
    <div className="inspector-heading"><span>{step.stepId} / {step.actionType.replaceAll("_", " ")}</span><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close step details"><X size={16} /></Button></div>
    <h3>{step.title}</h3>
    <p className="inspector-action">{step.action}</p>
    <section><h4>Evidence</h4><ul>{step.newEvidence.map(item => <li key={item}>{item}</li>)}</ul></section>
    <section><h4>Rationale</h4><p>{step.clinicalRationale}</p></section>
    {step.safety && <p className="safety-notice">{step.safety}</p>}
    <div className="inspector-footer"><strong>{step.owner.replaceAll("_", " ")}</strong><span>{completed ? "Completed" : step.relation === "CONSULT" ? "Advisory only" : step.relation === "TRANSFER" ? "Proposed transfer" : step.relation === "RETURN" ? "New reassessment" : "Proposed"}</span></div>
  </motion.aside>;
}
