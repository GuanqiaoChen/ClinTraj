const labels: Record<string, string> = {
  triage: "主分诊", copd: "慢阻肺专科", oncology: "肿瘤专科", pneumonia: "肺炎专科", langgraph: "图工作流",
  evidence_simulator: "证据模拟器", simulating: "生成模拟证据", simulated_model: "模型模拟", simulated_pending: "模拟结果待回报",
  GRAPH_UPDATE: "图节点更新", ROUTING_COMPLETED: "分诊路由完成", AUDIT_COMPLETED: "异步审计完成", SIMULATION_COMPLETED: "模拟证据已生成",
  sparse_m3: "稀疏向量", advisory: "仅审计", policy: "审计方式", would_veto: "原规则会否决", specialties: "调用专科", reason: "理由", registry_version: "专科注册版本",
  stream_mode: "流事件模式", updates: "节点更新", custom: "自定义事件", nodes: "节点", scope: "范围", workflow: "完整工作流", elapsed_ms: "耗时毫秒",
  candidates: "候选决策", specialists: "专科协作", advisory_audit: "规则审计", retrieval_metadata: "检索配置", limitations: "限制",
  requested_profile: "请求检索模式", bge_m3: "BGE-M3 混合检索", fusion: "融合算法", schema_version: "结构版本", encoder: "编码模型", reranker: "重排序模型", unavailable: "未就绪",
  eligible_chunks: "可检索片段", bge_indexed_chunks: "已建BGE索引片段", schema_error: "结构校验说明",
  rerank_candidates: "重排候选上限", rerank_max_length: "重排长度上限", sparse_candidate_cap_per_layer: "每域稀疏召回上限",
  facets: "任务维度", score: "综合相关分", score_breakdown: "分数分解", rrf: "倒数排名融合", rerank: "重排序相关度", task_match: "任务匹配", citation_id: "来源编号",
  model: "模型", prompt_version: "提示词版本", prompt_hash: "提示词校验值", generation_mode: "生成方式", run_id: "运行编号", provenance: "来源记录", evidence_id: "证据编号",
  "Retrieval relevance is not clinical endorsement; terminology is not a guideline.": "检索相关性不等于临床认可；术语不等于诊疗指南。",
  "Multilingual embeddings are general-purpose and not clinically calibrated.": "通用多语向量尚未经过临床校准。",
  "Historical cases are separate patients; their later findings are not current evidence.": "历史病例属于其他患者，其后续结果不是本患者证据。",
  ASK_HISTORY: "询问病史", EXAM: "体格检查", TEST: "检验检查", CONSULT: "会诊", TRANSFER: "转交主管",
  TREATMENT: "治疗", PROCEDURE: "操作或手术", PATHOLOGY: "病理检查", REASSESS: "重新评估", DISCHARGE_FOLLOWUP: "出院随访",
  START: "初始评估", CONTINUE: "继续", BRANCH: "新问题分支", RETURN: "回归主线",
  ACCEPT: "接受", MODIFY: "修改", REJECT: "拒绝", ACTIVE: "进行中", COMPLETED: "已完成", IDLE: "未开始", PENDING: "等待中", WARNING: "风险提示",
  ready: "就绪", running: "运行中", reviewing: "复核中", awaiting_physician: "待医生审核", executed: "已执行", rejected: "已拒绝", blocked: "已拦截", failed: "失败",
  primary_team: "主管团队", local: "本地模型", deepseek: "DeepSeek", physician_input: "医生录入", physician_risk_review: "医生风险复核",
  neurology: "神经内科", gastroenterology: "消化内科", otolaryngology: "耳鼻喉科", pulmonology: "呼吸内科", orthopedics: "骨科", breast_surgery: "乳腺外科", urology: "泌尿外科", critical_care: "重症医学科",
  temporal_gate: "证据时序检查", state_interpreter: "状态解析", problem_manager: "问题管理", retrieval: "知识检索", specialist: "专科评估", action_generator: "行动建议", grounding: "依据核对", safety_critic: "安全审查", arbiter: "决策仲裁", physician_review: "医生审核", clinical_graph: "临床图更新", physician: "医生", runtime: "运行服务",
  EVIDENCE_UNLOCKED: "证据已解锁", STATE_UPDATED: "状态已更新", PROBLEM_CREATED: "问题已创建", PROBLEM_SUSPENDED: "问题已暂停", PROBLEM_RESUMED: "问题已恢复", BRANCH_CREATED: "分支已创建", AGENT_STARTED: "阶段开始", AGENT_COMPLETED: "阶段完成", RETRIEVAL_COMPLETED: "检索完成", ACTION_PROPOSED: "已生成建议", SAFETY_WARNING: "安全提示", ARBITRATION_COMPLETED: "仲裁完成", PHYSICIAN_DECISION: "医生决策", NODE_FINALIZED: "节点已保存", RUN_FAILED: "运行失败", RUN_COMPLETED: "运行完成",
  lexical: "关键词", dense: "向量", graph: "图谱", article: "文献", terminology: "术语", historical_case: "历史病例", synthetic_case: "合成病例", reviewed: "已审核", review_incomplete: "审核未完成", synthetic_unvalidated: "未验证的合成案例", not_clinician_reviewed: "未经医生审核",
  problem_id: "问题编号", specialty: "专科", new_problem_label: "新问题名称", parent_problem_id: "父问题编号", reintegration_target_id: "回归目标问题", action_type: "行动类型", relation: "轨迹关系", normalized: "关系已校正",
  information_gain: "信息增益", clinical_benefit: "临床获益", urgency: "紧急程度", harm: "伤害风险", burden: "负担", delay: "延误",
  LOW: "低", MEDIUM: "中", HIGH: "高", UNKNOWN: "未知",
  status: "状态", response: "决定", physician_ref: "审核人", event_id: "节点编号", owner: "主管团队", candidate_id: "候选编号", candidate_ids: "候选编号", evidence_ids: "证据编号", citation_ids: "引用编号", channels: "召回数量", public_count: "公共知识数", historical_count: "历史案例数", veto_count: "否决数", eligible_count: "可选数", selected_candidate_id: "选中候选", visible_evidence_count: "可用证据数", risk_flags: "风险标记", provisional: "待确认", code: "类型", veto: "否决", error_type: "错误类型", operation: "操作",
  unstable: "病情不稳定", acute_deterioration: "急性恶化", requires_escalation: "需要升级处置",
  "Human Phenotype Ontology starter subset": "人类表型本体（HPO）起始子集", "ClinTraj synthetic workflow cases": "ClinTraj 合成流程案例", "Local clinician-review workbook": "本地病例审核工作簿",
};

