export const ACTION_TYPES = [
  'ASK_HISTORY', 'EXAM', 'TEST', 'CONSULT', 'TRANSFER', 'TREATMENT',
  'PROCEDURE', 'PATHOLOGY', 'REASSESS', 'DISCHARGE_FOLLOWUP',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const RELATION_TYPES = ['START', 'CONTINUE', 'BRANCH', 'CONSULT', 'TRANSFER', 'RETURN'] as const;
export type RelationType = (typeof RELATION_TYPES)[number];
export type AgentStatus = 'IDLE' | 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'WARNING';
export type ReplayStatus = 'ready' | 'playing' | 'paused' | 'completed';
export type ProblemStatus = 'ACTIVE' | 'SUSPENDED' | 'RESOLVED';

export interface ClinicalStep {
  stepId: string;
  actionType: ActionType;
  title: string;
  newEvidence: string[];
  action: string;
  clinicalRationale: string;
  problems: string[];
  owner: string;
  specialties: string[];
  relation: RelationType;
  safety?: string;
  position: { x: number; y: number };
  /** Stable domain identity, distinct from the displayed decision ID. */
  problemId: string;
  parentProblemId?: string;
  problemStatus: ProblemStatus;
  evidenceIds: string[];
  clock: number;
}

export interface ClinicalEdge {
  id: string;
  source: string;
  target: string;
  relation: RelationType;
}

export type TraceEventType =
  | 'AGENT_STARTED' | 'AGENT_COMPLETED' | 'SAFETY_WARNING'
  | 'PHYSICIAN_DECISION' | 'NODE_FINALIZED';

export interface TraceEvent {
  id: string;
  caseId: string;
  stepId: string;
  sequence: number;
  /** Deterministic elapsed demo milliseconds, not a patient timestamp. */
  timestamp: number;
  type: TraceEventType;
  agentId?: string;
  summary: string;
}

export interface DemoCase {
  caseId: string;
  title: string;
  shortTitle: string;
  description: string;
  pattern: string;
  specialties: string[];
  nodes: ClinicalStep[];
  edges: ClinicalEdge[];
  events: TraceEvent[];
}

export interface ArchitectureAgent {
  id: string;
  title: string;
  subtitle: string;
  kind: 'agent' | 'infrastructure' | 'human';
  summary: string;
  runtimeReference: string;
  position: { x: number; y: number };
}

export interface ArchitectureEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}
