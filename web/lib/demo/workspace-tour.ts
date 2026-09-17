/**
 * Authored, deterministic demonstration only. This module never calls the live
 * workspace API and cannot write evidence into a clinical session.
 * All patient details, decisions and results below are synthetic fixture data.
 */

export const TOUR_DURATION_MS = 156_000;

export type TourPhase =
  | 'intake' | 'generate-1' | 'review-1' | 'evidence'
  | 'generate-2' | 'review-2' | 'summary';

export type TourFocusTarget =
  | 'case-input' | 'create-session' | 'generate'
  | 'candidate-1' | 'candidate-2' | 'candidate-3'
  | 'review-note' | 'confirm' | 'evidence-input'
  | 'evidence-submit' | 'trajectory' | 'summary';

export interface TourChapter {
  id: TourPhase;
  title: string;
  shortTitle: string;
  startMs: number;
  endMs: number;
}

export const TOUR_CHAPTERS: readonly TourChapter[] = [
  { id: 'intake', title: '输入患者信息', shortTitle: '病例输入', startMs: 0, endMs: 26_000 },
  { id: 'generate-1', title: '生成第一轮决策', shortTitle: '决策生成', startMs: 26_000, endMs: 44_000 },
  { id: 'review-1', title: '医生审核与选择', shortTitle: '医生选择', startMs: 44_000, endMs: 68_000 },
  { id: 'evidence', title: '录入新的临床证据', shortTitle: '证据录入', startMs: 68_000, endMs: 99_000 },
  { id: 'generate-2', title: '根据新证据重新生成', shortTitle: '再次生成', startMs: 99_000, endMs: 115_000 },
  { id: 'review-2', title: '确认下一步处置', shortTitle: '再次选择', startMs: 115_000, endMs: 141_000 },
  { id: 'summary', title: '回看完整决策轨迹', shortTitle: '完整轨迹', startMs: 141_000, endMs: TOUR_DURATION_MS },
];

export const TOUR_TIMING = {
  inputStart: 4_000,
  inputEnd: 21_500,
  sessionCreated: 24_000,
  firstGenerationStart: 26_000,
  firstCandidates: 44_000,
  firstSelection: 50_000,
  firstAdditionalSelection: 56_000,
  firstNoteStart: 57_000,
  firstNoteEnd: 62_000,
  firstConfirmed: 64_000,
  evidenceInputStart: 74_000,
  evidenceInputEnd: 91_000,
  evidenceSubmitted: 94_000,
  secondGenerationStart: 99_000,
  secondCandidates: 115_000,
  secondSelection: 122_000,
  secondAdditionalSelection: 127_000,
  secondNoteStart: 129_000,
  secondNoteEnd: 136_000,
  secondConfirmed: 139_000,
  summary: 141_000,
} as const;

export const TOUR_CASE = {
  id: 'synthetic-copd-workspace-tour-v1',
  title: '慢阻肺急性加重 · 合成病例 01',
  patientLabel: '合成患者 · 男 · 68 岁',
  problem: '气促加重 3 天，伴咳嗽、咳痰增多',
  synthetic: true as const,
  sessionKind: 'synthetic-research' as const,
  provenance: 'ClinTraj 原创合成演示脚本 v1 · 未使用真实患者资料',
  description: '一次从患者信息输入到证据更新的医生工作台使用体验。',
  notice: '预设流程演示 · 全部患者信息与结果均为合成数据 · 不调用模型，不生成真实医嘱',
  initialText: '【合成病例】男性，68 岁。既往经肺功能确诊慢阻肺，吸烟 40 包年，已戒烟。近 3 天气促、咳嗽和咳痰增加，今天日常活动明显受限。\n到院：意识清楚，呼吸 28 次/分，心率 106 次/分，血压 136/78 mmHg，室内空气 SpO₂ 86%，双肺呼气相哮鸣音。\n当前尚无本次血气和胸部影像结果。请结合已知信息，协助制定初始评估与处置计划。',
  initialVitals: [
    { label: '室内空气 SpO₂', value: '86%', tone: 'attention' },
    { label: '呼吸频率', value: '28 次/分', tone: 'attention' },
    { label: '心率', value: '106 次/分', tone: 'neutral' },
    { label: '意识', value: '清楚', tone: 'neutral' },
  ],
  updatedVitals: [
    { label: '受控氧疗 SpO₂', value: '90%', tone: 'neutral' },
    { label: '复查 pH', value: '7.29', tone: 'attention' },
    { label: '复查 PaCO₂', value: '67 mmHg', tone: 'attention' },
    { label: '意识', value: '清楚、可配合', tone: 'neutral' },
  ],
};

