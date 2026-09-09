"use client";

import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ARCHITECTURE_AGENTS } from "@/lib/demo/architecture";
import { REPLAY_CONFIG } from "@/lib/demo/config";
import type { DemoCase, ReplayStatus, TraceEvent } from "@/lib/demo/types";

type Props = { caseData: DemoCase; activeStepId: string; finalizedStepIds: string[]; status: ReplayStatus; cursor: number; speed: number; currentEvent?: TraceEvent; play: () => void; pause: () => void; next: () => void; previous: () => void; restart: () => void; onSelectStep: (id: string) => void; setSpeed: (speed: number) => void };

export function ReplayControls({ caseData, activeStepId, status, cursor, speed, currentEvent, play, pause, next, previous, restart, onSelectStep, setSpeed, finalizedStepIds }: Props) {
  const currentAgent = ARCHITECTURE_AGENTS.find(agent => agent.id === currentEvent?.agentId);
  return <section className="replay-controls" aria-label="Replay controls">
    <div className="transport">
      <Button onClick={status === "playing" ? pause : play} className="play-button" aria-label={status === "playing" ? "Pause replay" : status === "completed" ? "Replay again" : "Play replay"}>{status === "playing" ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}{status === "playing" ? "Pause" : status === "completed" ? "Replay" : "Play"}</Button>
      <Button variant="ghost" size="icon" onClick={previous} disabled={cursor < 0} aria-label="Previous step"><SkipBack size={15} /></Button>
      <Button variant="ghost" size="icon" onClick={next} disabled={status === "completed"} aria-label="Next step"><SkipForward size={15} /></Button>
      <Button variant="ghost" size="icon" onClick={restart} disabled={cursor < 0} aria-label="Restart replay"><RotateCcw size={14} /></Button>
      <label className="sr-only" htmlFor="replay-speed">Replay speed</label>
      <select id="replay-speed" value={speed} onChange={event => setSpeed(Number(event.target.value))}>{REPLAY_CONFIG.speeds.map(value => <option key={value} value={value}>{value}×</option>)}</select>
    </div>
    <div className="step-timeline" aria-label="Decision timeline">{caseData.nodes.map(step => <button key={step.stepId} className={`timeline-step ${activeStepId === step.stepId ? "timeline-active" : ""} ${finalizedStepIds.includes(step.stepId) ? "timeline-completed" : ""}`} onClick={() => onSelectStep(step.stepId)} aria-label={`Go to ${step.stepId}: ${step.title}`} aria-current={activeStepId === step.stepId ? "step" : undefined} title={`${step.stepId} · ${step.title}`}><span /></button>)}</div>
    <div className="replay-readout" title={currentEvent?.summary}><strong>{activeStepId}</strong><span>{status === "ready" ? "Ready" : status === "completed" ? "Complete" : currentAgent?.title ?? "Paused"}</span><i className={status === "playing" ? "is-playing" : ""} /></div>
  </section>;
}
