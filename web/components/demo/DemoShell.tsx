"use client";

import { useEffect, useState } from "react";
import { MotionConfig } from "motion/react";
import { DEMO_CASES } from "@/data/demo/cases";
import { useReplay } from "@/lib/demo/use-replay";
import type { DemoCase } from "@/lib/demo/types";
import { ClinicalTrajectoryGraph } from "./trajectory/ClinicalTrajectoryGraph";
import { StepDetailPanel } from "./trajectory/StepDetailPanel";
import { MultiAgentArchitecture } from "./architecture/MultiAgentArchitecture";
import { ReplayControls } from "./ReplayControls";

const repo = "https://github.com/GuanqiaoChen/ClinTraj";

export function DemoShell() {
  const [caseId, setCaseId] = useState(DEMO_CASES[3].caseId);
  const caseData = DEMO_CASES.find(item => item.caseId === caseId) ?? DEMO_CASES[3];
  return <MotionConfig reducedMotion="user">
    <a href="#main" className="skip-link">Skip to demo</a>
    <header className="site-header">
      <a href="/demo" className="brand" aria-label="ClinTraj demo">ClinTraj<span>/ Demo</span></a>
      <a className="docs-link" href={repo + "/blob/main/docs/demo.md"} target="_blank" rel="noreferrer">Documentation ↗</a>
    </header>
    <main id="main" className="demo-main">
      <div className="workspace-heading"><h1>Clinical trajectories</h1><span className="demo-disclosure">Synthetic replay</span></div>
      <nav className="case-options" aria-label="Select a clinical case">
        {DEMO_CASES.map((item, index) => <button key={item.caseId} onClick={() => setCaseId(item.caseId)} className={"case-option " + (caseId === item.caseId ? "case-selected" : "")} aria-pressed={caseId === item.caseId} aria-label={`Case ${index + 1}: ${item.title}`}>{item.shortTitle}</button>)}
      </nav>
      <CaseWorkspace key={caseId} caseData={caseData} />
      <footer className="site-footer"><span>Local fixtures. Simulated physician decisions.</span><a href={repo} target="_blank" rel="noreferrer">GitHub ↗</a></footer>
    </main>
  </MotionConfig>;
}

function CaseWorkspace({ caseData }: { caseData: DemoCase }) {
  const replay = useReplay(caseData);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const activeStep = caseData.nodes.find(step => step.stepId === replay.activeStepId) ?? caseData.nodes[0];
  const selectStep = (stepId: string) => replay.seek(caseData.events.findIndex(event => event.stepId === stepId));
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setInspectorOpen(false);
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
    <ReplayControls {...replay} caseData={caseData} currentEvent={replay.events.at(-1)} onSelectStep={selectStep} />
    <div className="trajectory-workspace">
      <ClinicalTrajectoryGraph caseData={caseData} activeStepId={activeStep.stepId} finalizedStepIds={replay.finalizedStepIds} isPlaying={replay.status === "playing"} onSelectStep={stepId => { selectStep(stepId); setInspectorOpen(true); }} onShowDetails={() => setInspectorOpen(value => !value)} />
      {inspectorOpen && <StepDetailPanel step={activeStep} completed={replay.finalizedStepIds.includes(activeStep.stepId)} onClose={() => setInspectorOpen(false)} />}
    </div>
    <MultiAgentArchitecture agentStatuses={replay.agentStatuses} specialties={activeStep.specialties} isPlaying={replay.status === "playing"} currentStepId={activeStep.stepId} />
  </>;
}