export interface TourSource {
  id: string;
  title: string;
  url: string;
  note: string;
}

/** Public references inform the authored narrative; these are not live retrieval results. */
export const TOUR_SOURCES: readonly TourSource[] = [
  {
    id: 'nice-ng115',
    title: 'NICE NG115 · 慢阻肺诊断与管理',
    url: 'https://www.nice.org.uk/guidance/ng115/chapter/Recommendations',
    note: '住院急性加重的血气评估、初始治疗及持续高碳酸血症时的无创通气；条目 1.3.29–1.3.31。',
  },
  {
    id: 'nice-qs10',
    title: 'NICE QS10 · 急性加重时的氧疗',
    url: 'https://www.nice.org.uk/guidance/qs10/chapter/Quality-statement-6-Emergency-oxygen-during-an-exacerbation',
    note: '急性加重需紧急氧疗时，采用受控氧疗，目标氧饱和度 88%–92%。',
  },
  {
    id: 'nice-ng114',
    title: 'NICE NG114 · 急性加重的抗菌药物决策',
    url: 'https://www.nice.org.uk/guidance/ng114/chapter/Recommendations',
    note: '是否使用抗菌药物应结合症状、痰液改变、严重程度及个体情况评估。',
  },
];

export interface TourCandidate {
  id: string;
  title: string;
  action: string;
  rationale: string;
  sourceIds: readonly string[];
  tags: readonly string[];
}

/** Three physician-visible options per round, with no automated exclusion. */
export const TOUR_CANDIDATES: Readonly<Record<1 | 2, readonly TourCandidate[]>> = {
  1: [
    {
      id: 'r1-a',
      title: '受控氧疗与初始治疗',
      action: '由医生启动受控氧疗，目标 SpO₂ 88%–92%；评估并实施短效支气管扩张及短程全身糖皮质激素治疗，持续监测。',
      rationale: '当前存在低氧和明显气促，应立即处理，并根据血气与临床反应调整。',
      sourceIds: ['nice-qs10', 'nice-ng115'],
      tags: ['初始处置', '持续监测'],
    },
    {
      id: 'r1-b',
      title: '完善血气与胸部影像',
      action: '尽快获取动脉血气，记录吸氧条件；完善胸片及必要检查，并评估肺炎、气胸、心衰等其他原因。',
      rationale: 'SpO₂ 不能代替对二氧化碳和酸碱状态的评估，检查与初始治疗可同步进行。',
      sourceIds: ['nice-ng115'],
      tags: ['检查评估', '可并行选择'],
    },
    {
      id: 'r1-c',
      title: '补充诱因与用药史',
      action: '进一步询问痰色与痰量变化、近期感染接触、吸入药使用和依从性，并结合整体情况评估抗感染治疗。',
      rationale: '补齐诱因和用药信息，有助于完善处置；紧急评估与治疗同时推进。',
      sourceIds: ['nice-ng114'],
      tags: ['病史补充', '诱因评估'],
    },
  ],
  2: [
    {
      id: 'r2-a',
      title: '评估并启动无创通气',
      action: '由具备经验的团队评估禁忌证与配合情况，在具备监护能力的区域实施无创通气，并安排血气复查。',
      rationale: '合成复查结果提示初始治疗后仍存在高碳酸血症与酸中毒，需要升级呼吸支持。',
      sourceIds: ['nice-ng115'],
      tags: ['呼吸支持', '医生确认'],
    },
    {
      id: 'r2-b',
      title: '呼吸团队共同制定升级计划',
      action: '请呼吸或重症团队共同评估，明确监测、复查与通气失败后的升级路径，并与患者沟通。',
      rationale: '当前需要密切观察治疗反应；会诊与呼吸支持可以同步执行。',
      sourceIds: ['nice-ng115'],
      tags: ['团队协作', '可并行选择'],
    },
    {
      id: 'r2-c',
      title: '继续评估感染与其他诱因',
      action: '结合痰液变化、炎症指标和影像复核诱因及抗菌药物需求；持续优化已开始的基础治疗。',
      rationale: '胸片未见明确新发实变不能单独排除感染，应结合完整病情判断。',
      sourceIds: ['nice-ng114'],
      tags: ['病因评估', '持续治疗'],
    },
  ],
};

