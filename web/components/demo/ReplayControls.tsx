"use client";

import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ARCHITECTURE_AGENTS } from "@/lib/demo/architecture";
import { REPLAY_CONFIG } from "@/lib/demo/config";
import type { DemoCase, ReplayStatus, TraceEvent } from "@/lib/demo/types";

type Props = { caseData: DemoCase; activeStepId: string; finalizedStepIds: string[]; status: ReplayStatus; cursor: number; speed: number; currentEvent?: TraceEvent; play: () => void; pause: () => void; next: () => void; previous: () => void; restart: () => void; onSelectStep: (id: string) => void; setSpeed: (speed: number) => void };

export function ReplayControls({ caseData, activeStepId, status, cursor, speed, currentEvent, play, pause, next, previous, restart, onSelectStep, setSpeed, finalizedStepIds }: Props) {
  const currentAgent = ARCHITECTURE_AGENTS.find(agent => agent.id === currentEvent?.agentId);
  return <section className="replay-controls" aria-label="回放控制">
    <div className="transport">
      <Button onClick={status === "playing" ? pause : play} className="play-button" aria-label={status === "playing" ? "暂停回放" : status === "completed" ? "重新回放" : "开始回放"}>{status === "playing" ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}{status === "playing" ? "暂停" : status === "completed" ? "重放" : "播放"}</Button>
      <Button variant="ghost" size="icon" onClick={previous} disabled={cursor < 0} aria-label="上一步"><SkipBack size={15} /></Button>
      <Button variant="ghost" size="icon" onClick={next} disabled={status === "completed"} aria-label="下一步"><SkipForward size={15} /></Button>
      <Button variant="ghost" size="icon" onClick={restart} disabled={cursor < 0} aria-label="从头开始"><RotateCcw size={14} /></Button>
      <label className="sr-only" htmlFor="replay-speed">回放速度</label>
      <select id="replay-speed" value={speed} onChange={event => setSpeed(Number(event.target.value))}>{REPLAY_CONFIG.speeds.map(value => <option key={value} value={value}>{value}×</option>)}</select>
    </div>
    <div className="step-timeline" aria-label="决策时间轴">{caseData.nodes.map(step => <button key={step.stepId} className={`timeline-step ${activeStepId === step.stepId ? "timeline-active" : ""} ${finalizedStepIds.includes(step.stepId) ? "timeline-completed" : ""}`} onClick={() => onSelectStep(step.stepId)} aria-label={`跳转到 ${step.stepId}：${step.title}`} aria-current={activeStepId === step.stepId ? "step" : undefined} title={`${step.stepId} · ${step.title}`}><span /></button>)}</div>
    <div className="replay-readout" title={currentEvent?.summary}><strong>{activeStepId}</strong><span>{status === "ready" ? "就绪" : status === "completed" ? "已完成" : currentAgent?.title ?? "已暂停"}</span><i className={status === "playing" ? "is-playing" : ""} /></div>
  </section>;
}