export function zh(value: string | null | undefined): string {
  return value ? labels[value] ?? value : "";
}

export function traceText(data: Record<string, unknown>): string {
  function translate(value: unknown): unknown {
    if (typeof value === "string") return zh(value);
    if (Array.isArray(value)) return value.map(translate);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [zh(key), translate(item)]));
    return value;
  }
  return JSON.stringify(translate(data), null, 0);
}

// Deterministic check codes carry fixed meanings; model-written findings pass through.
const findings: Record<string, string> = {
  role_unavailable: "模型角色在本轮时限内未完成，已使用备用流程。",
  retrieval_unavailable: "本轮检索未完成，未据此阻断候选方案。",
  specialist_unavailable: "专科角色本轮未完成，主分诊继续生成候选。",
  capacity_exhausted: "并发容量已满，本轮跳过该专科角色。",
  fabricated_citation: "无效知识引用已移除，原候选保留供医生判断。",
  simulation_failed: "模拟生成中断，已释放会话，可继续录入证据。",
  simulation_unavailable: "模拟模型未返回有效结果，本轮仅记录待观察状态，可继续研究流程。",
  source_changed: "原引用来源有变化，已记录供复核。",
  relation_normalized: "轨迹关系已按实际执行的转换自动校正，未因标注错误否决该行动。",
  unavailable_evidence: "引用了当前不可用或尚未解锁的证据。",
  ungrounded_action: "该类型的行动必须引用当前已可用的证据。",
  invalid_branch: "新建问题需要新的问题编号和明确的问题名称。",
  invalid_branch_parent: "新问题分支需要一个已存在的父问题。",
  unknown_problem: "行动指向的问题不存在。",
  consult_action_mismatch: "会诊关系必须配合会诊行动。",
  consult_relation_mismatch: "会诊必须使用会诊关系以保留主管权。",
  transfer_action_mismatch: "转交关系必须配合转交行动。",
  transfer_relation_mismatch: "变更主管团队必须使用转交关系。",
  missing_ownership_context: "专科协作需要明确的问题和目标专科。",
  invalid_return: "回归主线需要一次新的重新评估和已存在的回归目标问题。",
  invalid_graph_transition: "该临床图转换不符合领域语义，无法执行。",
  contraindication: "存在未解决的禁忌症，需要医生重新评估。",
  unmet_prerequisites: "行动的前置条件尚未满足。",
  premature_discharge: "在不稳定或需升级处置的标记未解除前，不能出院。",
  missed_escalation: "存在需要升级处置的标记，应先处理再执行常规行动。",
  unassessed_invasive_action: "有创操作必须给出明确的获益与伤害评估。",
  insufficient_public_grounding: "治疗、操作或出院建议缺少公共文献支持。",
  physician_action_vetoed: "医生提交的行动未通过独立安全审查。",
};

