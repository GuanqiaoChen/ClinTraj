import { ARCHITECTURE_AGENTS } from './architecture';
import type { AgentStatus, DemoCase, ReplayStatus, TraceEvent } from './types';

export interface ReplaySnapshot {
  cursor: number;
  events: TraceEvent[];
  activeStepId: string;
  agentStatuses: Record<string, AgentStatus>;
  finalizedStepIds: string[];
  status: ReplayStatus;
}

export function clampCursor(cursor: number, eventCount: number): number {
  return Math.max(-1, Math.min(Math.trunc(Number.isFinite(cursor) ? cursor : -1), eventCount - 1));
}

/** Pure projection: seeking and reverse navigation always reconstruct the same state. */
export function deriveReplayState(caseData: DemoCase, requestedCursor: number, playing = false): ReplaySnapshot {
  const cursor = clampCursor(requestedCursor, caseData.events.length);
  const events = caseData.events.slice(0, cursor + 1);
  const activeStepId = events.at(-1)?.stepId ?? caseData.nodes[0]?.stepId ?? '';
  const currentStepEvents = events.filter((event) => event.stepId === activeStepId);
  const scheduledIds = new Set(caseData.events.filter((event) => event.stepId === activeStepId).map((event) => event.agentId));
  const agentStatuses = Object.fromEntries(ARCHITECTURE_AGENTS.map((agent) => [
    agent.id, cursor < 0 || !scheduledIds.has(agent.id) ? 'IDLE' : 'PENDING',
  ])) as Record<string, AgentStatus>;
  for (const event of currentStepEvents) {
    if (!event.agentId) continue;
    if (event.type === 'AGENT_STARTED') agentStatuses[event.agentId] = 'ACTIVE';
    if (event.type === 'AGENT_COMPLETED') agentStatuses[event.agentId] = 'COMPLETED';
    if (event.type === 'SAFETY_WARNING') agentStatuses[event.agentId] = 'WARNING';
  }
  return {
    cursor, events, activeStepId, agentStatuses,
    finalizedStepIds: events.filter((event) => event.type === 'NODE_FINALIZED').map((event) => event.stepId),
    status: cursor >= caseData.events.length - 1 && cursor >= 0 ? 'completed' : playing ? 'playing' : cursor < 0 ? 'ready' : 'paused',
  };
}

/** Next/previous land on finalized decision boundaries; autoplay uses sub-events. */
export function nextStepCursor(events: readonly TraceEvent[], cursor: number): number {
  const index = events.findIndex((event, index) => index > cursor && event.type === 'NODE_FINALIZED');
  return index < 0 ? Math.max(-1, events.length - 1) : index;
}

export function previousStepCursor(events: readonly TraceEvent[], cursor: number): number {
  const currentStep = events[clampCursor(cursor, events.length)]?.stepId;
  for (let index = cursor - 1; index >= 0; index -= 1) {
    if (events[index]?.type === 'NODE_FINALIZED' && events[index].stepId !== currentStep) return index;
  }
  return -1;
}
