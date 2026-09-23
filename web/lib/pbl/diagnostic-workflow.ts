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
}

export const workflowProvenance: WorkflowProvenance = {
  kind: 'synthetic',
  fixtureId: 'pbl-diagnostic-workflow-v1',
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
];

export const workflowStages: WorkflowStage[] = [
  {
    id: 'hypotheses', index: 0, label: '初始假设', title: '提出假设，优先共享检查',
    summary: '3 个待验证假设 · 先获取能同时区分多条路径的证据',
    focusNodeIds: ['copd', 'asthma', 'heart-failure', 'spirometry', 'baseline-tests', 'cardiac-tests'],
  },
  {
    id: 'first-evidence', index: 1, label: '首轮证据', title: '证据改变路径优先级',
    summary: '气流受限线索增强 · 心源性路径暂止 · 补充病史带来新疑点',
    focusNodeIds: ['obstruction', 'sputum-history', 'cardiac-evidence'],
  },
  {
    id: 'expand', index: 2, label: '扩展验证', title: '新增假设，复用已有证据',
    summary: '新增支气管扩张假设 · 纵向验证与定向影像并行',
    focusNodeIds: ['repeat-spirometry', 'peak-flow', 'bronchiectasis', 'chest-ct'],
  },
  {
    id: 'converge', index: 3, label: '路径收敛', title: '保留证据，终止不支持的分支',
    summary: '气流受限持续存在 · 影像不支持支气管扩张 · 等待专科整合',
    focusNodeIds: ['persistent-obstruction', 'ct-evidence'],
  },
  {
    id: 'review', index: 4, label: '专科复核', title: '汇合关键证据，交由医生复核',
    summary: '复核肺功能质量与鉴别依据 · 诊断尚待医生确认',
    focusNodeIds: ['persistent-obstruction', 'ct-evidence', 'respiratory-review'],
  },
  {
    id: 'confirmation', index: 5, label: '诊断确认', title: '医生完成诊断确认',
    summary: '慢阻肺假设获得确认 · 保留全部证据与已终止路径',
    focusNodeIds: ['respiratory-review', 'confirmed-diagnosis'],
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
    id: 'presentation', kind: 'evidence', title: '慢性咳嗽 · 活动后气促',
    summary: '62 岁男性 · 吸烟 35 包年', status: 'complete', statusLabel: '初始证据',
    x: 0, y: 150, introducedAt: 0,
    rationale: '从症状与危险因素建立鉴别诊断，尚不能确定病因。',
    details: ['咳嗽、咳痰 3 年，活动后气促进行性加重 1 年。', '吸烟史 35 包年；无已知哮喘诊断。', '既往高血压，近期偶有踝部轻度浮肿；静息状态稳定。'],
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
    rationale: '与慢阻肺共享首轮肺功能，必要时补充纵向变异性与病史。',
    details: ['当前缺乏既往哮喘和过敏病史资料。', '不能仅凭单次支气管舒张反应大小排除哮喘。'],
    evidence: ['咳嗽与气促可见于多种气道疾病'],
    sourceIds: ['gold-2026', 'nice-ng115'], provenance: provenance(['presentation']),
    revisions: [
      { stageIndex: 1, summary: '单次肺功能不能区分，继续观察变异性', details: ['存在气流受限，尚需病史与纵向变化帮助鉴别。', '下一轮考虑峰流速记录及稳定期肺功能复测。'], evidence: ['单次舒张后仍有气流受限'], evidenceIds: ['presentation', 'obstruction'] },
      { stageIndex: 3, statusLabel: '支持减弱', summary: '未见明显变异性，交由专科进一步复核', evidence: ['连续记录未见明显峰流速变异', '症状持续，缺乏典型发作性病史'], evidenceIds: ['presentation', 'persistent-obstruction'] },
      { stageIndex: 4, status: 'ruled-out', statusLabel: '本轮不支持', summary: '综合证据不足，本轮停止此验证路径', details: ['医生结合起病模式、病史、纵向肺功能与峰流速记录，暂不支持哮喘作为本轮主导诊断。', '并非仅凭舒张反应阴性排除；若后续出现变异性或新线索，应重新开启评估。'], evidence: ['缺乏典型变异性病史', '纵向记录未提供支持', '专科综合复核'], evidenceIds: ['presentation', 'persistent-obstruction', 'respiratory-review'] },
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
    revisions: [{ stageIndex: 1, status: 'ruled-out', statusLabel: '本轮暂止', summary: '当前心源性证据不足，保留后续重评入口', details: ['低利钠肽、当前体征及超声综合降低心衰可能性，本轮暂止该分支。', '射血分数正常不能单独排除 HFpEF；若气促仍无法解释或新线索出现，应重新评估。'], evidence: ['NT-proBNP 84 ng/L', '超声未见明显结构或静息舒张功能异常', '无肺淤血证据'], evidenceIds: ['presentation', 'cardiac-evidence'] }],
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
    details: ['补充痰液性状、反复感染及症状变异性病史。', '胸部 CT 不作为无差别的初始检查。'],
    evidence: ['关联假设：气道疾病与心源性原因'], sourceIds: ['nice-ng115'],
    provenance: provenance(['presentation']), priority: '并行 · 多路径复用', burden: '较低 · 胸片有辐射',
    revisions: [{ stageIndex: 1, status: 'complete', statusLabel: '结果已回', summary: '基础结果及补充病史形成新的验证线索', evidence: ['胸片无局灶浸润或肺淤血', '血红蛋白 143 g/L', '补充问诊获得反复感染线索'], evidenceIds: ['presentation', 'sputum-history'] }],
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
    summary: '舒张后 FEV₁/FVC 0.62', status: 'complete', statusLabel: '首轮证据',
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
    details: ['患者在补充问诊中描述平时痰量较多，近 2 年有反复下呼吸道感染。', '胸片无局灶浸润或肺淤血；血红蛋白 143 g/L。', '这条病史在首轮结果阶段才获得，不回填为初始已知证据。'],
    evidence: ['合成补充问诊 PBL-HX-02', '合成胸片及血常规 PBL-BASE-01'], sourceIds: ['nice-ng115'],
    provenance: provenance(['baseline-tests']),
  },
  {
    id: 'cardiac-evidence', kind: 'evidence', title: '心源性支持不足',
    summary: '利钠肽低 · 未见明显结构异常', status: 'complete', statusLabel: '降低支持',
    x: 960, y: 300, introducedAt: 1,
    rationale: '结合临床背景降低心衰可能性；不能把射血分数正常等同于排除所有心衰。',
    details: ['合成结果：NT-proBNP 84 ng/L，心电图窦性心律。', '按临床疑点补充超声：LVEF 63%，未见明显结构或静息舒张功能异常。', '无影像肺淤血；本轮暂止心源性路径，若疑虑持续仍需重评。'],
    evidence: ['合成检查报告 PBL-CARD-01'], sourceIds: ['nice-ng106'],
    provenance: provenance(['cardiac-tests', 'baseline-tests']),
  },
  {
    id: 'repeat-spirometry', kind: 'test', title: '稳定期肺功能复测',
    summary: '验证气流受限是否持续存在', status: 'active', statusLabel: '继续验证',
    x: 1280, y: 0, introducedAt: 2,
    rationale: '对首轮结果进行纵向复核，降低单次测量与生物学变异带来的误判。',
    details: ['在不同日期、临床稳定状态下复测舒张后肺功能。', '复核曲线、可接受性与重复性，不仅比较单个比值。'],
    evidence: ['首轮 FEV₁/FVC 0.62'], sourceIds: ['gold-2026'],
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
    rationale: '由新获得的多痰和反复感染线索提出，不在首轮预设全部假设。',
    details: ['需用定向影像验证是否存在支气管扩张。', '可与其他气道疾病共存，提出该假设不替换已有假设。'],
    evidence: ['痰量较多', '反复下呼吸道感染'], sourceIds: ['nice-ng115'],
    provenance: provenance(['sputum-history']),
    revisions: [{ stageIndex: 3, status: 'ruled-out', statusLabel: '影像不支持', summary: '未见诊断性支气管扩张，终止本轮分支', details: ['定向薄层 CT 未见支气管扩张征象，本轮不再沿该假设追加检查。', '保留触发线索与阴性影像，便于有新证据时追溯。'], evidence: ['薄层 CT 未见支气管扩张'], evidenceIds: ['sputum-history', 'ct-evidence'] }],
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
    details: ['合成薄层 CT：轻度肺气肿征象，未见支气管扩张或间质性肺病征象。', '肺气肿是补充证据，诊断仍依赖临床背景与有质量控制的肺功能。'],
    evidence: ['合成影像报告 PBL-CT-01'], sourceIds: ['nice-ng115'],
    provenance: provenance(['chest-ct']),
  },
  {
    id: 'respiratory-review', kind: 'consultation', title: '呼吸专科 · 诊断复核',
    summary: '汇合肺功能、病史与影像证据', status: 'active', statusLabel: '待医生确认',
    x: 2240, y: 150, introducedAt: 4,
    rationale: '在诊断存在鉴别问题时，医生复核证据质量、时间关系和剩余不确定性。',
    details: ['复核两次肺功能质量及持续气流受限，整合症状和烟草暴露。', '结合纵向记录和病史，当前不支持哮喘作为本轮主导诊断；保留新证据触发重评的可能。', '复核阴性影像与心源性评估，诊断确认权保留给医生。'],
    evidence: ['重复肺功能与纵向峰流速', '症状、暴露及补充病史', '定向影像与心源性评估'],
    sourceIds: ['gold-2026', 'nice-ng115', 'nice-ng106'],
    provenance: provenance(['persistent-obstruction', 'ct-evidence', 'cardiac-evidence', 'presentation']),
    priority: '汇合 · 医生复核', burden: '中等 · 专科评估',
    revisions: [{ stageIndex: 5, status: 'complete', statusLabel: '复核完成', summary: '医生已完成证据复核与诊断确认', details: ['合成医生复核记录 PBL-MD-01：同意当前证据支持慢性阻塞性肺疾病。', '该记录属于演示脚本，不是真实医生签署或临床审批。'], evidence: ['合成医生复核记录 PBL-MD-01'], evidenceIds: ['persistent-obstruction', 'ct-evidence', 'cardiac-evidence', 'presentation'] }],
  },
  {
    id: 'confirmed-diagnosis', kind: 'conclusion', title: '慢性阻塞性肺疾病',
    summary: '综合证据一致 · 医生确认诊断', status: 'confirmed', statusLabel: '诊断确认',
    x: 2560, y: 150, introducedAt: 5,
    rationale: '相符的慢性症状及暴露背景、重复舒张后持续气流受限，以及医生完成的鉴别评估共同支持结论。',
    details: ['最终确认：慢性阻塞性肺疾病。', '本结论只在合成研究病例的最后阶段出现。', '未开启治疗、处方或用药推荐流程。'],
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
  edge('copd', 'spirometry', 0, { label: '共享验证', completeAt: 1 }),
  edge('asthma', 'spirometry', 0, { completeAt: 1, ruledOutAt: 4 }),
  edge('copd', 'baseline-tests', 0, { completeAt: 1 }),
  edge('asthma', 'baseline-tests', 0, { completeAt: 1, ruledOutAt: 4 }),
  edge('heart-failure', 'baseline-tests', 0, { ruledOutAt: 1 }),
  edge('heart-failure', 'cardiac-tests', 0, { ruledOutAt: 1 }),
  edge('spirometry', 'obstruction', 1, { completeAt: 1 }),
  edge('baseline-tests', 'sputum-history', 1, { completeAt: 1 }),
  edge('cardiac-tests', 'cardiac-evidence', 1, { completeAt: 1 }),
  edge('obstruction', 'repeat-spirometry', 2, { label: '验证持续性', completeAt: 3 }),
  edge('obstruction', 'peak-flow', 2, { label: '验证变异性', completeAt: 3 }),
  edge('sputum-history', 'bronchiectasis', 2, { label: '提出新假设', ruledOutAt: 3 }),
  edge('bronchiectasis', 'chest-ct', 2, { label: '定向验证', ruledOutAt: 3 }),
  edge('obstruction', 'chest-ct', 2, { label: '共享影像', completeAt: 3 }),
  edge('repeat-spirometry', 'persistent-obstruction', 3, { completeAt: 3 }),
  edge('peak-flow', 'persistent-obstruction', 3, { completeAt: 3 }),
  edge('chest-ct', 'ct-evidence', 3, { completeAt: 3 }),
  edge('persistent-obstruction', 'respiratory-review', 4, { completeAt: 5 }),
  edge('ct-evidence', 'respiratory-review', 4, { completeAt: 5 }),
  edge('cardiac-evidence', 'respiratory-review', 4, { completeAt: 5 }),
  edge('respiratory-review', 'confirmed-diagnosis', 5, { label: '医生确认', completeAt: 5 }),
];

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
  return {
    stage: structuredClone(workflowStages[index]),
    nodes: nodeDefinitions.filter((node) => node.introducedAt <= index).map((node) => materializeNode(node, index)),
    edges: edgeDefinitions.filter((item) => item.introducedAt <= index).map(({ completeAt, ruledOutAt, ...item }) => ({
      ...item,
      status: ruledOutAt !== undefined && ruledOutAt <= index ? 'ruled-out' : completeAt !== undefined && completeAt <= index ? 'complete' : 'active',
    })),
    provenance: provenance(),
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
