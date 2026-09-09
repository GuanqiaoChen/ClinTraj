"use client";

import { motion } from "motion/react";
import { ArrowUpRight, Check, Circle, FileText, ShieldAlert, Stethoscope } from "lucide-react";
import type { AgentStatus, ClinicalStep } from "@/lib/demo/types";
import { ARCHITECTURE_AGENTS } from "@/lib/demo/architecture";
import { REPLAY_CONFIG } from "@/lib/demo/config";

export function StepDetailPanel({ step, agentStatuses, completed, ready }: { step: ClinicalStep; agentStatuses: Record<string, AgentStatus>; completed: boolean; ready: boolean }) {
  const contributions = ARCHITECTURE_AGENTS.filter(agent => agent.kind === "agent" && agentStatuses[agent.id] !== "IDLE");
  return <aside className="detail-card panel" aria-label="Selected step details" data-testid="step-details">
    <div className="detail-heading"><span><FileText size={14} /> STEP INSPECTOR</span><span className="detail-step">{step.stepId}</span></div>
    <motion.div key={step.stepId} className="detail-content" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: REPLAY_CONFIG.stageTransitionMs / 1000 }}>
      <div className="detail-type-row"><span className="action-badge">{step.actionType.replaceAll("_", " ")}</span><span className="relation-tag">{step.relation}</span></div>
      <h3>{step.title}</h3>
      <div className="detail-state"><span className={`status-dot ${completed ? "dot-completed" : ""}`} />{completed ? "Finalized after simulated approval" : ready ? "Ready to replay this decision" : "Proposed decision · fixture replay"}</div>
      <section className="detail-section"><h4>NEW EVIDENCE <span>{step.newEvidence.length}</span></h4><ul className="evidence-list">{step.newEvidence.map((item, i) => <li key={i}>{item}</li>)}</ul></section>
      <section className="recommendation"><h4><ArrowUpRight size={14} /> RECOMMENDED ACTION</h4><p>{step.action}</p></section>
      <section className="detail-section rationale-section"><h4>CLINICAL RATIONALE</h4><p>{step.clinicalRationale}</p></section>
      <section className="detail-section"><h4>ACTIVE PROBLEM{step.problems.length > 1 ? "S" : ""}</h4><div className="problem-tags">{step.problems.map(problem => <span key={problem}>{problem}</span>)}</div><div className="ownership-line"><Stethoscope size={13} /><span>Owner: <strong>{step.owner.replaceAll("_", " ")}</strong></span></div>{step.relation === "CONSULT" && <p className="semantic-note">Advisory input. The current team retains primary ownership.</p>}{step.relation === "TRANSFER" && <p className="semantic-note">Primary ownership changes only after simulated approval and execution.</p>}{step.relation === "RETURN" && <p className="semantic-note">Both pathways join this new reassessment. No history is rewritten.</p>}</section>
      {step.safety && <section className="safety-callout"><h4><ShieldAlert size={14} /> SAFETY ATTENTION</h4><p>{step.safety}</p></section>}
      <section className="detail-section contribution-section"><h4>AGENT CONTRIBUTIONS</h4>{contributions.length ? contributions.map(agent => <div className="contribution" key={agent.id}><span>{agent.title}</span><span className={`contribution-status status-${agentStatuses[agent.id]?.toLowerCase()}`}>{agentStatuses[agent.id] === "COMPLETED" ? <Check size={12} /> : <Circle size={8} />}{agentStatuses[agent.id] === "ACTIVE" ? "Working" : agentStatuses[agent.id]?.toLowerCase()}</span></div>) : <p className="muted">Agent contributions appear as the replay advances.</p>}</section>
    </motion.div>
    <div className="detail-footnote">Synthetic evidence · Research demonstration</div>
  </aside>;
}
