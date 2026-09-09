import type { ArchitectureAgent, ArchitectureEdge } from './types';

type AgentInput = Omit<ArchitectureAgent, 'position'>;
const agents: AgentInput[] = [
  { id: 'environment', title: 'Patient / EHR environment', subtitle: 'Observable replay context', kind: 'infrastructure', summary: 'Local synthetic observations enter the current evidence window. Later evidence remains unreleased until approved execution.', runtimeReference: 'PatientReplayEnvironment' },
  { id: 'temporal_gate', title: 'Temporal evidence gate', subtitle: 'Time + prerequisite checks', kind: 'infrastructure', summary: 'Releases only evidence whose ordinal time and prerequisite events are satisfied.', runtimeReference: 'TemporalEvidenceGate' },
  { id: 'state_interpreter', title: 'Clinical state interpreter', subtitle: 'Observations · uncertainty', kind: 'agent', summary: 'Structures current observations and can add explicit risk flags without turning a hypothesis into new evidence.', runtimeReference: 'StateInterpretation / state_interpreter' },
  { id: 'problem_manager', title: 'Problem formulation', subtitle: 'Stable problems · differential', kind: 'agent', summary: 'Describes existing stable problem IDs and proposes a differential. It does not mutate the executed clinical graph.', runtimeReference: 'ProblemFormulation / problem_manager' },
  { id: 'action_generator', title: 'Candidate action generator', subtitle: 'Explicit actionable proposals', kind: 'agent', summary: 'Produces candidate actions with visible evidence references, graph arguments, and unresolved prerequisites.', runtimeReference: 'ActionGeneration / action_generator' },
  { id: 'information_gain', title: 'Diagnostic strategy', subtitle: 'Independent ordinal assessment', kind: 'agent', summary: 'Assesses information, benefit, urgency, harm, burden, and delay as ordinal research judgments, not outcome probabilities.', runtimeReference: 'StrategyAssessment / information_gain' },
  { id: 'specialist_router', title: 'Specialist routing', subtitle: 'Explicit requests + ownership', kind: 'infrastructure', summary: 'Routes explicit candidate requests and current owners to the configured specialty pool.', runtimeReference: 'SpecialistRouter.route' },
  { id: 'specialist_pool', title: 'Selected specialist advice', subtitle: 'Only routed specialties', kind: 'agent', summary: 'Selected specialties contribute advice and concerns. Their participation alone does not transfer management ownership.', runtimeReference: 'SpecialistAdvice / specialist' },
  { id: 'retrieval', title: 'Local source retrieval', subtitle: 'Available source records', kind: 'infrastructure', summary: 'Retrieves locally available sources. This demo makes no external guideline or retrieval requests.', runtimeReference: 'LocalEvidenceRetriever' },
  { id: 'grounding', title: 'Evidence grounding', subtitle: 'Source support + limitations', kind: 'agent', summary: 'Checks support against actual retrieved source IDs. Demo summaries do not claim clinical guideline validation.', runtimeReference: 'GroundingAssessment / grounding' },
  { id: 'validation', title: 'Evidence + domain validation', subtitle: 'Provenance · graph invariants', kind: 'infrastructure', summary: 'Validates evidence visibility and dry-runs candidate graph transitions without modifying patient state.', runtimeReference: 'SafetyCritic.evaluate / apply_candidate' },
  { id: 'safety_critic', title: 'Independent safety critic', subtitle: 'Review every candidate', kind: 'agent', summary: 'Adds independent findings and vetoes. A finding-free review does not certify clinical safety.', runtimeReference: 'SafetyReview / safety_critic' },
  { id: 'policy_ranking', title: 'Safety-filtered ranking', subtitle: 'Veto before selection', kind: 'infrastructure', summary: 'Excludes vetoed actions before applying the transparent, uncalibrated ordinal scoring policy.', runtimeReference: 'OrdinalScoringPolicy.rank' },
  { id: 'arbiter', title: 'Clinical arbiter explanation', subtitle: 'Explain the selected action', kind: 'agent', summary: 'Explains the policy selection and uncertainty; it cannot overturn a veto or replace the selected candidate.', runtimeReference: 'ArbiterExplanation / arbiter' },
  { id: 'physician_hitl', title: 'Physician review', subtitle: 'Accept · modify · reject', kind: 'human', summary: 'Mandatory human decision boundary. Replay shows a recorded simulated acceptance, never an actual approval.', runtimeReference: 'PhysicianDecision / LangGraph interrupt' },
  { id: 'executor', title: 'Approved offline executor', subtitle: 'Review-bound execution', kind: 'infrastructure', summary: 'Applies only a physician-approved action that passes current safeguards. No EHR or clinical order is written.', runtimeReference: 'LangGraphRuntimeAdapter._execute' },
  { id: 'problem_transition', title: 'Clinical graph transition', subtitle: 'Append event · preserve ownership', kind: 'infrastructure', summary: 'Applies explicit problem, ownership, and reintegration semantics before the next evidence release.', runtimeReference: 'ClinicalProblemManager / apply_candidate' },
];

export const ARCHITECTURE_AGENTS: ArchitectureAgent[] = agents.map((agent, index) => {
  const row = Math.floor(index / 6);
  const column = row % 2 ? 5 - (index % 6) : index % 6;
  return { ...agent, position: { x: column * 258, y: row * 155 } };
});

export const ARCHITECTURE_EDGES: ArchitectureEdge[] = agents.slice(1).map((agent, index) => ({
  id: `architecture-${agents[index].id}-${agent.id}`,
  source: agents[index].id,
  target: agent.id,
}));
ARCHITECTURE_EDGES.push({ id: 'architecture-next-evidence', source: 'problem_transition', target: 'environment', label: 'Next evidence, after approval' });

export const SPECIALTY_LABELS: Record<string, string> = {
  neurology: 'Neurology', gastroenterology: 'Gastroenterology', otolaryngology: 'ENT',
  pulmonology: 'Pulmonology', orthopedics: 'Orthopedics', breast_surgery: 'Breast surgery',
  urology: 'Urology', critical_care: 'Critical care',
};
