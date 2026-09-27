/**
 * Local, synthetic diagnostic teaching fixture. No patient/session API is used.
 * Knowledge references support the diagnostic method; every case finding is invented.
 * Keep revisions private: consumers receive only the evidence available at their stage.
 */
export const NODE_WIDTH = 248;
export const NODE_HEIGHT = 116;

export type WorkflowNodeKind = 'hypothesis' | 'test' | 'evidence' | 'consultation' | 'conclusion';
export type WorkflowNodeStatus = 'candidate' | 'active' | 'supported' | 'ruled-out' | 'complete' | 'confirmed';
export type WorkflowEdgeStatus = 'active' | 'complete' | 'ruled-out';

export interface WorkflowProvenance {
  kind: 'synthetic';
  fixtureId: string;
  sessionKind: 'synthetic-research';
  label: string;
  evidenceIds: string[];
}

export interface WorkflowSource {
  id: string;
  title: string;
  url: string;
}

export interface WorkflowStage {
  id: string;
  index: number;
  label: string;
  title: string;
  summary: string;
  focusNodeIds: string[];
}

export interface WorkflowNode {
  id: string;
  kind: WorkflowNodeKind;
  title: string;
  summary: string;
  status: WorkflowNodeStatus;
  statusLabel: string;
  x: number;
  y: number;
  introducedAt: number;
  rationale: string;
  details: string[];
  evidence: string[];
  sourceIds: string[];
  provenance: WorkflowProvenance;
  priority?: string;
  burden?: string;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  status: WorkflowEdgeStatus;
  introducedAt: number;
}

export interface WorkflowNodeHistoryEntry {
  stageIndex: number;
  stageLabel: string;
  status: WorkflowNodeStatus;
  statusLabel: string;
  summary: string;
  evidence: string[];
}

export interface WorkflowSnapshot {
  stage: WorkflowStage;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  provenance: WorkflowProvenance;
  vindicatedReview: VindicatedReviewItem[];
}

export interface VindicatedReviewItem {
  id: string;
  letter: string;
  label: string;
  hypotheses: string[];
  assessment: string;
  nextStep: string;
  nodeIds: string[];
}

/** The PBL graph and the narrated workspace share this exact initial presentation. */
export const workflowCase = {
  title: '慢性咳嗽与活动后气促：跨系统鉴别',
  patientLabel: '合成病例 PBL-01 · 62 岁男性',
  problem: '咳嗽、咳痰 3 年，活动后气促进行性加重 1 年',
  initialText: '62 岁男性，咳嗽、咳痰 3 年，活动后气促进行性加重 1 年。吸烟史 35 包年，无已知哮喘诊断。既往高血压，近期偶有踝部轻度浮肿；静息状态稳定。反流、吞咽、感染、用药、职业暴露及家族史尚待补充。',
};

export const workflowMnemonicNote = '本例采用 VINDICATED 教学映射：V 血管/心源，I 感染/炎症，N 肿瘤，D 退行/缺乏，I 医源/特发，C 先天，A 自免/过敏，T 外伤/毒物，E 内分泌/代谢，D 药物。口诀存在不同版本；它用于避免遗漏，不代表穷尽病因，也不要求逐项开检查。消化道反流与误吸跨类别复核。';

/** Exactly three reviewable decision bundles per round; no clinical copy in the demo adapter. */
export const workflowDecisionRounds = [
  {
    stageIndex: 0,
    candidateNodeGroups: [['spirometry'], ['baseline-tests'], ['cardiac-tests']],
    candidateTitles: ['肺功能 + 舒张试验', '胸片 · 血常规 · 补充问诊', '心电图 · 利钠肽 / 超声'],
    candidateActions: ['获取有质量控制的舒张后肺功能，同时验证慢阻肺与哮喘假设。', '完成基础检查及跨系统问诊，核实消化道、感染、药物、暴露与危险征象。', '依据高血压、浮肿与气促线索评估心源性病因，按疑点递进补充超声。'],
    selectedCandidateIndexes: [0, 1, 2],
    reviewNote: '医生选择共享肺功能、基础检查与跨系统问诊，并按高血压及浮肿线索并行评估心源性原因。VINDICATED 全类别保留，检查按信息价值排序。',
  },
  {
    stageIndex: 2,
    candidateNodeGroups: [['repeat-spirometry', 'peak-flow'], ['bronchiectasis', 'chest-ct'], ['reflux-review']],
    candidateTitles: ['肺功能复测 · 变异性验证', '验证支气管扩张假设', '反流关联与吞咽风险复核'],
    candidateActions: ['在稳定期复测肺功能，并记录峰流速和症状变异性。', '依据多痰与反复感染新线索追加定向薄层 CT，检查结构性病变。', '记录反酸、咳嗽与体位或进食的关联，核实是否需要消化道或吞咽专项评估。'],
    selectedCandidateIndexes: [0, 1, 2],
    reviewNote: '医生复测持续性与变异性，按多痰和反复感染线索追加定向 CT，并核实反流与咳嗽的关系；未直接认定反流致咳或误吸。',
  },
  {
    stageIndex: 4,
    candidateNodeGroups: [['respiratory-review'], ['reflux-evidence', 'reflux-aspiration'], ['vascular', 'infection-neoplasm', 'deficiency-congenital', 'immune-inflammatory', 'toxic-iatrogenic', 'metabolic']],
    candidateTitles: ['医生综合诊断复核', '保留消化道共病评估', '复评其他 VINDICATED 病因'],
    candidateActions: ['整合肺功能质量、心肺与消化道证据，由医生判断主导诊断并记录未解问题。', '反流可能与肺病共存；持续症状、报警症状或吞咽风险出现时继续定向评估。', '完善遗传、职业、代谢等未知资料；依据新警讯或不相称症状重新开启对应分支。'],
    selectedCandidateIndexes: [0],
    reviewNote: '医生优先完成综合诊断复核；反流共病与低支持病因保留复评入口，未凭正常单项检查排除，也未无差别追加检查。',
  },
];

export const workflowProvenance: WorkflowProvenance = {
  kind: 'synthetic',
  fixtureId: 'pbl-diagnostic-workflow-v2',
  sessionKind: 'synthetic-research',
  label: '合成研究病例 · 非真实患者',
  evidenceIds: [],
};

export const workflowSources: WorkflowSource[] = [
  {
    id: 'gold-2026',
    title: 'GOLD 2026 · 诊断与肺功能',
    url: 'https://goldcopd.org/2026-gold-report-and-pocket-guide/',
  },
  {
    id: 'nice-ng115',
    title: 'NICE NG115 · 1.1 诊断与鉴别',
    url: 'https://www.nice.org.uk/guidance/ng115/chapter/Recommendations#diagnosing-copd',
  },
  {
    id: 'nice-ng106',
    title: 'NICE NG106 · 心力衰竭诊断',
    url: 'https://www.nice.org.uk/guidance/ng106/chapter/recommendations#diagnosing-heart-failure',
  },
  {
    id: 'bts-cough-2023',
    title: 'BTS 2023 · 慢性咳嗽跨系统评估与反流',
    url: 'https://www.brit-thoracic.org.uk/document-library/clinical-statements/cough-in-adults/chronic-cough-in-adults/',
  },
  {
    id: 'nice-ng158',
    title: 'NICE NG158 · 肺栓塞按临床概率评估',
    url: 'https://www.nice.org.uk/guidance/ng158/chapter/Recommendations#diagnosis-and-initial-management',
  },
];