export interface TourEvidence {
  id: string;
  title: string;
  text: string;
  availableAtMs: number;
  synthetic: true;
  provenance: {
    scenarioId: string;
    source: 'authored-synthetic-fixture';
    fixtureId: string;
    parentEvidenceIds: readonly string[];
    parentDecisionIds: readonly string[];
    label: string;
  };
}

export const TOUR_EVIDENCE: readonly TourEvidence[] = [
  {
    id: 'synthetic-e1',
    title: '到院病史与查体',
    text: TOUR_CASE.initialText,
    availableAtMs: TOUR_TIMING.sessionCreated,
    synthetic: true,
    provenance: {
      scenarioId: TOUR_CASE.id,
      source: 'authored-synthetic-fixture',
      fixtureId: 'copd-tour-v1-intake',
      parentEvidenceIds: [],
      parentDecisionIds: [],
      label: '合成初始资料 · 脚本输入',
    },
  },
  {
    id: 'synthetic-e2',
    title: '初始治疗后的合成复查结果',
    text: '【合成复查证据｜临床时间 +1 小时】\n已按医生确认方案实施受控氧疗及初始药物治疗。SpO₂ 90%，仍有呼吸费力，意识清楚、可配合。\n首份血气 pH 7.30、PaCO₂ 65 mmHg；治疗 1 小时后复查 pH 7.29、PaCO₂ 67 mmHg（采样时受控氧疗，FiO₂ 约 28%）。胸片未见明确新发实变或气胸。\n以上数值与结果为本演示原创合成数据，关联首轮已确认决策。',
    availableAtMs: TOUR_TIMING.evidenceSubmitted,
    synthetic: true,
    provenance: {
      scenarioId: TOUR_CASE.id,
      source: 'authored-synthetic-fixture',
      fixtureId: 'copd-tour-v1-reassessment',
      parentEvidenceIds: ['synthetic-e1'],
      parentDecisionIds: ['decision-r1'],
      label: '合成复查资料 · 关联首轮医生确认',
    },
  },
];

export const TOUR_REVIEW_NOTES = {
  1: '选择前两项并行：先处理低氧与气道症状，同时完善血气和影像，再结合结果复评。',
  2: '选择无创通气评估与团队协作并行，持续监测并明确复查和升级路径；后续仍由医生根据反应决策。',
} as const;

export interface TourTrajectoryNode {
  id: string;
  title: string;
  detail: string;
  kind: 'input' | 'decision' | 'evidence';
  atMs: number;
  parentIds: readonly string[];
}

const TRAJECTORY: readonly TourTrajectoryNode[] = [
  { id: 'intake', title: '初始评估', detail: '录入合成病史、查体与未知信息', kind: 'input', atMs: TOUR_TIMING.sessionCreated, parentIds: [] },
  { id: 'decision-r1', title: '首轮医生确认', detail: '初始处置 + 血气与影像评估', kind: 'decision', atMs: TOUR_TIMING.firstConfirmed, parentIds: ['intake'] },
  { id: 'evidence-r2', title: '复查证据录入', detail: '合成血气与治疗反应进入当前上下文', kind: 'evidence', atMs: TOUR_TIMING.evidenceSubmitted, parentIds: ['decision-r1'] },
  { id: 'decision-r2', title: '二轮医生确认', detail: '无创通气评估 + 团队协作与升级计划', kind: 'decision', atMs: TOUR_TIMING.secondConfirmed, parentIds: ['evidence-r2'] },
];