export function findingText(code: string, explanation: string): string {
  return findings[code] ?? (/[㐀-鿿]/.test(explanation) ? explanation : `${zh(code)}：${explanation}`);
}

export function uiError(message: string): string {
  const known: Record<string, string> = {
    "Request failed": "请求失败，请重试。", "Failed to fetch": "连接失败，请检查本地服务。",
    "Review interrupted; retry the same decision to resume safely": "审核中断，请重试已保存的决定。",
    "Complete or reject the pending recommendation before changing observations": "请先完成或拒绝待审核建议，再修改观察信息。",
    "Invalid request schema": "输入格式不正确，请检查填写内容。",
    "Model unavailable or invalid JSON; check model readiness/configuration": "模型不可用或输出格式错误，请检查模型配置后重试。",
    "Role output cites unavailable evidence": "模型引用了不可用证据，本次建议已停止生成。",
    "Grounding produced fabricated citation or candidate IDs": "依据核对发现无效引用，本次建议已停止生成。",
    "Modified action vetoed; reconsider and run a new decision": "修改后的建议未通过安全审查，请重新评估并生成建议。",
    "Modified action has invalid grounding references": "修改后的建议引用无效，请重新填写后提交。",
    "Server restarted during proposal; run the next decision again.": "服务在生成建议时重启，请重新运行。",
    "Origin is not allowed": "请求来源不被允许，请从本地工作台访问。",
    "Run not found": "未找到该次运行记录。",
    "Run is not awaiting review": "该次运行当前不在待审核状态。",
    "Recommendation does not match this run": "建议与该次运行不匹配，请刷新后重试。",
    "This run already has a different physician decision": "该次运行已记录了不同的医生决定。",
    "Supporting source changed; reject and rerun": "支持文献已变更，请拒绝并重新运行。",
    "Invalid problem lifecycle transition": "问题状态变更不被允许。",
  };
  if (known[message]) return known[message];
  if (message.startsWith("Invalid structured output")) return "模型输出未通过格式校验，请重试。";
  if (/Model endpoint returned HTTP \d+/.test(message)) return `模型接口请求失败（HTTP ${message.match(/\d+/)?.[0]}）。`;
  return /[㐀-鿿]/.test(message) ? message : "操作未完成，请检查输入或服务状态后重试。";
}

export const FLOW_LABELS = {
  "controls.ariaLabel": "图形控制", "controls.zoomIn.ariaLabel": "放大", "controls.zoomOut.ariaLabel": "缩小", "controls.fitView.ariaLabel": "适应视图", "controls.interactive.ariaLabel": "切换交互",
  "node.a11yDescription.default": "按回车或空格选择节点，按 Escape 取消选择。",
  "edge.a11yDescription.default": "按回车或空格选择连线，按 Escape 取消选择。",
};

export const SAMPLE_ZH: Record<string, { title: string; problem: string; text: string }> = {
  "synthetic-neurology": { title: "新发局灶性神经症状", problem: "新发局灶性神经症状", text: "合成病例：成人今日发现单侧上肢无力，具体起病时间不确定。目前无影像和化验结果，尚未录入生命体征。" },
  "synthetic-pulmonary": { title: "发热伴呼吸道症状", problem: "发热与呼吸道症状", text: "合成病例：成人发热、咳嗽两天。尚无实测血氧饱和度、呼吸频率及胸部影像。当前用药和过敏史有待核实。" },
  "synthetic-urology": { title: "排尿不适伴发热", problem: "排尿症状与发热", text: "合成病例：成人排尿疼痛并伴发热。尚无尿常规、培养和肾功能结果，血流动力学是否稳定尚未确认。" },
  "synthetic-breast": { title: "乳腺肿块评估", problem: "乳腺肿块", text: "合成病例：成人自述新发现乳腺肿块，目前无影像或组织学诊断。病程、伴随症状及家族史尚不明确。" },
  "synthetic-gi": { title: "持续腹部不适", problem: "腹部不适", text: "合成病例：成人自述间歇性腹部不适。目前无查体、血液检查或影像结果。病程、排便变化、出血情况及生命体征均需进一步了解。" },
};
