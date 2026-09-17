import type { AgentStatus } from './types';

// Presentation groups preserve every trace ID without changing execution order.
export const ARCHITECTURE_VIEW_NODES = [
  { id: 'evidence', members: ['environment', 'temporal_gate'], title: '可见证据', caption: '时序闸门', kind: 'infrastructure', position: { x: 35, y: 58 }, detail: '只有时间与前置条件都满足的观察信息，才会进入本次决策。' },
  { id: 'state_interpreter', members: ['state_interpreter'], title: '状态解析', kind: 'agent', position: { x: 35, y: 154 }, detail: '把可见的观察信息、不确定性与明确的风险标记结构化。' },
  { id: 'problem_manager', members: ['problem_manager'], title: '问题梳理', kind: 'agent', position: { x: 220, y: 154 }, detail: '描述稳定的临床问题，并给出鉴别诊断。' },
  { id: 'action_generator', members: ['action_generator'], title: '行动生成', kind: 'agent', position: { x: 415, y: 154 }, detail: '提出以可见证据为依据的可执行行动。' },
  { id: 'information_gain', members: ['information_gain'], title: '诊断策略', kind: 'agent', position: { x: 600, y: 58 }, detail: '以序数量表评估信息增益、获益、紧急程度、伤害、负担与延误。' },
  { id: 'specialist_pool', members: ['specialist_router', 'specialist_pool'], title: '专科意见', kind: 'agent', position: { x: 785, y: 58 }, detail: '被明确路由的专科提供意见，主管团队保持不变。' },
  { id: 'grounding', members: ['retrieval', 'grounding'], title: '证据依据核对', kind: 'agent', position: { x: 600, y: 250 }, detail: '对照检索到的本地来源核对候选行动的支持关系与局限。' },
  { id: 'validation', members: ['validation'], title: '领域校验', kind: 'infrastructure', position: { x: 415, y: 250 }, detail: '校验证据可见性并试运行临床图转换；关系标注错误会被校正为实际执行的转换，而不是直接否决。' },
  { id: 'safety_critic', members: ['safety_critic'], title: '安全审查', caption: '独立审查', kind: 'agent', position: { x: 785, y: 154 }, detail: '独立审查每个候选行动，必要时行使否决。' },
  { id: 'policy_ranking', members: ['policy_ranking'], title: '策略排序', caption: '已剔除被否决项', kind: 'infrastructure', position: { x: 975, y: 58 }, detail: '先剔除被否决的行动，再应用确定性的序数排序策略。' },
  { id: 'arbiter', members: ['arbiter'], title: '仲裁说明', kind: 'agent', position: { x: 1160, y: 58 }, detail: '解释被选中的行动与不确定性；不能推翻排序结果或任何否决。' },
  { id: 'physician_hitl', members: ['physician_hitl'], title: '医生审核', caption: '接受 · 修改 · 拒绝', kind: 'human', position: { x: 1160, y: 154 }, detail: '必须由医生做出决定；本回放展示的是记录下来的模拟批准。' },
  { id: 'execution', members: ['executor', 'problem_transition'], title: '批准后执行', caption: '临床图更新', kind: 'infrastructure', position: { x: 1160, y: 250 }, detail: '在释放下一批证据之前，执行已批准的离线行动并完成临床图转换。' },
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