export interface TourGenerationStep {
  id: string;
  label: string;
  status: 'waiting' | 'active' | 'completed';
}

export interface TourFrame {
  timeMs: number;
  progress: number;
  chapterIndex: number;
  chapter: TourChapter;
  phase: TourPhase;
  round: 1 | 2;
  sessionCreated: boolean;
  inputText: string;
  inputProgress: number;
  evidenceDraft: string;
  evidenceInputProgress: number;
  visibleEvidence: readonly TourEvidence[];
  candidates: readonly TourCandidate[];
  selectedCandidateIds: readonly string[];
  generationProgress: number;
  generationSteps: readonly TourGenerationStep[];
  isGenerating: boolean;
  decisionConfirmed: boolean;
  reviewNote: string;
  activeCandidateId: string | null;
  trajectory: readonly TourTrajectoryNode[];
  caption: string;
  coachTitle: string;
  coachDetail: string;
  focusTarget: TourFocusTarget;
  completed: boolean;
  summaryVisible: boolean;
  statusLabel: string;
}

interface TourCue {
  atMs: number;
  title: string;
  detail: string;
  caption: string;
  focus: TourFocusTarget;
}

const CUES: readonly TourCue[] = [
  { atMs: 0, title: '从一次真实的工作流程开始', detail: '这是一位完全虚构的慢阻肺患者。跟随医生完成输入、选择、复查与再决策。', caption: '接下来，用一个中文合成病例，完整体验医生工作台。', focus: 'case-input' },
  { atMs: 4_000, title: '输入当前已经掌握的信息', detail: '主诉、既往史、查体和仍未知的结果，构成这一轮的决策起点。', caption: '医生输入患者信息，并明确：本次血气与胸部影像结果尚未知。', focus: 'case-input' },
  { atMs: 21_500, title: '创建合成研究会话', detail: '确认数据类型后，信息进入独立的合成会话。', caption: '选择“本会话只包含合成数据”，创建会话。', focus: 'create-session' },
  { atMs: 26_000, title: '基于当前信息生成候选', detail: '这里按预设脚本展示生成过程。此时只有到院资料可用。', caption: '点击生成，工作台整理当前问题，形成三个供医生审核的候选方案。', focus: 'generate' },
  { atMs: 44_000, title: '三条路径，交给医生判断', detail: '可以查看方案、理由和公开知识来源，也可以选择多项并行。', caption: '三个候选完整呈现：初始处置、完善检查、补充病史。', focus: 'candidate-1' },
  { atMs: 50_000, title: '先选择初始处置', detail: '医生将受控氧疗和初始治疗纳入计划。勾选并不等于已经确认执行。', caption: '医生先勾选“受控氧疗与初始治疗”。', focus: 'candidate-1' },
  { atMs: 56_000, title: '同时选择必要检查', detail: '处理低氧与补齐血气、影像信息可以同步进行。', caption: '再勾选“完善血气与胸部影像”，形成并行方案。', focus: 'candidate-2' },
  { atMs: 57_000, title: '记录医生的决策依据', detail: '选择什么、为什么选择，由医生明确记录。', caption: '医生补充审核意见：先处理当前问题，同时完善检查，再结合结果复评。', focus: 'review-note' },
  { atMs: 62_000, title: '由医生确认这一轮决策', detail: '完整保留三候选，同时记录最终采用的两项方案。', caption: '点击确认，已选择的方案及审核意见成为轨迹的一部分。', focus: 'confirm' },
  { atMs: 64_000, title: '首轮决策已记录', detail: '轨迹新增医生确认节点。临床处置由医生完成，演示不会下达医嘱。', caption: '第一轮完成：原始信息、候选方案和医生判断都有记录。', focus: 'trajectory' },
  { atMs: 68_000, title: '进入临床复评时点', detail: '演示时间与临床时间不同。下一幕代表初始治疗约 1 小时后的复评。', caption: '临床时间推进约 1 小时，医生拿到了新的检查与复评信息。', focus: 'evidence-input' },
  { atMs: 74_000, title: '输入新的证据', detail: '结果标记为合成，并关联首轮医生已确认决策；提交前仍属于输入草稿。', caption: '医生录入合成血气、胸片和治疗反应，形成新证据草稿。', focus: 'evidence-input' },
  { atMs: 91_000, title: '提交证据，更新当前上下文', detail: '只有提交后的证据会进入患者当前状态，供下一轮生成使用。', caption: '点击录入证据，将复查结果加入当前会话。', focus: 'evidence-submit' },
  { atMs: 94_000, title: '新证据已进入会话', detail: '当前可用证据由 1 条变为 2 条，并在轨迹中留下来源关联。', caption: '现在，工作台同时看见最初资料与治疗后的复查结果。', focus: 'trajectory' },
  { atMs: 99_000, title: '用新证据重新生成', detail: '下一轮基于已更新的患者状态，重新形成三个候选方案。', caption: '复查仍提示高碳酸血症与酸中毒，工作台重新生成下一步候选。', focus: 'generate' },
  { atMs: 115_000, title: '查看新的三个候选', detail: '候选随证据变化，最终采用哪些方案仍由医生审核决定。', caption: '新一轮显示呼吸支持、团队协作和诱因评估三条候选路径。', focus: 'candidate-1' },
  { atMs: 122_000, title: '选择升级呼吸支持', detail: '医生选择由具备经验的团队评估并启动无创通气。', caption: '医生勾选无创通气评估方案。', focus: 'candidate-1' },
  { atMs: 127_000, title: '纳入团队协作与升级计划', detail: '在密切监测下明确复查、会诊与进一步升级路径。', caption: '同时勾选团队协作，明确监测与升级计划。', focus: 'candidate-2' },
  { atMs: 129_000, title: '写下这一轮审核意见', detail: '把决策理由和后续观察重点留在同一条临床轨迹中。', caption: '医生记录第二轮意见，并保留后续根据治疗反应调整的空间。', focus: 'review-note' },
  { atMs: 136_000, title: '确认下一步计划', detail: '第二次确认将选择与当前证据关联，延续同一合成会话。', caption: '医生确认下一步计划。', focus: 'confirm' },
  { atMs: 139_000, title: '第二轮决策已记录', detail: '从初始问题到证据更新，再到重新决策，形成连续的记录。', caption: '第二轮完成，临床轨迹向前延伸。', focus: 'trajectory' },
  { atMs: 141_000, title: '一次完整的工作台体验', detail: '病例输入 → 三候选生成 → 医生选择 → 新证据录入 → 再次生成与确认。可以拖动时间轴，或从头重播。', caption: '这就是 ClinTraj：让信息、证据与医生的每一次选择，沿时间连续记录。', focus: 'summary' },
];