export const workflowStages: WorkflowStage[] = [
  {
    id: 'hypotheses', index: 0, label: '假设', title: 'VINDICATED 全面假设，优先共享检查',
    summary: '呼吸、心脏与消化道并行考虑 · 全类别复核，按线索选择检查',
    focusNodeIds: ['presentation', 'copd', 'asthma', 'heart-failure', 'reflux-aspiration', 'spirometry', 'baseline-tests', 'cardiac-tests'],
  },
  {
    id: 'first-evidence', index: 1, label: '证据', title: '证据改变路径优先级',
    summary: '气流受限支持增强 · 新感染与反流线索触发再次跨系统复核',
    focusNodeIds: ['obstruction', 'sputum-history', 'cardiac-evidence', 'reflux-history', 'red-flag-review'],
  },
  {
    id: 'expand', index: 2, label: '检查', title: '新增假设，复用已有证据',
    summary: '提升支气管扩张验证优先级 · 纵向验证、定向影像与反流核实并行',
    focusNodeIds: ['repeat-spirometry', 'peak-flow', 'bronchiectasis', 'chest-ct', 'reflux-review'],
  },
  {
    id: 'converge', index: 3, label: '证据', title: '新证据再次更新全部假设',
    summary: '持续气流受限 · 结构性分支支持下降 · 反流可能共存，因果未定',
    focusNodeIds: ['persistent-obstruction', 'ct-evidence', 'reflux-evidence'],
  },
  {
    id: 'review', index: 4, label: '检查', title: '汇合关键证据，交由医生复核',
    summary: '复核肺功能质量与鉴别依据 · 诊断尚待医生确认',
    focusNodeIds: ['respiratory-review'],
  },
  {
    id: 'confirmation', index: 5, label: '假设', title: '医生完成诊断确认',
    summary: '医生确认慢阻肺为主导诊断 · 保留可能共病、未解问题与复评条件',
    focusNodeIds: ['confirmed-diagnosis'],
  },
];

type Revision = Partial<Pick<WorkflowNode,
  'summary' | 'status' | 'statusLabel' | 'rationale' | 'details' | 'evidence' | 'sourceIds'
>> & { stageIndex: number; evidenceIds?: string[] };

interface NodeDefinition extends WorkflowNode {
  revisions?: Revision[];
}

function provenance(evidenceIds: string[] = []): WorkflowProvenance {
  return { ...workflowProvenance, evidenceIds: [...evidenceIds] };
}

