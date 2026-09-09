"use client";

import { AnimatePresence, motion } from "motion/react";
import { Activity, ArrowRight, Check, Clock3, Radio } from "lucide-react";
import { ARCHITECTURE_AGENTS } from "@/lib/demo/architecture";
import type { TraceEvent } from "@/lib/demo/types";
import { REPLAY_CONFIG } from "@/lib/demo/config";

export function AgentActivityTimeline({ events, isPlaying }: { events: TraceEvent[]; isPlaying: boolean }) {
  const recent = events.slice(-6).reverse();
  return <section className="activity-panel panel" aria-label="Agent activity" id="activity">
    <div className="panel-heading"><div className="panel-title"><Activity size={17} /><h2>Agent activity</h2><span className="count-badge">{events.length} events</span></div><span className="quiet-label"><span className={`status-dot ${isPlaying ? "is-live" : ""}`} />{isPlaying ? "Replaying" : "Structured trace"}</span></div>
    {recent.length ? <div className="activity-table"><div className="activity-table-head"><span>DEMO TIME</span><span>COMPONENT</span><span>EVENT SUMMARY</span><span>STEP</span></div><AnimatePresence initial={false}>{recent.map((event, index) => <motion.div layout="position" key={event.id} className={`activity-row ${index === 0 ? "activity-latest" : ""} ${event.type === "SAFETY_WARNING" ? "activity-warning" : ""}`} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: REPLAY_CONFIG.stageTransitionMs / 1000 }}><time>{formatTime(event.timestamp)}</time><span className="activity-agent">{event.type === "AGENT_COMPLETED" || event.type === "NODE_FINALIZED" ? <Check size={12} /> : <span className="tiny-dot" />}{ARCHITECTURE_AGENTS.find(agent => agent.id === event.agentId)?.title ?? "Replay environment"}</span><p>{event.summary}</p><span className="activity-step">{event.stepId}<ArrowRight size={12} /></span></motion.div>)}</AnimatePresence></div> : <div className="activity-empty"><div className="empty-icon"><Radio size={21} /></div><div><h3>A clear record of every decision.</h3><p>Start the replay to follow evidence release, agent contributions, safety review, and simulated physician approval.</p></div><span className="empty-awaiting"><Clock3 size={13} /> Awaiting replay</span></div>}
    <div className="activity-footer"><span>Concise audit summaries · Elapsed demo time, not clinical timestamps</span><span>Showing the latest {recent.length} events</span></div>
  </section>;
}

function formatTime(timestamp = 0) { const seconds = Math.floor(timestamp / 1000); return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`; }
