"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowDown, ArrowUpRight, BookOpen, Brain, ChevronRight, FlaskConical, GitBranch, Github, HeartPulse, Info, Network, ShieldCheck, Split, Wind, Workflow } from "lucide-react";
import { MotionConfig } from "motion/react";
import { DEMO_CASES } from "@/data/demo/cases";
import { useReplay } from "@/lib/demo/use-replay";
import type { DemoCase } from "@/lib/demo/types";
import { Button } from "@/components/ui/button";
import { ClinicalTrajectoryGraph } from "./trajectory/ClinicalTrajectoryGraph";
import { StepDetailPanel } from "./trajectory/StepDetailPanel";
import { MultiAgentArchitecture } from "./architecture/MultiAgentArchitecture";
import { AgentActivityTimeline } from "./activity/AgentActivityTimeline";
import { ReplayControls } from "./ReplayControls";

const caseIcons = [Activity, Split, Wind, Brain, HeartPulse];
const caseLabels = ["A sequential pathway", "Advisory collaboration", "Specialty handoff", "Parallel clinical problems", "Escalation & return"];
const repo = "https://github.com/GuanqiaoChen/ClinTraj";

export function DemoShell() {
  const [caseId, setCaseId] = useState(DEMO_CASES[3].caseId);
  const caseData = DEMO_CASES.find(item => item.caseId === caseId) ?? DEMO_CASES[3];
  return <MotionConfig reducedMotion="user"><a href="#main" className="skip-link">Skip to demo</a><header className="site-header"><div className="nav-inner"><a href="/demo" className="brand" aria-label="ClinTraj demo"><span className="brand-icon"><Workflow size={21} strokeWidth={1.7} /></span>ClinTraj<span className="research-tag">RESEARCH</span></a><nav aria-label="Main navigation"><a href="/demo" className="nav-active" aria-current="page">Demo</a><a href="#cases">Cases</a><a href="#architecture">Architecture</a><a href={`${repo}/blob/main/docs/architecture.md`} target="_blank" rel="noreferrer">Docs <ArrowUpRight size={11} /></a></nav><a href={repo} target="_blank" rel="noreferrer" className="repo-link"><Github size={17} /><span>View project</span><ArrowUpRight size={12} /></a></div></header>
    <main id="main" className="demo-main"><section className="intro"><div><div className="eyebrow"><span /> INTERACTIVE RESEARCH DEMO</div><h1>Clinical decisions, <span>in context.</span></h1><p>A longitudinal view of the evidence, pathways, and agents behind each decision.</p></div><div className="demo-mode"><span className="mode-label"><FlaskConical size={14} /> Deterministic demo</span><span>Local fixtures. No live model calls.</span></div></section>
      <section id="cases" className="case-picker" aria-label="Select a clinical case"><div className="section-eyebrow"><span>EXPLORE A TRAJECTORY</span><span>5 scenarios <ChevronRight size={12} /></span></div><div className="case-options">{DEMO_CASES.map((item, index) => { const Icon = caseIcons[index]; return <button key={item.caseId} onClick={() => setCaseId(item.caseId)} className={`case-option ${caseId === item.caseId ? "case-selected" : ""}`} aria-pressed={caseId === item.caseId} aria-label={`Case ${index + 1}: ${item.title}`}><div className="case-option-top"><Icon size={17} strokeWidth={1.6} /><span>CASE {String(index + 1).padStart(2, "0")}</span><span className="case-radio">{caseId === item.caseId && <span />}</span></div><strong>{item.shortTitle}</strong><span className="case-option-description">{caseLabels[index]}</span></button>; })}</div></section>
      <CaseWorkspace key={caseId} caseData={caseData} />
      <footer className="site-footer"><div><Workflow size={16} /><span>ClinTraj</span><span className="footer-divider">/</span><span>Temporally grounded. Physician guided.</span></div><span><FlaskConical size={12} /> Synthetic scenarios · Research use only</span></footer>
    </main></MotionConfig>;
}

function CaseWorkspace({ caseData }: { caseData: DemoCase }) {
  const replay = useReplay(caseData);
  const activeStep = caseData.nodes.find(step => step.stepId === replay.activeStepId) ?? caseData.nodes[0];
  const currentEvent = replay.events.at(-1);
  const selectStep = (stepId: string) => replay.seek(caseData.events.findIndex(event => event.stepId === stepId));
  const stepIndex = caseData.nodes.findIndex(step => step.stepId === activeStep.stepId);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, select, textarea, button, a, [role=button], [contenteditable=true]")) return;
      if (event.code === "Space") { event.preventDefault(); if (replay.status === "playing") replay.pause(); else replay.play(); }
      if (event.code === "ArrowRight") { event.preventDefault(); replay.next(); }
      if (event.code === "ArrowLeft") { event.preventDefault(); replay.previous(); }
      if (event.key.toLowerCase() === "r" && !event.ctrlKey && !event.metaKey && !event.altKey) replay.restart();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [replay]);

  return <>
    <section className="case-heading"><div><div className="case-reference"><span className="mono">{caseData.caseId}</span><span className="reference-divider" /><span>Synthetic scenario</span></div><h2>{caseData.title}</h2><p>{caseData.description}</p></div><div className="case-progress"><span className={`replay-status replay-${replay.status}`}><span className="status-dot" />{replay.status}</span><span className="step-progress"><strong>{String(stepIndex + 1).padStart(2, "0")}</strong> / {String(caseData.nodes.length).padStart(2, "0")} steps</span><div className="progress-track"><span style={{ width: `${replay.finalizedStepIds.length / caseData.nodes.length * 100}%` }} /></div></div></section>
    <div className="main-workspace"><ClinicalTrajectoryGraph caseData={caseData} activeStepId={activeStep.stepId} finalizedStepIds={replay.finalizedStepIds} isPlaying={replay.status === "playing"} onSelectStep={selectStep} /><StepDetailPanel step={activeStep} agentStatuses={replay.agentStatuses} completed={replay.finalizedStepIds.includes(activeStep.stepId)} ready={replay.status === "ready"} /></div>
    <ReplayControls {...replay} caseData={caseData} currentEvent={currentEvent} onSelectStep={selectStep} />
    <div className="connection-caption"><span /><span><Network size={13} /> One replay. Two connected views. <ArrowDown size={12} /></span><span /></div>
    <div id="architecture"><MultiAgentArchitecture agentStatuses={replay.agentStatuses} specialties={activeStep.specialties} isPlaying={replay.status === "playing"} currentStepId={activeStep.stepId} /></div>
    <AgentActivityTimeline events={replay.events} isPlaying={replay.status === "playing"} />
    <section className="research-note"><div className="research-note-icon"><ShieldCheck size={19} /></div><div><h3>Physician judgment stays at the center.</h3><p>This replay uses authored synthetic evidence and simulated approvals. The five scenario IDs come from the supplied demo brief; these are conceptual pathways, not reproductions of patient records or clinical performance results.</p></div><Button asChild variant="ghost" size="sm"><a href={`${repo}/blob/main/docs/demo.md`} target="_blank" rel="noreferrer"><BookOpen size={14} /> Read demo notes <ArrowUpRight size={12} /></a></Button></section>
    <div className="demo-bottom-meta"><span><Info size={12} /> Clinical decision graph ≠ orchestration runtime</span><span><GitBranch size={12} /> RETURN always moves to a new current-state node</span></div>
  </>;
}
