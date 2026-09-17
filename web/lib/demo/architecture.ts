import type { ArchitectureAgent, ArchitectureEdge } from './types';

type AgentInput = Omit<ArchitectureAgent, 'position'>;
const agents: AgentInput[] = [
  { id: 'environment', title: '患者 / 病历环境', subtitle: '可观察的回放上下文', kind: 'infrastructure', summary: '本地合成观察信息进入当前证据窗口。更晚的证据在批准执行之前不会释放。', runtimeReference: 'PatientReplayEnvironment' },
  { id: 'temporal_gate', title: '证据时序闸门', subtitle: '时间与前置条件校验', kind: 'infrastructure', summary: '只释放序号时间已到、且前置事件已满足的证据。', runtimeReference: 'TemporalEvidenceGate' },
  { id: 'state_interpreter', title: '临床状态解析', subtitle: '观察信息 · 不确定性', kind: 'agent', summary: '把当前观察信息结构化，并可以补充明确的风险标记，但不会把猜测变成新的证据。', runtimeReference: 'StateInterpretation / state_interpreter' },
  { id: 'problem_manager', title: '临床问题梳理', subtitle: '稳定问题 · 鉴别诊断', kind: 'agent', summary: '描述已有的稳定问题编号并给出鉴别诊断，不会直接改动已执行的临床图。', runtimeReference: 'ProblemFormulation / problem_manager' },
  { id: 'action_generator', title: '候选行动生成', subtitle: '可执行的明确建议', kind: 'agent', summary: '生成候选行动，并附上可见证据引用、临床图论据与尚未满足的前置条件。', runtimeReference: 'ActionGeneration / action_generator' },
  { id: 'information_gain', title: '诊断策略评估', subtitle: '独立的序数判断', kind: 'agent', summary: '对信息增益、获益、紧急程度、伤害、负担与延误给出序数研究判断，不是结局概率。', runtimeReference: 'StrategyAssessment / information_gain' },
  { id: 'specialist_router', title: '专科路由', subtitle: '明确请求 + 主管关系', kind: 'infrastructure', summary: '按候选行动中的明确请求和当前主管团队，路由到已配置的专科池。', runtimeReference: 'SpecialistRouter.route' },
  { id: 'specialist_pool', title: '受邀专科意见', subtitle: '仅限被路由的专科', kind: 'agent', summary: '被选中的专科提供意见与顾虑。参与本身并不转移主管权。', runtimeReference: 'SpecialistAdvice / specialist' },
  { id: 'retrieval', title: '本地知识检索', subtitle: '可用的来源记录', kind: 'infrastructure', summary: '检索本地可用来源。本演示不会发起任何外部指南或检索请求。', runtimeReference: 'LocalEvidenceRetriever' },
  { id: 'grounding', title: '证据依据核对', subtitle: '来源支持 + 局限', kind: 'agent', summary: '对照真实检索到的来源编号核对支持关系。演示摘要不声称经过指南验证。', runtimeReference: 'GroundingAssessment / grounding' },
  { id: 'validation', title: '证据与领域校验', subtitle: '溯源 · 图不变量', kind: 'infrastructure', summary: '校验证据可见性，并对候选的临床图转换做一次试运行，不改动患者状态；关系标注错误在这里被校正，而不是直接否决。', runtimeReference: 'SafetyCritic.evaluate / apply_candidate' },
  { id: 'safety_critic', title: '独立安全审查', subtitle: '逐条审查每个候选', kind: 'agent', summary: '补充独立的发现与否决意见。没有发现并不等于已证明临床安全。', runtimeReference: 'SafetyReview / safety_critic' },
  { id: 'policy_ranking', title: '安全过滤后的排序', subtitle: '先否决，再选择', kind: 'infrastructure', summary: '先剔除被否决的行动，再应用透明、未标定的序数评分策略。', runtimeReference: 'OrdinalScoringPolicy.rank' },
  { id: 'arbiter', title: '临床决策仲裁说明', subtitle: '解释被选中的行动', kind: 'agent', summary: '解释策略选择与不确定性；它不能推翻否决，也不能替换被选中的候选。', runtimeReference: 'ArbiterExplanation / arbiter' },
  { id: 'physician_hitl', title: '医生审核', subtitle: '接受 · 修改 · 拒绝', kind: 'human', summary: '必需的人工决策边界。回放中展示的是记录下来的模拟接受，并非真实批准。', runtimeReference: 'PhysicianDecision / LangGraph interrupt' },
  { id: 'executor', title: '离线执行器', subtitle: '仅执行已审核内容', kind: 'infrastructure', summary: '只执行经医生批准且通过现有防护的行动。不写入任何病历系统或医嘱。', runtimeReference: 'LangGraphRuntimeAdapter._execute' },
  { id: 'problem_transition', title: '临床图转换', subtitle: '追加事件 · 保留主管关系', kind: 'infrastructure', summary: '在下一批证据释放之前，应用明确的问题、主管权与回归语义。', runtimeReference: 'ClinicalProblemManager / apply_candidate' },
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
ARCHITECTURE_EDGES.push({ id: 'architecture-next-evidence', source: 'problem_transition', target: 'environment', label: '批准后释放下一批证据' });

export const SPECIALTY_LABELS: Record<string, string> = {
  neurology: '神经内科', gastroenterology: '消化内科', otolaryngology: '耳鼻喉科',
  pulmonology: '呼吸内科', orthopedics: '骨科', breast_surgery: '乳腺外科',
  urology: '泌尿外科', critical_care: '重症医学科',
};
