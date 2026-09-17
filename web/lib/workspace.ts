export interface Evidence { evidence_id: string; text: string; source: string; available_at: number; synthetic: boolean; provenance: Record<string, string> }
export interface Problem { problem_id: string; label: string; owner: string; parent_problem_id: string | null; status: string }
export interface GraphEvent { event_id: string; clock: number; problem_id: string; owner: string; action_type: string; relation: string; parent_event_ids: string[]; evidence_ids: string[]; rationale: string; advisory_specialty: string | null }
export interface Candidate {
  candidate_id: string; action_type: string; action: string; rationale: string; evidence_ids: string[];
  problem_id: string | null; relation: string; specialty: string | null; new_problem_label: string | null;
  parent_problem_id: string | null; reintegration_target_id: string | null;
  assessment: Record<string, string>; contraindications: string[]; prerequisites: string[]; uncertainty: string[];
}
export interface Citation { citation_id: string; source_id: string; source: string; version: string; citation: string; license: string; document_id: string; chunk_id: string; concept_ids: string[]; content_sha256: string; text: string; corpus: string; kind: string; score: number; facets: Record<string, unknown>; score_breakdown: Record<string, number>; channels: string[]; review_status: string | null }
export interface Recommendation {
  generation_mode: string; elapsed_ms: number; audit_policy: string; recommendation_id: string; candidates: Candidate[]; selected_candidate_id: string | null;
  candidate_citations: Record<string, string[]>; explanation: string; uncertainty: string[];
  proposed_differential: string[]; inferred_risk_flags: string[];
  safety_assessments: { candidate_id: string; findings: { code: string; explanation: string; veto: boolean }[] }[];
  specialist_advice: { specialty: string; advice: string; concerns: string[] }[];
  rankings: { candidate_id: string; heuristic_score: number; unknown_dimensions: string[] }[];
  roles_invoked: string[];
  model_metadata: { provider: string; model_identifier: string };
}
export interface Run { id: string; status: string; recommendation: Recommendation | null; error: string | null; bundle: { public: Citation[]; historical: Citation[]; channels: Record<string, number>; limitations: string[]; retrieval_metadata: Record<string, unknown> } | null; physician_decision: { recommendation_id: string; response: string; rationale: string; physician_ref: string; modified_action: Candidate | null; selected_candidate_ids: string[] } | null }
export interface Session {
  id: string; title: string; status: string; provider: string; synthetic: boolean; simulate_evidence: boolean; revision: number;
  state: { clock: number; available_evidence: Evidence[]; active_problems: Problem[]; suspended_problems: Problem[]; resolved_problems: Problem[]; risk_flags: string[]; differential: string[]; uncertainty: string[]; clinical_graph: GraphEvent[] };
  scheduled_evidence: { id: string; available_at: number; prerequisite_events: string[] }[]; runs: Run[];
}
export interface Trace { id: number; run_id: string | null; type: string; agent: string; timestamp: string; data: Record<string, unknown> }
export interface Sample { id: string; title: string; text: string; problem: string; owner: string }
export const STAGES = [
  ["temporal_gate", "证据时序闸门"], ["state_interpreter", "临床状态解析"], ["problem_manager", "临床问题梳理"],
  ["retrieval", "混合知识检索"], ["specialist", "专科定向评估"], ["action_generator", "下一步行动生成"],
  ["grounding", "证据依据核对"], ["safety_critic", "独立安全审查"], ["arbiter", "临床决策仲裁"], ["physician_review", "医生审核"],
] as const;

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, { method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Request failed");
  return result as T;
}