// Positions never change after a node appears, preserving the clinician's mental map.
const nodeDefinitions: NodeDefinition[] = [
  {
    id: 'presentation', kind: 'evidence', title: '初始诊断信息',
    summary: workflowCase.problem, status: 'complete', statusLabel: '初始证据',
    x: 0, y: 150, introducedAt: 0,
    rationale: '从症状与危险因素建立鉴别诊断，尚不能确定病因。',
    details: [workflowCase.initialText, workflowMnemonicNote, '尚未获得的病史标为未知；不能把未报告当作阴性。先识别危险征象，再权衡常见病、不可漏诊病与可能共病。'],
    evidence: ['慢性呼吸道症状', '烟草暴露', '需鉴别心源性气促'],
    sourceIds: ['nice-ng115'], provenance: provenance(),
  },
  {
    id: 'copd', kind: 'hypothesis', title: '慢性阻塞性肺疾病',
    summary: '慢性症状与烟草暴露相符，待验证', status: 'candidate', statusLabel: '待验证',
    x: 320, y: 0, introducedAt: 0,
    rationale: '先验证是否存在持续气流受限，再结合暴露与鉴别证据判断。',
    details: ['当前仅为假设，症状和吸烟史不能单独确诊。', '首选有质量控制的支气管舒张后肺功能检查。'],
    evidence: ['咳嗽、咳痰 3 年', '进行性活动后气促', '吸烟史 35 包年'],
    sourceIds: ['gold-2026', 'nice-ng115'], provenance: provenance(['presentation']),
    revisions: [
      { stageIndex: 1, status: 'supported', statusLabel: '证据支持', summary: '发现气流受限，仍需复测与鉴别', evidence: ['支气管舒张后 FEV₁/FVC 0.62', '慢性症状与烟草暴露'], evidenceIds: ['presentation', 'obstruction'], details: ['单次结果支持气流受限；当前仍不作最终诊断。', '边界范围内的结果需要结合复测、质量控制与临床背景。'] },
      { stageIndex: 3, summary: '复测仍有气流受限，等待专科整合', evidence: ['不同日期支气管舒张后 FEV₁/FVC 0.62、0.61', '影像未支持支气管扩张'], evidenceIds: ['presentation', 'obstruction', 'persistent-obstruction', 'ct-evidence'] },
      { stageIndex: 5, status: 'confirmed', statusLabel: '医生已确认', summary: '医生综合症状、暴露及持续气流受限后确认', details: ['本合成病例在医生复核后确认慢性阻塞性肺疾病。', '此处仅展示诊断结论，不生成治疗或用药建议。'], evidence: ['有质量控制的重复肺功能', '相符的症状及暴露背景', '医生完成鉴别诊断复核'], evidenceIds: ['presentation', 'persistent-obstruction', 'ct-evidence', 'respiratory-review'] },
    ],
  },
  {
    id: 'asthma', kind: 'hypothesis', title: '支气管哮喘',
    summary: '气流受限是否具有明显变异性？', status: 'candidate', statusLabel: '待验证',
    x: 320, y: 150, introducedAt: 0,
    rationale: '与慢阻肺共享已有肺功能，必要时补充纵向变异性与病史。',
    details: ['当前缺乏既往哮喘和过敏病史资料。', '不能仅凭单次支气管舒张反应大小排除哮喘。'],
    evidence: ['咳嗽与气促可见于多种气道疾病'],
    sourceIds: ['gold-2026', 'nice-ng115'], provenance: provenance(['presentation']),
    revisions: [
      { stageIndex: 1, summary: '单次肺功能不能区分，继续观察变异性', details: ['存在气流受限，尚需病史与纵向变化帮助鉴别。', '后续考虑峰流速记录及稳定期肺功能复测。'], evidence: ['单次舒张后仍有气流受限'], evidenceIds: ['presentation', 'obstruction'] },
      { stageIndex: 3, statusLabel: '支持减弱', summary: '未见明显变异性，交由专科进一步复核', evidence: ['连续记录未见明显峰流速变异', '症状持续，缺乏典型发作性病史'], evidenceIds: ['presentation', 'persistent-obstruction'] },
      { stageIndex: 4, status: 'ruled-out', statusLabel: '当前不支持', summary: '综合证据不足，当前停止此验证路径', details: ['医生结合起病模式、病史、纵向肺功能与峰流速记录，暂不支持哮喘作为当前主导诊断。', '并非仅凭舒张反应阴性排除；若后续出现变异性或新线索，应重新开启评估。'], evidence: ['缺乏典型变异性病史', '纵向记录未提供支持', '专科综合复核'], evidenceIds: ['presentation', 'persistent-obstruction', 'respiratory-review'] },
    ],
  },
  {
    id: 'heart-failure', kind: 'hypothesis', title: '心力衰竭',
    summary: '气促伴踝部浮肿，评估心源性原因', status: 'candidate', statusLabel: '待验证',
    x: 320, y: 300, introducedAt: 0,
    rationale: '高血压及浮肿线索使心源性原因需要同时评估。',
    details: ['先结合体征、心电图及利钠肽判断，再按临床疑点补充超声。', '不因呼吸道症状突出而提前关闭心源性分支。'],
    evidence: ['活动后气促', '高血压及偶发踝部浮肿'],
    sourceIds: ['nice-ng106'], provenance: provenance(['presentation']),
    revisions: [{ stageIndex: 1, status: 'ruled-out', statusLabel: '当前暂止', summary: '当前心源性证据不足，保留后续重评入口', details: ['低利钠肽、当前体征及超声综合降低心衰可能性，当前暂止该分支。', '射血分数正常不能单独排除 HFpEF；若气促仍无法解释或新线索出现，应重新评估。'], evidence: ['NT-proBNP 84 ng/L', '超声未见明显结构或静息舒张功能异常', '无肺淤血证据'], evidenceIds: ['presentation', 'cardiac-evidence'] }],
  },
  {
    id: 'reflux-aspiration', kind: 'hypothesis', title: '胃食管反流 / 误吸',
    summary: '消化道病因也可能参与咳嗽，需问诊', status: 'candidate', statusLabel: '跨系统假设',
    x: 320, y: 450, introducedAt: 0,
    rationale: '呼吸道症状可与反流或吞咽相关问题并存；症状、相关性和因果需要分开验证。',
    details: ['询问烧心、反酸、餐后或平卧咳嗽、吞咽困难及进食呛咳，当前尚未知。', '反流、误吸不是同义词；不能从咳嗽直接推断胃食管反流致咳或微量误吸。', '消化道分支纳入 I（非感染性炎症/特发性咳嗽鉴别）与 T（误吸损伤）交叉复核。'],
    evidence: ['慢性咳嗽，病因尚未确定'], sourceIds: ['bts-cough-2023'], provenance: provenance(['presentation']),
    revisions: [
      { stageIndex: 1, statusLabel: '新增支持线索', summary: '餐后、平卧反酸线索增加，因果待证', evidence: ['偶有餐后、平卧烧心反酸并伴咳嗽', '未报告明显进食呛咳或吞咽困难'], evidenceIds: ['presentation', 'reflux-history'], details: ['反流症状使该分支更值得核实，但尚不能解释全部活动后气促和气流受限。', '未报告呛咳不等于排除误吸；需要时由医生决定吞咽评估。'] },
      { stageIndex: 3, statusLabel: '可能共病', summary: '反流症状可能共存，尚不能认定致咳或误吸', evidence: ['症状记录中咳嗽与反酸并非总是同步', '存在持续气流受限'], evidenceIds: ['presentation', 'reflux-history', 'reflux-evidence', 'persistent-obstruction'], details: ['记录不能证明或排除反流致咳，未获得客观误吸证据。', '当前将反流保留为可能共病；若症状持续、出现吞咽困难或呛咳，按指征继续评估。'] },
    ],
  },
  {
    id: 'vascular', kind: 'hypothesis', title: '血管性 / 其他心源性',
    summary: 'V · 肺栓塞、肺高压、缺血或瓣膜病', status: 'candidate', statusLabel: '需核实风险',
    x: 320, y: 600, introducedAt: 0,
    rationale: '慢性病程不能代替危险征象评估，不能因考虑慢阻肺而漏掉肺血管和心脏病因。',
    details: ['核实突发变化、胸痛、晕厥、咯血、血栓风险与单侧腿肿；未提供的信息均未知。', '疑似肺栓塞时先评估临床概率，再决定 D-二聚体或影像；不因口诀直接安排 CTPA。', '慢性肺血管病、冠脉缺血、瓣膜病和心律失常按体征与症状定向评估。'],
    evidence: ['活动后气促', '高血压与踝部浮肿'], sourceIds: ['nice-ng158', 'nice-ng106'], provenance: provenance(['presentation']),
    revisions: [{ stageIndex: 1, statusLabel: '保留复评', summary: '补充问诊未见急性警讯；肺血管病未被排除', details: ['本轮问诊未获得突发加重、胸痛、晕厥或血栓风险线索，当前按慢性稳定路径继续。', '低利钠肽、窦性心律和静息超声不排除肺栓塞、缺血或间歇性心律失常；若出现新线索则重评。'], evidence: ['合成危险征象问诊', '合成心源性评估'], evidenceIds: ['presentation', 'red-flag-review', 'cardiac-evidence'] }],
  },
  {
    id: 'infection-neoplasm', kind: 'hypothesis', title: '感染 / 肿瘤',
    summary: 'I / N · 慢性感染、结核、肺癌或气道病变', status: 'candidate', statusLabel: '并行鉴别',
    x: 320, y: 750, introducedAt: 0,
    rationale: '咳痰需考虑感染；吸烟背景使肿瘤警讯需要核实，二者不能由慢阻肺假设替代。',
    details: ['询问发热、盗汗、结核接触、反复感染、咯血、体重下降及声音变化。', '胸片、血常规与病史共享；有持续脓痰时考虑培养，有结核或肿瘤线索时定向评估。', '初始保留结构性气道病的可能性；出现具体线索后再展开独立验证。'],
    evidence: ['慢性咳嗽、咳痰', '烟草暴露'], sourceIds: ['bts-cough-2023', 'nice-ng115'], provenance: provenance(['presentation']),
    revisions: [
      { stageIndex: 1, statusLabel: '病史促使扩展', summary: '多痰和反复感染使结构性气道病更值得验证', evidence: ['近 2 年反复下呼吸道感染', '胸片无局灶浸润；未报告咯血或体重下降'], evidenceIds: ['sputum-history', 'red-flag-review'], details: ['反复感染不等于当前有活动性感染；新病史提高支气管扩张等结构病的验证价值。', '阴性胸片与未报告警讯不能排除肿瘤或结核。'] },
      { stageIndex: 3, statusLabel: '目前支持有限', summary: '定向影像未见相关病变，保留新症状复评', evidence: ['CT 未见局灶肿块或支气管扩张', '未获得当前活动性感染证据'], evidenceIds: ['sputum-history', 'ct-evidence', 'red-flag-review'], details: ['影像降低结构性病变与肿块的支持；不排除所有感染或微小肿瘤。', '新咯血、体重下降、持续发热或痰性状变化应触发重新评估。'] },
    ],
  },
  {
    id: 'deficiency-congenital', kind: 'hypothesis', title: '退行 / 缺乏 / 先天',
    summary: 'D / C · 贫血、肌力下降、遗传性肺病', status: 'candidate', statusLabel: '待补病史',
    x: 320, y: 900, introducedAt: 0,
    rationale: '血液、呼吸肌和先天因素也能造成气促，不能只看气道。',
    details: ['血常规评估贫血；询问营养、体能及神经肌肉症状。', '核实早发肺病、家族肺/肝病，考虑 α₁ 抗胰蛋白酶缺乏；先天心肺病按线索评估。', '缺乏资料不是阴性家族史，不按口诀直接进行全部遗传检查。'],
    evidence: ['慢性活动后气促，相关病史未知'], sourceIds: ['nice-ng115', 'nice-ng106'], provenance: provenance(['presentation']),
    revisions: [{ stageIndex: 1, statusLabel: '部分支持下降', summary: '当前血红蛋白不支持贫血，遗传病史仍待核实', evidence: ['血红蛋白 143 g/L', '家族肺/肝病与早发疾病资料仍待完善'], evidenceIds: ['sputum-history', 'red-flag-review'], details: ['血红蛋白仅降低当前贫血解释，不能代替营养、肌力或遗传因素评估。', '若确认 COPD，由医生按适用指南考虑 α₁ 抗胰蛋白酶评估；本例未生成该项结果。'] }],
  },
  {
    id: 'immune-inflammatory', kind: 'hypothesis', title: '自身免疫 / 过敏',
    summary: 'A · 嗜酸性气道病、鼻病、免疫相关肺病', status: 'candidate', statusLabel: '按线索鉴别',
    x: 320, y: 1050, introducedAt: 0,
    rationale: '咳嗽可能来自鼻/上气道或非哮喘性嗜酸性炎症，也需留意系统性免疫病线索。',
    details: ['询问鼻塞、流涕、过敏、职业相关变化、皮疹和关节症状。', '按线索考虑嗜酸细胞、FeNO 或免疫检查，不无差别安排自身抗体筛查。', '无已知哮喘诊断并不等于排除哮喘或过敏。'],
    evidence: ['咳嗽和气促，过敏与系统症状资料不足'], sourceIds: ['bts-cough-2023', 'nice-ng115'], provenance: provenance(['presentation']),
    revisions: [{ stageIndex: 3, statusLabel: '保留低支持假设', summary: '低变异性与当前病史支持减弱，未完成全套排除', evidence: ['纵向记录未见明显峰流速变异', '未获得典型过敏或系统性线索', 'CT 未见间质性肺病征象'], evidenceIds: ['persistent-obstruction', 'ct-evidence', 'red-flag-review'], details: ['这些结果不单独排除哮喘、嗜酸性支气管炎或系统性疾病。', '持续无法解释的咳嗽、鼻症状或新系统表现可重新触发定向评估。'] }],
  },
  {
    id: 'toxic-iatrogenic', kind: 'hypothesis', title: '医源 / 外伤 / 毒物 / 药物',
    summary: 'I / T / D · ACEI 咳嗽、吸入损伤、药物肺病', status: 'candidate', statusLabel: '核对暴露与用药',
    x: 320, y: 1200, introducedAt: 0,
    rationale: '完整药物和暴露史可以发现可纠正的病因；特发性咳嗽仅在充分评估后考虑。',
    details: ['核实 ACE 抑制剂、可能肺毒性药物及用药时间线，未核实前不判定药物咳嗽。', '询问粉尘、烟雾、职业暴露、胸部外伤及医源性气道损伤；烟草暴露已知。', '误吸损伤另见消化道分支；特发性肺病或咳嗽不能由暂时找不到原因直接推定。'],
    evidence: ['烟草暴露 35 包年', '高血压用药清单尚未知'], sourceIds: ['bts-cough-2023'], provenance: provenance(['presentation']),
    revisions: [{ stageIndex: 1, statusLabel: '用药已核对', summary: '未使用 ACEI；烟草与未详职业暴露继续保留', evidence: ['药物清单未见 ACE 抑制剂或已知肺毒性药物', '职业暴露细节仍待核实'], evidenceIds: ['presentation', 'red-flag-review'], details: ['本轮药物核对降低 ACEI 咳嗽支持，但不代表排除所有药物相关问题。', '保留烟草暴露；医源性、外伤性原因与特发性假设按新线索复评。'] }],
  },
  {
    id: 'metabolic', kind: 'hypothesis', title: '内分泌 / 代谢',
    summary: 'E · 甲状腺、肥胖、代谢异常或体能下降', status: 'candidate', statusLabel: '先补临床线索',
    x: 320, y: 1350, introducedAt: 0,
    rationale: '肺外因素可能放大气促或与肺病共存，需要全身评估，不能把全部症状归因于一个诊断。',
    details: ['核实体重/BMI、心悸、怕热、乏力、肾病及代谢相关症状。', '按临床疑点决定甲状腺、肾功能或其他检查；未测得的指标维持未知。'],
    evidence: ['活动后气促，代谢与体能资料不足'], sourceIds: ['nice-ng106'], provenance: provenance(['presentation']),
    revisions: [{ stageIndex: 3, statusLabel: '可能共存，待线索', summary: '肺部证据增强，不能因此排除代谢共病', evidence: ['肺部证据可以解释部分气促', '未获得甲状腺或代谢专项结果'], evidenceIds: ['presentation', 'persistent-obstruction'], details: ['当前没有证据将代谢病列为主导病因，仍需医生完善体重、体能及相关病史。', '若气促与肺部损害不相称或出现相应症状，再安排定向检查。'] }],
  },
  {
    id: 'spirometry', kind: 'test', title: '肺功能 + 舒张试验',
    summary: '同时验证两条气道疾病假设', status: 'active', statusLabel: '优先检查',
    x: 640, y: 0, introducedAt: 0,
    rationale: '一次检查同时回答是否有气流受限，以及舒张后是否仍存在；信息价值高。',
    details: ['由受训人员进行质量控制，记录支气管舒张后 FEV₁/FVC。', '舒张试验属于诊断检查，不在此提供药物治疗建议。'],
    evidence: ['关联假设：慢阻肺、哮喘'], sourceIds: ['gold-2026', 'nice-ng115'],
    provenance: provenance(['presentation']), priority: '优先 · 共享验证', burden: '较低 · 无辐射',
    revisions: [{ stageIndex: 1, status: 'complete', statusLabel: '结果已回', summary: '结果进入两条气道疾病验证路径', evidence: ['已获得有质量控制的舒张后肺功能'], evidenceIds: ['presentation', 'obstruction'] }],
  },
  {
    id: 'baseline-tests', kind: 'test', title: '胸片 · 血常规 · 补充问诊',
    summary: '共享基础检查，寻找其他解释', status: 'active', statusLabel: '并行检查',
    x: 640, y: 150, introducedAt: 0,
    rationale: '复用基础检查排查贫血、影像异常等，并通过病史决定是否需要额外检查。',
    details: ['补充痰液性状、反复感染、反流、吞咽、过敏、药物、职业和家族史，核实危险征象。', '胸片与血常规服务于感染、肿瘤、贫血及心肺鉴别；按线索补充检查。', '胸部 CT、CTPA、免疫或内分泌检查不作为无差别初始套餐。'],
    evidence: ['关联假设：VINDICATED 各类及消化道反流'], sourceIds: ['nice-ng115', 'bts-cough-2023', 'nice-ng158'],
    provenance: provenance(['presentation']), priority: '并行 · 多路径复用', burden: '较低 · 胸片有辐射',
    revisions: [{ stageIndex: 1, status: 'complete', statusLabel: '结果已回', summary: '基础结果及跨系统病史形成新的验证线索', evidence: ['胸片无局灶浸润或肺淤血', '血红蛋白 143 g/L', '补充问诊获得反复感染及反流线索'], evidenceIds: ['presentation', 'sputum-history', 'reflux-history', 'red-flag-review'] }],
  },
  {
    id: 'cardiac-tests', kind: 'test', title: '心电图 · 利钠肽 / 超声',
    summary: '按心源性疑点逐步评估', status: 'active', statusLabel: '定向检查',
    x: 640, y: 300, introducedAt: 0,
    rationale: '存在高血压和浮肿线索，先行心电图与利钠肽；临床疑虑持续时补充超声。',
    details: ['检查依据来自当前症状和体征，不作所有气促病例的固定套餐。', '本合成路径中，医生因持续的心源性疑虑补充超声。'],
    evidence: ['活动后气促与踝部浮肿'], sourceIds: ['nice-ng106'],
    provenance: provenance(['presentation']), priority: '并行 · 排查替代病因', burden: '较低至中等 · 按需递进',
    revisions: [{ stageIndex: 1, status: 'complete', statusLabel: '结果已回', summary: '心源性评估结果已汇总', evidence: ['利钠肽、心电图及超声结果可用'], evidenceIds: ['presentation', 'cardiac-evidence'] }],
  },
  {
    id: 'obstruction', kind: 'evidence', title: '发现气流受限',
    summary: '舒张后 FEV₁/FVC 0.62', status: 'complete', statusLabel: '证据',
    x: 960, y: 0, introducedAt: 1,
    rationale: '结果支持气流受限，但需要临床背景与纵向验证；不直接跳转确诊。',
    details: ['合成肺功能：舒张后 FEV₁/FVC 0.62，FEV₁ 为预计值的 65%。', '测试质量可接受；仍需稳定期复测及哮喘鉴别。', '单次舒张反应大小不能可靠区分哮喘与慢阻肺。'],
    evidence: ['合成检查报告 PBL-SP-01'], sourceIds: ['gold-2026'],
    provenance: provenance(['spirometry']),
  },
  {
    id: 'sputum-history', kind: 'evidence', title: '补充病史出现新线索',
    summary: '长期较多痰液 · 反复下呼吸道感染', status: 'complete', statusLabel: '新证据',
    x: 960, y: 150, introducedAt: 1,
    rationale: '新获得的痰液和感染病史需要单独解释，可触发新的结构性气道病变假设。',
    details: ['患者在补充问诊中描述平时痰量较多，近 2 年有反复下呼吸道感染。', '胸片无局灶浸润或肺淤血；血红蛋白 143 g/L。', '这条病史在已有结果阶段才获得，不回填为初始已知证据。'],
    evidence: ['合成补充问诊 PBL-HX-02', '合成胸片及血常规 PBL-BASE-01'], sourceIds: ['nice-ng115'],
    provenance: provenance(['baseline-tests']),
  },
  {
    id: 'cardiac-evidence', kind: 'evidence', title: '心源性支持不足',
    summary: '利钠肽低 · 未见明显结构异常', status: 'complete', statusLabel: '降低支持',
    x: 960, y: 300, introducedAt: 1,
    rationale: '结合临床背景降低心衰可能性；不能把射血分数正常等同于排除所有心衰。',
    details: ['合成结果：NT-proBNP 84 ng/L，心电图窦性心律。', '按临床疑点补充超声：LVEF 63%，未见明显结构或静息舒张功能异常。', '无影像肺淤血；当前暂止心源性路径，若疑虑持续仍需重评。'],
    evidence: ['合成检查报告 PBL-CARD-01'], sourceIds: ['nice-ng106'],
    provenance: provenance(['cardiac-tests', 'baseline-tests']),
  },
  {
    id: 'reflux-history', kind: 'evidence', title: '补充消化道与吞咽病史',
    summary: '偶有餐后、平卧烧心反酸并伴咳嗽', status: 'complete', statusLabel: '新跨系统证据',
    x: 960, y: 450, introducedAt: 1,
    rationale: '新增反流症状触发消化道分支重新排序，但时间相近不等于因果。',
    details: ['合成补充病史：晚餐后或平卧时偶有烧心、反酸，并有咳嗽。', '未报告明显吞咽困难或进食呛咳；不能仅凭问诊排除隐匿误吸。', '此信息在本阶段才获得，初始诊断时仅有待核实的假设。'],
    evidence: ['合成消化道问诊 PBL-GI-HX-01'], sourceIds: ['bts-cough-2023'], provenance: provenance(['baseline-tests']),
  },
  {
    id: 'red-flag-review', kind: 'evidence', title: '危险征象与用药核实',
    summary: '本轮未见急性警讯 · 未使用 ACEI', status: 'complete', statusLabel: '补充证据',
    x: 960, y: 600, introducedAt: 1,
    rationale: '明确哪些信息已询问、哪些仍未知；不把缺失信息当作排除依据。',
    details: ['合成问诊：未报告突发加重、胸痛、晕厥、咯血、单侧腿肿、近期制动/手术或既往血栓；未报告发热、盗汗或非意愿体重下降。', '用药清单复核未见 ACE 抑制剂或已知肺毒性药物；当前无明确外伤/医源性损伤史。', '未获得明确鼻部、皮疹或关节症状线索；职业暴露细节、家族肺/肝病与体重/BMI 仍需完善。', '这些阴性问诊降低部分支持，不替代适应证明确时的专项检查。'],
    evidence: ['合成系统问诊及药物清单 PBL-SYS-HX-01'], sourceIds: ['bts-cough-2023', 'nice-ng158'], provenance: provenance(['baseline-tests']),
  },
  {
    id: 'repeat-spirometry', kind: 'test', title: '稳定期肺功能复测',
    summary: '验证气流受限是否持续存在', status: 'active', statusLabel: '继续验证',
    x: 1280, y: 0, introducedAt: 2,
    rationale: '对已有结果进行纵向复核，降低单次测量与生物学变异带来的误判。',
    details: ['在不同日期、临床稳定状态下复测舒张后肺功能。', '复核曲线、可接受性与重复性，不仅比较单个比值。'],
    evidence: ['已有 FEV₁/FVC 0.62'], sourceIds: ['gold-2026'],
    provenance: provenance(['obstruction']), priority: '优先 · 确认持续性', burden: '较低 · 无辐射',
    revisions: [{ stageIndex: 3, status: 'complete', statusLabel: '结果已回', summary: '复测证据已进入持续性判断', evidence: ['不同日期复测完成'], evidenceIds: ['obstruction', 'persistent-obstruction'] }],
  },
  {
    id: 'peak-flow', kind: 'test', title: '峰流速记录 + 病史复核',
    summary: '补充气流与症状变异性证据', status: 'active', statusLabel: '鉴别检查',
    x: 1280, y: 150, introducedAt: 2,
    rationale: '利用低负担的纵向记录补充哮喘鉴别，避免只凭单次舒张反应做决定。',
    details: ['记录连续 2 周峰流速，并核实既往发作、夜间症状、过敏及职业暴露。', '正常记录不能单独排除哮喘，结果交由专科结合背景判断。'],
    evidence: ['当前仍存在气道疾病鉴别疑问'], sourceIds: ['nice-ng115', 'gold-2026'],
    provenance: provenance(['obstruction', 'presentation']), priority: '并行 · 补足鉴别', burden: '较低 · 需持续记录',
    revisions: [{ stageIndex: 3, status: 'complete', statusLabel: '结果已回', summary: '纵向记录及补充病史可供复核', evidence: ['连续 2 周记录完成', '变异性病史复核完成'], evidenceIds: ['persistent-obstruction'] }],
  },
  {
    id: 'bronchiectasis', kind: 'hypothesis', title: '支气管扩张',
    summary: '新病史提示结构性气道病变可能', status: 'candidate', statusLabel: '新增假设',
    x: 1280, y: 350, introducedAt: 2,
    rationale: '初始保留结构性气道病可能；多痰和反复感染新证据使支气管扩张升级为独立、可验证的分支。',
    details: ['需用定向影像验证是否存在支气管扩张。', '可与其他气道疾病共存，提出该假设不替换已有假设。'],
    evidence: ['痰量较多', '反复下呼吸道感染'], sourceIds: ['nice-ng115'],
    provenance: provenance(['sputum-history']),
    revisions: [{ stageIndex: 3, status: 'ruled-out', statusLabel: '影像不支持', summary: '未见诊断性支气管扩张，终止当前分支', details: ['定向薄层 CT 未见支气管扩张征象，当前不再沿该假设追加检查。', '保留触发线索与阴性影像，便于有新证据时追溯。'], evidence: ['薄层 CT 未见支气管扩张'], evidenceIds: ['sputum-history', 'ct-evidence'] }],
  },
  {
    id: 'chest-ct', kind: 'test', title: '定向胸部薄层 CT',
    summary: '验证新增结构性气道病变假设', status: 'active', statusLabel: '按线索追加',
    x: 1600, y: 350, introducedAt: 2,
    rationale: '出现多痰与反复感染线索后，影像的额外信息价值才足以支持追加检查。',
    details: ['重点评估支气管扩张及其他结构异常，同时为现有气道疾病路径提供补充信息。', 'CT 不替代肺功能，也不作为初始常规筛查。'],
    evidence: ['新获得的反复感染和多痰病史'], sourceIds: ['nice-ng115'],
    provenance: provenance(['sputum-history', 'obstruction']), priority: '定向 · 一次服务多条路径', burden: '中等 · 有辐射',
    revisions: [{ stageIndex: 3, status: 'complete', statusLabel: '结果已回', summary: '结构性病变验证结果可用', evidence: ['薄层 CT 已完成'], evidenceIds: ['sputum-history', 'ct-evidence'] }],
  },
  {
    id: 'reflux-review', kind: 'test', title: '反流关联与吞咽风险复核',
    summary: '核实消化道线索，区分可能共病与主因', status: 'active', statusLabel: '定向问诊 / 记录',
    x: 1280, y: 500, introducedAt: 2,
    rationale: '先完善症状关联与危险征象，以低负担信息判断是否需要消化专科或吞咽检查。',
    details: ['记录咳嗽、烧心/反酸与进食、体位的时间关系；再次核实吞咽困难、呛咳及体重变化。', '相关记录不能单独证明反流致咳；不为所有慢性咳嗽常规安排胃镜或 pH 监测。', '难治反流、报警症状或吞咽风险出现时由医生决定消化道或吞咽专项评估。'],
    evidence: ['餐后/平卧烧心反酸线索', '呼吸道疾病仍在验证'], sourceIds: ['bts-cough-2023'],
    provenance: provenance(['reflux-history', 'obstruction']), priority: '并行 · 核实共病', burden: '较低 · 病史与症状记录',
    revisions: [{ stageIndex: 3, status: 'complete', statusLabel: '记录已回', summary: '症状关联记录可用，因果仍不确定', evidence: ['完成症状记录与吞咽风险复核'], evidenceIds: ['reflux-history', 'reflux-evidence'] }],
  },
  {
    id: 'persistent-obstruction', kind: 'evidence', title: '气流受限持续存在',
    summary: '复测 FEV₁/FVC 0.61 · 变异性低', status: 'complete', statusLabel: '纵向证据',
    x: 1920, y: 60, introducedAt: 3,
    rationale: '重复肺功能与纵向记录共同提供鉴别依据，仍需医生综合判断。',
    details: ['合成复测：支气管舒张后 FEV₁/FVC 0.61，FEV₁ 为预计值的 66%；质量复核通过。', '2 周峰流速记录平均日内变异率 6%，未见明显变异。', '复核病史：中老年起病，症状持续；未获得典型发作性或过敏相关线索。', '峰流速低变异性与单次舒张反应均不能单独排除哮喘。'],
    evidence: ['合成复测报告 PBL-SP-02', '合成峰流速记录 PBL-PEF-01', '合成病史复核 PBL-HX-03'],
    sourceIds: ['gold-2026', 'nice-ng115'], provenance: provenance(['repeat-spirometry', 'peak-flow', 'obstruction']),
  },
  {
    id: 'ct-evidence', kind: 'evidence', title: '未见支气管扩张',
    summary: '轻度肺气肿征象 · 无支气管扩张', status: 'complete', statusLabel: '影像证据',
    x: 1920, y: 300, introducedAt: 3,
    rationale: '影像终止不支持的结构性分支，并为保留路径补充背景；不单独确诊慢阻肺。',
    details: ['合成薄层 CT：轻度肺气肿征象，未见支气管扩张、间质性肺病征象或局灶肿块。', '肺气肿是补充证据，诊断仍依赖临床背景与有质量控制的肺功能。', '本检查不是肺动脉 CTA，不能据此排除肺栓塞；阴性影像也不排除所有微小肿瘤或误吸。'],
    evidence: ['合成影像报告 PBL-CT-01'], sourceIds: ['nice-ng115'],
    provenance: provenance(['chest-ct']),
  },
  {
    id: 'reflux-evidence', kind: 'evidence', title: '反流可能共存，因果未定',
    summary: '咳嗽与反酸并非总同步 · 无客观误吸证据', status: 'complete', statusLabel: '保留不确定性',
    x: 1920, y: 450, introducedAt: 3,
    rationale: '症状记录提示可能共病，尚不能证明反流引起咳嗽，更不能替代肺功能解释。',
    details: ['合成症状记录：部分咳嗽伴餐后或平卧反酸，其他咳嗽与反酸不同时发生。', '复核未报告吞咽困难或进食呛咳；未进行客观反流监测或吞咽检查，不能宣称排除误吸。', '当前保留反流为可能共病；持续症状、报警症状或吞咽风险可触发消化专科/吞咽评估。'],
    evidence: ['合成症状关联记录 PBL-GI-OBS-01'], sourceIds: ['bts-cough-2023'], provenance: provenance(['reflux-review', 'reflux-history']),
  },
  {
    id: 'respiratory-review', kind: 'consultation', title: '呼吸专科 · 诊断复核',
    summary: '汇合心肺、消化道与 VINDICATED 全类复核', status: 'active', statusLabel: '待医生确认',
    x: 2240, y: 150, introducedAt: 4,
    rationale: '在诊断存在鉴别问题时，医生复核证据质量、时间关系和剩余不确定性。',
    details: ['复核两次肺功能质量及持续气流受限，整合症状和烟草暴露。', '结合纵向记录和病史，当前不支持哮喘作为主导诊断；不以单项阴性结果排除。', '再按 VINDICATED 逐类检查遗漏：心血管、感染、肿瘤、缺乏、医源、先天、自免、毒物、代谢及药物。', '反流保留为可能共病，未证明致咳或误吸；遗传、职业及代谢等未完成资料明确保留。', '诊断确认权属于医生，新的或不相称症状应触发对应分支重评。'],
    evidence: ['重复肺功能与纵向峰流速', '症状、暴露及补充病史', '定向影像与心源性评估', '反流关联、药物与危险征象复核'],
    sourceIds: ['gold-2026', 'nice-ng115', 'nice-ng106', 'bts-cough-2023', 'nice-ng158'],
    provenance: provenance(['persistent-obstruction', 'ct-evidence', 'cardiac-evidence', 'reflux-evidence', 'red-flag-review', 'presentation']),
    priority: '汇合 · 医生复核', burden: '中等 · 专科评估',
    revisions: [{ stageIndex: 5, status: 'complete', statusLabel: '复核完成', summary: '医生确认主导诊断，保留共病与复评条件', details: ['合成医生复核记录 PBL-MD-01：当前证据支持慢性阻塞性肺疾病为主导诊断。', '反流仍为可能共病；未完成的遗传/职业/代谢等评估不写作阴性，按适用指南和新线索继续。', '该记录属于演示脚本，不是真实医生签署或临床审批。'], evidence: ['合成医生复核记录 PBL-MD-01'], evidenceIds: ['persistent-obstruction', 'ct-evidence', 'cardiac-evidence', 'reflux-evidence', 'red-flag-review', 'presentation'] }],
  },
  {
    id: 'confirmed-diagnosis', kind: 'conclusion', title: '慢性阻塞性肺疾病',
    summary: '综合证据一致 · 医生确认诊断', status: 'confirmed', statusLabel: '诊断确认',
    x: 2560, y: 150, introducedAt: 5,
    rationale: '相符的慢性症状及暴露背景、重复舒张后持续气流受限，以及医生完成的鉴别评估共同支持结论。',
    details: ['最终确认：慢性阻塞性肺疾病为当前主导诊断。', '可能共病：反流症状；尚未证明反流致咳或误吸，不宣称所有其他病因已排除。', '本结论只在合成研究病例最后阶段出现，遗传/职业/代谢未完成问题与复评条件随诊断保留。', '未开启治疗、处方或用药推荐流程。'],
    evidence: ['慢性咳嗽及进行性活动后气促', '吸烟 35 包年', '重复舒张后 FEV₁/FVC < 0.70', '医生综合鉴别并确认'],
    sourceIds: ['gold-2026', 'nice-ng115'], provenance: provenance(['presentation', 'persistent-obstruction', 'ct-evidence', 'respiratory-review']),
  },
];

