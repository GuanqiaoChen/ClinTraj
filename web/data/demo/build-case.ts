import { ARCHITECTURE_AGENTS, SPECIALTY_LABELS } from '../../lib/demo/architecture';
import { REPLAY_CONFIG } from '../../lib/demo/config';
import type { ActionType, ClinicalStep, DemoCase, ProblemStatus, RelationType, TraceEvent, TraceEventType } from '../../lib/demo/types';

export interface StepInput {
  actionType: ActionType;
  title: string;
  evidence: string[];
  action: string;
  rationale: string;
  problemId?: string;
  problemLabel?: string;
  owner?: string;
  relation?: RelationType;
  parents?: number[];
  parentProblemId?: string;
  status?: ProblemStatus;
  specialty?: string;
  y?: number;
  safety?: string;
}

export interface CaseInput {
  caseId: string;
  title: string;
  shortTitle: string;
  description: string;
  pattern: string;
  primaryProblem: string;
  owner: string;
  steps: StepInput[];
}

const beforeReviewStages = [
  'environment', 'temporal_gate', 'state_interpreter', 'problem_manager', 'action_generator',
  'information_gain', 'specialist_router', 'specialist_pool', 'retrieval', 'grounding',
  'validation', 'safety_critic', 'policy_ranking', 'arbiter',
];

function stageSummary(agentId: string, step: ClinicalStep): string {
  const summaries: Record<string, string> = {
    environment: 'Read the current synthetic observation window.',
    temporal_gate: `Released ${step.newEvidence.length} current finding${step.newEvidence.length === 1 ? '' : 's'}; later evidence remains gated.`,
    state_interpreter: 'Structured visible findings, uncertainty, and explicit risk flags.',
    problem_manager: `Formulated current problems: ${step.problems.join('; ')}.`,
    action_generator: `Proposed an actionable candidate: ${step.title.toLowerCase()}.`,
    information_gain: 'Assessed information, benefit, urgency, harm, burden, and delay on an ordinal research rubric.',
    specialist_router: `Routed explicit requests and current owners: ${step.specialties.map((id) => SPECIALTY_LABELS[id] ?? id).join(', ')}.`,
    specialist_pool: 'Added selected specialty advice without an implicit ownership transfer.',
    retrieval: 'Inspected the local synthetic source context; no external sources requested.',
    grounding: 'Recorded evidence support and limitations; no guideline validation is claimed.',
    validation: 'Checked visible evidence IDs and dry-ran the proposed domain transition.',
    safety_critic: step.safety ? 'Flagged the acute-care concern; selected escalation remains subject to physician review.' : 'Completed the fixture safety review; no scripted veto is present.',
    policy_ranking: 'Excluded vetoed candidates before applying ordinal policy ranking.',
    arbiter: 'Explained the selected candidate and uncertainty; independent vetoes remain binding.',
    executor: 'Applied the simulated accepted action after its safeguards passed.',
    problem_transition: step.relation === 'RETURN' ? 'Appended a new reassessment with branch and ancestor parents; historical events remain unchanged.' : `Appended the ${step.relation.toLowerCase()} event with explicit problem identity and ownership.`,
  };
  return summaries[agentId] ?? 'Completed this fixture stage.';
}

function buildEvents(caseId: string, nodes: ClinicalStep[]): TraceEvent[] {
  const events: TraceEvent[] = [];
  const emit = (step: ClinicalStep, type: TraceEventType, summary: string, agentId?: string) => {
    const sequence = events.length;
    events.push({ id: `${caseId}:${step.stepId}:${sequence}`, caseId, stepId: step.stepId, sequence,
      timestamp: sequence * REPLAY_CONFIG.eventTimestampIntervalMs, type, agentId, summary });
  };
  const stage = (step: ClinicalStep, id: string) => {
    const agent = ARCHITECTURE_AGENTS.find((agent) => agent.id === id)!;
    emit(step, 'AGENT_STARTED', `${agent.title} started.`, id);
    if (id === 'safety_critic' && step.safety) emit(step, 'SAFETY_WARNING', step.safety, id);
    emit(step, 'AGENT_COMPLETED', stageSummary(id, step), id);
  };
  for (const step of nodes) {
    for (const id of beforeReviewStages) {
      if (id === 'specialist_pool' && step.specialties.length === 0) continue;
      stage(step, id);
    }
    emit(step, 'AGENT_STARTED', 'Presented the recommendation at the physician decision boundary.', 'physician_hitl');
    emit(step, 'PHYSICIAN_DECISION', 'Recorded simulated physician decision: ACCEPT. This replay records no real approval.', 'physician_hitl');
    emit(step, 'AGENT_COMPLETED', 'The fixture acceptance is bound to this recommendation and observation state.', 'physician_hitl');
    stage(step, 'executor');
    stage(step, 'problem_transition');
    emit(step, 'NODE_FINALIZED', `Finalized ${step.stepId}: ${step.title}. The next evidence window may now open.`, 'problem_transition');
  }
  return events;
}

