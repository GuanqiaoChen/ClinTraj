import type { AgentStatus } from './types';

// Presentation groups preserve every trace ID without changing execution order.
export const ARCHITECTURE_VIEW_NODES = [
  { id: 'evidence', members: ['environment', 'temporal_gate'], title: 'Visible evidence', caption: 'Temporal gate', kind: 'infrastructure', position: { x: 35, y: 58 }, detail: 'Only observations whose time and prerequisites are satisfied enter the decision.' },
  { id: 'state_interpreter', members: ['state_interpreter'], title: 'State interpreter', kind: 'agent', position: { x: 35, y: 154 }, detail: 'Structures visible observations, uncertainty, and explicit risk flags.' },
  { id: 'problem_manager', members: ['problem_manager'], title: 'Problem formulation', kind: 'agent', position: { x: 220, y: 154 }, detail: 'Describes stable clinical problems and proposes a differential.' },
  { id: 'action_generator', members: ['action_generator'], title: 'Action generation', kind: 'agent', position: { x: 415, y: 154 }, detail: 'Proposes executable actions grounded in the visible evidence.' },
  { id: 'information_gain', members: ['information_gain'], title: 'Diagnostic strategy', kind: 'agent', position: { x: 600, y: 58 }, detail: 'Assesses information, benefit, urgency, harm, burden, and delay on an ordinal scale.' },
  { id: 'specialist_pool', members: ['specialist_router', 'specialist_pool'], title: 'Specialist advice', kind: 'agent', position: { x: 785, y: 58 }, detail: 'Explicitly routed specialists advise; management ownership stays unchanged.' },
  { id: 'grounding', members: ['retrieval', 'grounding'], title: 'Evidence grounding', kind: 'agent', position: { x: 600, y: 250 }, detail: 'Checks candidate support against retrieved local sources and their limitations.' },
  { id: 'validation', members: ['validation'], title: 'Domain validation', kind: 'infrastructure', position: { x: 415, y: 250 }, detail: 'Checks evidence visibility and proposed graph transitions without changing patient state.' },
  { id: 'safety_critic', members: ['safety_critic'], title: 'Safety critic', caption: 'Independent review', kind: 'agent', position: { x: 785, y: 154 }, detail: 'Independently reviews every candidate and can veto an action.' },
  { id: 'policy_ranking', members: ['policy_ranking'], title: 'Policy ranking', caption: 'Vetoes excluded', kind: 'infrastructure', position: { x: 975, y: 58 }, detail: 'Excludes vetoed actions before applying the deterministic ordinal ranking policy.' },
  { id: 'arbiter', members: ['arbiter'], title: 'Arbiter explanation', kind: 'agent', position: { x: 1160, y: 58 }, detail: 'Explains the selected action and uncertainty; it cannot override the ranking or a veto.' },
  { id: 'physician_hitl', members: ['physician_hitl'], title: 'Physician review', caption: 'Accept · modify · reject', kind: 'human', position: { x: 1160, y: 154 }, detail: 'A physician decision is required; this replay shows recorded simulated approval.' },
  { id: 'execution', members: ['executor', 'problem_transition'], title: 'Approved execution', caption: 'Clinical graph update', kind: 'infrastructure', position: { x: 1160, y: 250 }, detail: 'Applies the approved offline action and graph transition before releasing the next evidence.' },
] as const;

export type ArchitectureViewNode = (typeof ARCHITECTURE_VIEW_NODES)[number];

export function architectureViewStatus(members: readonly string[], statuses: Record<string, AgentStatus>): AgentStatus {
  const values = members.map((id) => statuses[id] ?? 'IDLE');
  if (values.includes('WARNING')) return 'WARNING';
  if (values.includes('ACTIVE')) return 'ACTIVE';
  if (values.every((status) => status === 'COMPLETED')) return 'COMPLETED';
  if (values.some((status) => status === 'PENDING' || status === 'COMPLETED')) return 'PENDING';
  return 'IDLE';
}

// Method dependencies from docs/architecture.md; branches do not imply concurrency.
export const ARCHITECTURE_VIEW_EDGES = [
  { source: 'evidence', target: 'state_interpreter', from: 'bottom', to: 'top' },
  { source: 'state_interpreter', target: 'problem_manager', from: 'right', to: 'left' },
  { source: 'problem_manager', target: 'action_generator', from: 'right', to: 'left' },
  { source: 'action_generator', target: 'information_gain', from: 'right', to: 'left' },
  { source: 'information_gain', target: 'specialist_pool', from: 'right', to: 'left' },
  { source: 'action_generator', target: 'grounding', from: 'right', to: 'left' },
  { source: 'action_generator', target: 'validation', from: 'bottom', to: 'top' },
  { source: 'specialist_pool', target: 'safety_critic', from: 'bottom', to: 'top' },
  { source: 'grounding', target: 'safety_critic', from: 'right', to: 'bottom' },
  { source: 'safety_critic', target: 'policy_ranking', from: 'right', to: 'left' },
  { source: 'validation', target: 'policy_ranking', from: 'bottom', to: 'bottom', route: 'validation' },
  { source: 'policy_ranking', target: 'arbiter', from: 'right', to: 'left' },
  { source: 'arbiter', target: 'physician_hitl', from: 'bottom', to: 'top' },
  { source: 'physician_hitl', target: 'execution', from: 'bottom', to: 'top' },
  { source: 'execution', target: 'evidence', from: 'bottom', to: 'left', route: 'continuation' },
] as const;
