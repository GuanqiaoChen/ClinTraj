export interface Evidence { evidence_id: string; text: string; source: string; available_at: number }
export interface Problem { problem_id: string; label: string; owner: string; parent_problem_id: string | null; status: string }
export interface GraphEvent { event_id: string; clock: number; problem_id: string; owner: string; action_type: string; relation: string; parent_event_ids: string[]; evidence_ids: string[]; rationale: string; advisory_specialty: string | null }
export interface Candidate {
  candidate_id: string; action_type: string; action: string; rationale: string; evidence_ids: string[];
  problem_id: string | null; relation: string; specialty: string | null; new_problem_label: string | null;
  parent_problem_id: string | null; reintegration_target_id: string | null;
  assessment: Record<string, string>; contraindications: string[]; prerequisites: string[]; uncertainty: string[];
}
export interface Citation { citation_id: string; source_id: string; source: string; version: string; citation: string; license: string; document_id: string; chunk_id: string; concept_ids: string[]; content_sha256: string; text: string; corpus: string; kind: string; score: number; channels: string[]; review_status: string | null }
export interface Recommendation {
  recommendation_id: string; candidates: Candidate[]; selected_candidate_id: string | null;
  candidate_citations: Record<string, string[]>; explanation: string; uncertainty: string[];
  proposed_differential: string[]; inferred_risk_flags: string[];
  safety_assessments: { candidate_id: string; findings: { code: string; explanation: string; veto: boolean }[] }[];
  specialist_advice: { specialty: string; advice: string; concerns: string[] }[];
  rankings: { candidate_id: string; heuristic_score: number; unknown_dimensions: string[] }[];
  model_metadata: { provider: string; model_identifier: string };
}
export interface Run { id: string; status: string; recommendation: Recommendation | null; error: string | null; bundle: { public: Citation[]; historical: Citation[]; channels: Record<string, number>; limitations: string[] } | null; physician_decision: { recommendation_id: string; response: string; rationale: string; physician_ref: string; modified_action: Candidate | null } | null }
export interface Session {
  id: string; title: string; status: string; provider: string; synthetic: boolean; revision: number;
  state: { clock: number; available_evidence: Evidence[]; active_problems: Problem[]; suspended_problems: Problem[]; resolved_problems: Problem[]; risk_flags: string[]; differential: string[]; uncertainty: string[]; clinical_graph: GraphEvent[] };
  scheduled_evidence: { id: string; available_at: number; prerequisite_events: string[] }[]; runs: Run[];
}
export interface Trace { id: number; run_id: string | null; type: string; agent: string; timestamp: string; data: Record<string, unknown> }
export interface Sample { id: string; title: string; text: string; problem: string; owner: string }
export const STAGES = [
  ["temporal_gate", "Evidence gate"], ["state_interpreter", "State interpreter"], ["problem_manager", "Problem manager"],
  ["retrieval", "Hybrid retrieval"], ["specialist", "Routed specialists"], ["action_generator", "Next-best action"],
  ["grounding", "Evidence grounding"], ["safety_critic", "Safety critic"], ["arbiter", "Clinical arbiter"], ["physician_review", "Physician review"],
] as const;

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, { method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Request failed");
  return result as T;
}