/** Authored conceptual scenarios; never import the local clinical workbook here. */
export function buildCase(input: CaseInput): DemoCase {
  const nodes: ClinicalStep[] = [];
  const edges: DemoCase['edges'] = [];
  const problems = new Map<string, { label: string; owner: string; status: ProblemStatus; parent?: string }>();
  for (const [index, spec] of input.steps.entries()) {
    const stepId = `S${index + 1}`;
    const problemId = spec.problemId ?? 'P1';
    const existing = problems.get(problemId);
    const parentProblem = spec.parentProblemId ? problems.get(spec.parentProblemId) : undefined;
    const relation = spec.relation ?? (index === 0 ? 'START' : 'CONTINUE');
    const owner = spec.owner ?? existing?.owner ?? parentProblem?.owner ?? input.owner;
    const specialties = [...new Set([
      ...[...problems.values()].filter((problem) => problem.status === 'ACTIVE').map((problem) => problem.owner),
      ...(index === 0 ? [owner] : []), ...(spec.specialty ? [spec.specialty] : []),
      ...(relation === 'TRANSFER' ? [owner] : []),
    ])].filter((specialty) => specialty in SPECIALTY_LABELS).sort();
    problems.set(problemId, { label: spec.problemLabel ?? existing?.label ?? input.primaryProblem,
      owner, status: spec.status ?? (relation === 'RETURN' ? 'ACTIVE' : existing?.status ?? 'ACTIVE'),
      parent: spec.parentProblemId ?? existing?.parent });
    const parents = spec.parents ?? (index === 0 ? [] : [index]);
    const depth = parents.length ? Math.max(...parents.map((parent) => nodes[parent - 1].position.x / 280)) + 1 : 0;
    const node: ClinicalStep = {
      stepId, actionType: spec.actionType, title: spec.title, newEvidence: spec.evidence,
      action: spec.action, clinicalRationale: spec.rationale, owner, specialties, relation,
      problems: [...problems.values()].filter((problem) => problem.status !== 'RESOLVED').map((problem) => `${problem.label}${problem.status === 'SUSPENDED' ? ' · suspended' : ''}`),
      position: { x: depth * 280, y: spec.y ?? 105 }, problemId,
      parentProblemId: spec.parentProblemId ?? existing?.parent,
      problemStatus: problems.get(problemId)!.status,
      evidenceIds: spec.evidence.map((_, evidenceIndex) => `${stepId}-E${evidenceIndex + 1}`),
      clock: index + 1, ...(spec.safety ? { safety: spec.safety } : {}),
    };
    nodes.push(node);
    parents.forEach((parent, parentIndex) => edges.push({ id: `${caseIdSafe(input.caseId)}-S${parent}-${stepId}`,
      source: `S${parent}`, target: stepId,
      relation: relation === 'RETURN' && parentIndex > 0 ? 'CONTINUE' : relation }));
  }
  return { caseId: input.caseId, title: input.title, shortTitle: input.shortTitle,
    description: input.description, pattern: input.pattern,
    specialties: [...new Set(nodes.flatMap((node) => node.specialties))], nodes, edges,
    events: buildEvents(input.caseId, nodes) };
}

function caseIdSafe(value: string): string { return value.replace(/[^a-zA-Z0-9_-]/g, ''); }