function progressBetween(timeMs: number, startMs: number, endMs: number): number {
  return Math.min(1, Math.max(0, (timeMs - startMs) / (endMs - startMs)));
}

function typedText(text: string, progress: number): string {
  // Array.from keeps a surrogate pair intact when a future script adds emoji.
  const characters = Array.from(text);
  return characters.slice(0, Math.floor(characters.length * progress)).join('');
}

/** Derive a full frame from a clock, with no timers, I/O, randomness or mutable replay state. */
export function getTourFrame(requestedTimeMs: number): TourFrame {
  const timeMs = Number.isNaN(requestedTimeMs)
    ? 0
    : Math.min(TOUR_DURATION_MS, Math.max(0, requestedTimeMs));
  const chapterIndex = Math.max(0, TOUR_CHAPTERS.findLastIndex(chapter => timeMs >= chapter.startMs));
  const chapter = TOUR_CHAPTERS[chapterIndex];
  const cue = CUES.findLast(item => timeMs >= item.atMs) ?? CUES[0];
  const round = timeMs >= TOUR_TIMING.secondGenerationStart ? 2 : 1;
  const generationStart = round === 1 ? TOUR_TIMING.firstGenerationStart : TOUR_TIMING.secondGenerationStart;
  const candidatesAt = round === 1 ? TOUR_TIMING.firstCandidates : TOUR_TIMING.secondCandidates;
  const confirmedAt = round === 1 ? TOUR_TIMING.firstConfirmed : TOUR_TIMING.secondConfirmed;
  const selectedAt = round === 1 ? TOUR_TIMING.firstSelection : TOUR_TIMING.secondSelection;
  const additionalSelectedAt = round === 1 ? TOUR_TIMING.firstAdditionalSelection : TOUR_TIMING.secondAdditionalSelection;
  const noteStart = round === 1 ? TOUR_TIMING.firstNoteStart : TOUR_TIMING.secondNoteStart;
  const noteEnd = round === 1 ? TOUR_TIMING.firstNoteEnd : TOUR_TIMING.secondNoteEnd;
  const generationProgress = progressBetween(timeMs, generationStart, candidatesAt);
  const candidates = timeMs >= candidatesAt ? TOUR_CANDIDATES[round] : [];
  const selectedCandidateIds = [
    ...(timeMs >= selectedAt ? [`r${round}-a`] : []),
    ...(timeMs >= additionalSelectedAt ? [`r${round}-b`] : []),
  ];
  const inputProgress = progressBetween(timeMs, TOUR_TIMING.inputStart, TOUR_TIMING.inputEnd);
  const evidenceInputProgress = progressBetween(timeMs, TOUR_TIMING.evidenceInputStart, TOUR_TIMING.evidenceInputEnd);
  const isGenerating = timeMs >= generationStart && timeMs < candidatesAt;
  const decisionConfirmed = timeMs >= confirmedAt;
  const generationLabels = ['整理已提交信息', '识别当前临床问题', '关联公开知识摘要', '形成三个候选方案'];
  const generationSteps = generationLabels.map((label, index): TourGenerationStep => ({
    id: `generation-${index + 1}`,
    label,
    status: generationProgress >= (index + 1) / generationLabels.length
      ? 'completed'
      : timeMs >= generationStart && generationProgress >= index / generationLabels.length ? 'active' : 'waiting',
  }));

  return {
    timeMs,
    progress: timeMs / TOUR_DURATION_MS,
    chapterIndex,
    chapter,
    phase: chapter.id,
    round,
    sessionCreated: timeMs >= TOUR_TIMING.sessionCreated,
    inputText: typedText(TOUR_CASE.initialText, inputProgress),
    inputProgress,
    evidenceDraft: timeMs < TOUR_TIMING.evidenceSubmitted ? typedText(TOUR_EVIDENCE[1].text, evidenceInputProgress) : '',
    evidenceInputProgress,
    visibleEvidence: TOUR_EVIDENCE.filter(evidence => timeMs >= evidence.availableAtMs),
    candidates,
    selectedCandidateIds,
    generationProgress,
    generationSteps,
    isGenerating,
    decisionConfirmed,
    reviewNote: typedText(TOUR_REVIEW_NOTES[round], progressBetween(timeMs, noteStart, noteEnd)),
    activeCandidateId: candidates.length && cue.focus.startsWith('candidate-')
      ? candidates[Number(cue.focus.slice(-1)) - 1].id : null,
    trajectory: TRAJECTORY.filter(node => timeMs >= node.atMs),
    caption: cue.caption,
    coachTitle: cue.title,
    coachDetail: cue.detail,
    focusTarget: cue.focus,
    completed: timeMs >= TOUR_DURATION_MS,
    summaryVisible: timeMs >= TOUR_TIMING.summary,
    statusLabel: timeMs < TOUR_TIMING.sessionCreated ? '正在录入'
      : isGenerating ? '正在生成'
        : decisionConfirmed ? '医生已确认'
          : candidates.length ? '等待医生审核' : '准备生成',
  };
}