type EdgeDefinition = Omit<WorkflowEdge, 'status'> & { completeAt?: number; ruledOutAt?: number };

function edge(source: string, target: string, introducedAt: number, options: Partial<Omit<EdgeDefinition, 'id' | 'source' | 'target' | 'introducedAt'>> = {}): EdgeDefinition {
  return { id: `${source}--${target}`, source, target, introducedAt, ...options };
}

const edgeDefinitions: EdgeDefinition[] = [
  edge('presentation', 'copd', 0, { completeAt: 1 }),
  edge('presentation', 'asthma', 0, { ruledOutAt: 4 }),
  edge('presentation', 'heart-failure', 0, { ruledOutAt: 1 }),
  ...['reflux-aspiration', 'vascular', 'infection-neoplasm', 'deficiency-congenital', 'immune-inflammatory', 'toxic-iatrogenic', 'metabolic'].flatMap(id => [
    edge('presentation', id, 0),
    edge(id, 'baseline-tests', 0, { completeAt: 1 }),
  ]),
  edge('copd', 'spirometry', 0, { label: '共享验证', completeAt: 1 }),
  edge('asthma', 'spirometry', 0, { completeAt: 1, ruledOutAt: 4 }),
  edge('copd', 'baseline-tests', 0, { completeAt: 1 }),
  edge('asthma', 'baseline-tests', 0, { completeAt: 1, ruledOutAt: 4 }),
  edge('heart-failure', 'baseline-tests', 0, { ruledOutAt: 1 }),
  edge('heart-failure', 'cardiac-tests', 0, { ruledOutAt: 1 }),
  edge('spirometry', 'obstruction', 1, { completeAt: 1 }),
  edge('baseline-tests', 'sputum-history', 1, { completeAt: 1 }),
  edge('baseline-tests', 'reflux-history', 1, { completeAt: 1 }),
  edge('baseline-tests', 'red-flag-review', 1, { completeAt: 1 }),
  edge('cardiac-tests', 'cardiac-evidence', 1, { completeAt: 1 }),
  edge('obstruction', 'repeat-spirometry', 2, { label: '验证持续性', completeAt: 3 }),
  edge('obstruction', 'peak-flow', 2, { label: '验证变异性', completeAt: 3 }),
  edge('sputum-history', 'bronchiectasis', 2, { label: '提出新假设', ruledOutAt: 3 }),
  edge('bronchiectasis', 'chest-ct', 2, { label: '定向验证', ruledOutAt: 3 }),
  edge('obstruction', 'chest-ct', 2, { label: '共享影像', completeAt: 3 }),
  edge('reflux-history', 'reflux-review', 2, { label: '验证关联', completeAt: 3 }),
  edge('obstruction', 'reflux-review', 2, { label: '跨系统鉴别', completeAt: 3 }),
  edge('repeat-spirometry', 'persistent-obstruction', 3, { completeAt: 3 }),
  edge('peak-flow', 'persistent-obstruction', 3, { completeAt: 3 }),
  edge('chest-ct', 'ct-evidence', 3, { completeAt: 3 }),
  edge('reflux-review', 'reflux-evidence', 3, { completeAt: 3 }),
  edge('persistent-obstruction', 'respiratory-review', 4, { completeAt: 5 }),
  edge('ct-evidence', 'respiratory-review', 4, { completeAt: 5 }),
  edge('cardiac-evidence', 'respiratory-review', 4, { completeAt: 5 }),
  edge('reflux-evidence', 'respiratory-review', 4, { completeAt: 5 }),
  edge('red-flag-review', 'respiratory-review', 4, { completeAt: 5 }),
  edge('respiratory-review', 'confirmed-diagnosis', 5, { label: '医生确认', completeAt: 5 }),
];

