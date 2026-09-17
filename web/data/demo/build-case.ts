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

const RELATION_LABELS: Record<RelationType, string> = {
  START: '初始评估', CONTINUE: '继续', BRANCH: '新问题分支',
  CONSULT: '会诊', TRANSFER: '转交主管', RETURN: '回归主线',
};

const beforeReviewStages = [
  'environment', 'temporal_gate', 'state_interpreter', 'problem_manager', 'action_generator',
  'information_gain', 'specialist_router', 'specialist_pool', 'retrieval', 'grounding',
  'validation', 'safety_critic', 'policy_ranking', 'arbiter',
];

function stageSummary(agentId: string, step: ClinicalStep): string {
  const summaries: Record<string, string> = {
    environment: '读取当前的合成观察窗口。',
    temporal_gate: `释放了 ${step.newEvidence.length} 条当前发现；更晚的证据仍处于锁定状态。`,
    state_interpreter: '把可见发现、不确定性与明确的风险标记结构化。',
    problem_manager: `梳理当前问题：${step.problems.join('；')}。`,
    action_generator: `提出一个可执行候选：${step.title}。`,
    information_gain: '按序数研究量表评估信息增益、获益、紧急程度、伤害、负担与延误。',
    specialist_router: `按明确请求与当前主管团队路由：${step.specialties.map((id) => SPECIALTY_LABELS[id] ?? id).join('、')}。`,
    specialist_pool: '补充了受邀专科的意见，未隐含转移主管权。',
    retrieval: '检索了本地合成来源，未请求任何外部来源。',
    grounding: '记录了证据支持与局限，不声称经过指南验证。',
    validation: `校验可见证据编号，并试运行该转换；本步记录的轨迹关系为${RELATION_LABELS[step.relation]}。`,
    safety_critic: step.safety ? '提示了急重症相关风险；所选的升级处置仍需医生审核。' : '完成了本演示的安全审查，脚本中没有否决项。',
    policy_ranking: '先剔除被否决的候选，再进行序数策略排序。',
    arbiter: '解释了被选中的候选与不确定性；独立否决依然有效。',
    executor: '在通过各项防护后，执行了模拟接受的行动。',
    problem_transition: step.relation === 'RETURN' ? '追加了一个带有分支与上游双父节点的新重新评估，历史事件保持不变。' : `追加了一个${RELATION_LABELS[step.relation]}事件，问题身份与主管关系明确。`,
  };
  return summaries[agentId] ?? '完成了本演示的该阶段。';
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
    emit(step, 'AGENT_STARTED', `${agent.title}已开始。`, id);
    if (id === 'safety_critic' && step.safety) emit(step, 'SAFETY_WARNING', step.safety, id);
    emit(step, 'AGENT_COMPLETED', stageSummary(id, step), id);
  };
  for (const step of nodes) {
    for (const id of beforeReviewStages) {
      if (id === 'specialist_pool' && step.specialties.length === 0) continue;
      stage(step, id);
    }
    emit(step, 'AGENT_STARTED', '在医生决策边界上呈交本条建议。', 'physician_hitl');
    emit(step, 'PHYSICIAN_DECISION', '记录了模拟的医生决定：接受。本回放不代表任何真实批准。', 'physician_hitl');
    emit(step, 'AGENT_COMPLETED', '该模拟接受只绑定这条建议和当时的观察状态。', 'physician_hitl');
    stage(step, 'executor');
    stage(step, 'problem_transition');
    emit(step, 'NODE_FINALIZED', `已保存 ${step.stepId}：${step.title}。下一批证据窗口现在可以开启。`, 'problem_transition');
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
      problems: [...problems.values()].filter((problem) => problem.status !== 'RESOLVED').map((problem) => `${problem.label}${problem.status === 'SUSPENDED' ? ' · 已暂停' : ''}`),
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