type ReviewDefinition = Omit<VindicatedReviewItem, 'assessment' | 'nextStep'> & { nextSteps: [string, string, string] };
const vindicatedDefinitions: ReviewDefinition[] = [
  { id: 'vascular', letter: 'V', label: '血管 / 心源', hypotheses: ['心力衰竭', '肺栓塞 / 肺高压', '缺血 / 瓣膜病 / 心律失常'], nodeIds: ['heart-failure', 'vascular'], nextSteps: ['核实危险征象、血栓风险与心脏体征；按线索安排心电图、利钠肽及超声。', '结合本轮心源性结果降低心衰优先级；疑似肺栓塞仍按临床概率定向评估。', '若出现新警讯或气促与肺部损害不相称，重新开启心脏及肺血管评估。'] },
  { id: 'infection', letter: 'I', label: '感染 / 炎症', hypotheses: ['慢性气道感染', '结核', '结构性气道病', '反流相关刺激'], nodeIds: ['infection-neoplasm', 'reflux-aspiration'], nextSteps: ['核实痰液、反复感染和结核接触，基础影像与问诊共享。', '多痰和反复感染使支气管扩张需要独立验证；反流线索并行核实。', '影像未支持支气管扩张；新发热、脓痰、咯血或暴露线索触发针对性复评。'] },
  { id: 'neoplastic', letter: 'N', label: '肿瘤', hypotheses: ['肺癌', '气道内病变'], nodeIds: ['infection-neoplasm'], nextSteps: ['核实咯血、体重变化等警讯；结合烟草暴露安排影像评估。', '阴性胸片不排除肿瘤；持续不明症状或警讯决定进一步检查。', '当前 CT 未见局灶肿块，仍保留持续症状和新警讯的复评入口。'] },
  { id: 'degenerative', letter: 'D', label: '退行 / 缺乏', hypotheses: ['慢阻肺 / 肺气肿', '贫血', '肌力与营养因素'], nodeIds: ['copd', 'deficiency-congenital'], nextSteps: ['获取有质量控制的肺功能、血常规，核实肌力和营养线索。', '首份气流受限需要纵向验证；当前血红蛋白降低贫血解释。', '重复气流受限支持主导肺部假设；体能、营养和肌力问题仍按线索核实。'] },
  { id: 'iatrogenic', letter: 'I', label: '医源 / 特发', hypotheses: ['医源性气道损伤', '特发性或难治性咳嗽'], nodeIds: ['toxic-iatrogenic'], nextSteps: ['询问操作、放疗与气道损伤史；未充分评估前不贴特发性标签。', '本轮未获得明确医源损伤线索；继续记录未完成病史。', '不能因已有主导诊断就忽略残余咳嗽；充分评估后再考虑难治性咳嗽。'] },
  { id: 'congenital', letter: 'C', label: '先天 / 遗传', hypotheses: ['α₁ 抗胰蛋白酶缺乏', '先天心肺异常'], nodeIds: ['deficiency-congenital'], nextSteps: ['补充早发肺病和家族肺 / 肝病史，按线索考虑相关检查。', '家族资料仍未完善，不能当成阴性遗传证据。', '由医生按适用指南考虑 α₁ 抗胰蛋白酶评估；本例没有该项结果。'] },
  { id: 'autoimmune', letter: 'A', label: '自身免疫 / 过敏', hypotheses: ['哮喘', '嗜酸性支气管炎', '鼻 / 上气道病', '免疫相关肺病'], nodeIds: ['asthma', 'immune-inflammatory'], nextSteps: ['询问过敏、鼻部及全身症状；考虑血嗜酸细胞、可用时 FeNO 等气道炎症评估。', '补充峰流速与变异性病史；阴性问诊或单次舒张反应不作独立排除。', '现有纵向记录降低部分支持，仍保留未测的炎症指标与新系统症状复评。'] },
  { id: 'traumatic', letter: 'T', label: '外伤 / 毒物', hypotheses: ['胸部或气道损伤', '烟雾 / 职业吸入损伤', '误吸'], nodeIds: ['toxic-iatrogenic', 'reflux-aspiration'], nextSteps: ['补齐外伤、职业暴露和吞咽史；消化道来源也可能表现为咳嗽。', '有反流线索但未证明误吸；核实进食、体位与症状关联。', '无呛咳不排除隐匿误吸；有吞咽风险时再安排专项评估。'] },
  { id: 'endocrine', letter: 'E', label: '内分泌 / 代谢', hypotheses: ['甲状腺疾病', '肥胖相关呼吸问题', '肾病 / 代谢异常', '体能下降'], nodeIds: ['metabolic'], nextSteps: ['补齐体重、心悸、乏力和肾病史；按临床疑点安排检查。', '本轮尚无代谢专项结果；体重、体能和相关病史仍待完善。', '主导肺部病因不能排除代谢共病；症状不相称时定向检查。'] },
  { id: 'drugs', letter: 'D', label: '药物相关', hypotheses: ['ACEI 咳嗽', '药物相关肺损伤'], nodeIds: ['toxic-iatrogenic'], nextSteps: ['核对完整用药清单和起病时间线，不从高血压诊断推定正在使用 ACEI。', '药物清单未见 ACEI 或已知肺毒性药物，当前支持下降。', '新药或用药变化后重新核对，保留药物相关病因的复评入口。'] },
];

function buildVindicatedReview(nodes: WorkflowNode[], stage: number): VindicatedReviewItem[] {
  return vindicatedDefinitions.map(({ nextSteps, ...entry }) => {
    const linked = entry.nodeIds.map(id => nodes.find(node => node.id === id)!);
    return {
      ...structuredClone(entry),
      hypotheses: entry.id === 'infection' && stage >= 2 ? [...entry.hypotheses, '支气管扩张'] : [...entry.hypotheses],
      assessment: linked.map(node => `${node.title}：${node.summary}`).join('；'),
      nextStep: nextSteps[stage >= 3 ? 2 : stage >= 1 ? 1 : 0],
    };
  });
}

function normalizeStageIndex(stageIndex: number): number {
  if (!Number.isFinite(stageIndex)) return 0;
  return Math.min(workflowStages.length - 1, Math.max(0, Math.trunc(stageIndex)));
}

function materializeNode(definition: NodeDefinition, stageIndex: number): WorkflowNode {
  const { revisions, ...initial } = definition;
  const node = structuredClone(initial);
  for (const revision of revisions ?? []) {
    if (revision.stageIndex > stageIndex) continue;
    const { stageIndex: _at, evidenceIds, ...updates } = revision;
    void _at;
    Object.assign(node, structuredClone(updates));
    if (evidenceIds) node.provenance.evidenceIds = [...evidenceIds];
  }
  return node;
}

/** Fresh snapshots make replay/rollback deterministic and prevent accidental fixture mutation. */
export function getWorkflowSnapshot(stageIndex: number): WorkflowSnapshot {
  const index = normalizeStageIndex(stageIndex);
  const nodes = nodeDefinitions.filter((node) => node.introducedAt <= index).map((node) => materializeNode(node, index));
  return {
    stage: structuredClone(workflowStages[index]),
    nodes,
    edges: edgeDefinitions.filter((item) => item.introducedAt <= index).map(({ completeAt, ruledOutAt, ...item }) => ({
      ...item,
      status: ruledOutAt !== undefined && ruledOutAt <= index ? 'ruled-out' : completeAt !== undefined && completeAt <= index ? 'complete' : 'active',
    })),
    provenance: provenance(),
    vindicatedReview: buildVindicatedReview(nodes, index),
  };
}

/** Never expose revisions, evidence, or even node existence from a future stage. */
export function getWorkflowNodeHistory(nodeId: string, stageIndex: number): WorkflowNodeHistoryEntry[] {
  const index = normalizeStageIndex(stageIndex);
  const definition = nodeDefinitions.find((node) => node.id === nodeId && node.introducedAt <= index);
  if (!definition) return [];
  const indices = [definition.introducedAt, ...(definition.revisions ?? []).filter((revision) => revision.stageIndex <= index).map((revision) => revision.stageIndex)];
  return indices.map((at) => {
    const node = materializeNode(definition, at);
    return {
      stageIndex: at, stageLabel: workflowStages[at].label,
      status: node.status, statusLabel: node.statusLabel, summary: node.summary, evidence: [...node.evidence],
    };
  });
}
