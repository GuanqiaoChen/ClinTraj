/** Clock-only choreography over the PBL fixture. No clinical script or live I/O. */
import {
  getWorkflowSnapshot, workflowCase, workflowDecisionRounds, workflowProvenance,
  workflowSources, workflowStages, type WorkflowNode,
} from '../pbl/diagnostic-workflow';

export const TOUR_DURATION_MS = 232_000;
export const TOUR_TIMING = {
  inputStart: 3_000, inputEnd: 20_000, sessionCreated: 22_000,
  firstGenerationStart: 24_000, firstCandidates: 42_000,
  firstSelection: 48_000, firstAdditionalSelection: 52_000, firstFinalSelection: 56_000,
  firstNoteStart: 57_000, firstNoteEnd: 61_000, firstConfirmed: 63_000,
  evidenceInputStart: 70_000, evidenceInputEnd: 84_000, evidenceSubmitted: 86_000,
  secondGenerationStart: 91_000, secondCandidates: 108_000,
  secondSelection: 114_000, secondAdditionalSelection: 118_000, secondFinalSelection: 122_000,
  secondNoteStart: 123_000, secondNoteEnd: 128_000, secondConfirmed: 130_000,
  secondEvidenceInputStart: 136_000, secondEvidenceInputEnd: 151_000, secondEvidenceSubmitted: 154_000,
  thirdGenerationStart: 160_000, thirdCandidates: 176_000,
  thirdSelection: 184_000, thirdAdditionalSelection: 190_000, thirdFinalSelection: 193_000,
  thirdNoteStart: 194_000, thirdNoteEnd: 201_000, thirdConfirmed: 204_000,
  summary: 218_000,
} as const;

export type TourPhase = 'intake' | 'generate-1' | 'review-1' | 'evidence-1' | 'generate-2' | 'review-2' | 'evidence-2' | 'generate-3' | 'review-3' | 'confirmation' | 'summary';
export type TourFocusTarget = 'case-input' | 'create-session' | 'generate' | 'candidate-1' | 'candidate-2' | 'candidate-3' | 'review-note' | 'confirm' | 'evidence-input' | 'evidence-submit' | 'trajectory' | 'summary';
export interface TourChapter { id: TourPhase; title: string; shortTitle: string; startMs: number; endMs: number }

const chapterDefinitions: [TourPhase, string, number][] = [
  ['intake', '患者输入', 0], ['generate-1', '全面假设', 24_000], ['review-1', '首轮选择', 42_000],
  ['evidence-1', '初检证据', 65_000], ['generate-2', '定向验证', 91_000], ['review-2', '再次选择', 108_000],
  ['evidence-2', '复测证据', 132_000], ['generate-3', '综合复核', 160_000], ['review-3', '医生审核', 176_000],
  ['confirmation', '诊断确认', 204_000], ['summary', '完整轨迹', 218_000],
];
export const TOUR_CHAPTERS: readonly TourChapter[] = chapterDefinitions.map(([id, title, startMs], index) => ({ id, title, shortTitle: title, startMs, endMs: chapterDefinitions[index + 1]?.[2] ?? TOUR_DURATION_MS }));
export const TOUR_CASE = {
  ...workflowCase, id: workflowProvenance.fixtureId, synthetic: true as const,
  sessionKind: workflowProvenance.sessionKind, provenance: workflowProvenance,
};
export const TOUR_SOURCES = workflowSources;
export const TOUR_STAGE_TIMES = [24_000, 86_000, 91_000, 154_000, 160_000, 204_000] as const;

const roundTimings = [
  { start: 24_000, candidates: 42_000, selections: [48_000, 52_000, 56_000], noteStart: 57_000, noteEnd: 61_000, confirmed: 63_000 },
  { start: 91_000, candidates: 108_000, selections: [114_000, 118_000, 122_000], noteStart: 123_000, noteEnd: 128_000, confirmed: 130_000 },
  { start: 160_000, candidates: 176_000, selections: [184_000, 190_000, 193_000], noteStart: 194_000, noteEnd: 201_000, confirmed: 204_000 },
] as const;

export interface TourCandidate {
  id: string; title: string; action: string; rationale: string;
  sourceIds: string[]; tags: string[]; nodeIds: string[];
}

/** Candidate group membership and review choices are authored by PBL, not by the player. */
export const TOUR_CANDIDATES: readonly TourCandidate[][] = workflowDecisionRounds.map((round, index) => {
  const snapshot = getWorkflowSnapshot(round.stageIndex);
  return round.candidateNodeGroups.map((ids, candidateIndex) => {
    const nodes = ids.map(id => snapshot.nodes.find(node => node.id === id)!);
    return {
      id: `r${index + 1}-${candidateIndex + 1}`, nodeIds: ids,
      title: round.candidateTitles[candidateIndex],
      action: round.candidateActions[candidateIndex],
      rationale: nodes.map(node => node.rationale).join(' '),
      sourceIds: [...new Set(nodes.flatMap(node => node.sourceIds))],
      tags: [...new Set(nodes.flatMap(node => node.priority ? [node.priority] : [node.statusLabel]))],
    };
  });
});

export interface TourEvidence {
  id: string; title: string; text: string; nodeIds: string[]; availableAtMs: number;
  provenance: typeof workflowProvenance; synthetic: true;
}
function evidenceAt(stageIndex: number, availableAtMs: number): TourEvidence {
  const snapshot = getWorkflowSnapshot(stageIndex);
  const nodes = snapshot.nodes.filter(node => node.kind === 'evidence' && node.introducedAt === stageIndex);
  return {
    id: `pbl-evidence-${stageIndex}`, title: stageIndex === 0 ? nodes[0].title : snapshot.stage.title,
    text: stageIndex === 0 ? workflowCase.initialText : nodes.map(node => `${node.title}：${node.details.join(' ')}`).join('\n'),
    nodeIds: nodes.map(node => node.id), availableAtMs, synthetic: true,
    provenance: { ...snapshot.provenance, evidenceIds: nodes.map(node => node.id) },
  };
}
export const TOUR_EVIDENCE = [evidenceAt(0, 22_000), evidenceAt(1, 86_000), evidenceAt(3, 154_000)];

const evidenceTimings = [
  { phase: 'evidence-1', draftStart: 70_000, draftEnd: 84_000, submitted: 86_000, index: 1 },
  { phase: 'evidence-2', draftStart: 136_000, draftEnd: 151_000, submitted: 154_000, index: 2 },
] as const;
const generationLabels = ['整理当前可用证据', '逐项复核各类病因', '比较信息价值与检查负担', '形成三个医生候选'];

function progressBetween(time: number, start: number, end: number) { return Math.min(1, Math.max(0, (time - start) / (end - start))); }
function typedText(text: string, progress: number) { return Array.from(text).slice(0, Math.floor(Array.from(text).length * progress)).join(''); }

/** Each clock position rebuilds a stage-local view; rewind never retains future evidence. */
export function getTourFrame(requestedTimeMs: number) {
  const timeMs = Number.isNaN(requestedTimeMs) ? 0 : Math.min(TOUR_DURATION_MS, Math.max(0, requestedTimeMs));
  const chapterIndex = Math.max(0, TOUR_CHAPTERS.findLastIndex(chapter => timeMs >= chapter.startMs));
  const chapter = TOUR_CHAPTERS[chapterIndex];
  const roundIndex = Math.max(0, roundTimings.findLastIndex(round => timeMs >= round.start));
  const roundTiming = roundTimings[roundIndex];
  const roundDefinition = workflowDecisionRounds[roundIndex];
  const stageIndex = Math.max(0, TOUR_STAGE_TIMES.findLastIndex(at => timeMs >= at));
  const stageSnapshot = getWorkflowSnapshot(stageIndex);
  const sessionCreated = timeMs >= TOUR_TIMING.sessionCreated;
  const isGenerating = timeMs >= roundTiming.start && timeMs < roundTiming.candidates;
  const generationProgress = progressBetween(timeMs, roundTiming.start, roundTiming.candidates);
  // Keep the initial PBL plan out of the empty intake, then reveal hypotheses before tests.
  const nodes = stageSnapshot.nodes.filter(node => sessionCreated && (
    node.id === 'presentation' || timeMs >= TOUR_TIMING.firstCandidates ||
    (isGenerating && generationProgress >= (node.kind === 'hypothesis' ? .18 : .72))
  ));
  const nodeIds = new Set(nodes.map(node => node.id));
  const snapshot = { ...stageSnapshot, nodes, edges: stageSnapshot.edges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target)), vindicatedReview: timeMs >= TOUR_TIMING.firstGenerationStart ? stageSnapshot.vindicatedReview.map(row => ({ ...row, nodeIds: row.nodeIds.filter(id => nodeIds.has(id)) })) : [] };
  const candidates = timeMs >= roundTiming.candidates ? TOUR_CANDIDATES[roundIndex] : [];
  const selectedCandidateIds = roundDefinition.selectedCandidateIndexes.filter((_, index) => timeMs >= roundTiming.selections[index]).map(index => TOUR_CANDIDATES[roundIndex][index].id);
  const decisionConfirmed = timeMs >= roundTiming.confirmed;
  const evidenceTiming = evidenceTimings.find(timing => timing.phase === chapter.id);
  const evidenceInputProgress = evidenceTiming ? progressBetween(timeMs, evidenceTiming.draftStart, evidenceTiming.draftEnd) : 0;
  const evidenceSubmitted = Boolean(evidenceTiming && timeMs >= evidenceTiming.submitted);
  const inputProgress = progressBetween(timeMs, TOUR_TIMING.inputStart, TOUR_TIMING.inputEnd);
  const generationSteps = generationLabels.map((label, index) => ({
    id: `generation-${index + 1}`, label,
    status: generationProgress >= (index + 1) / generationLabels.length ? 'completed' : isGenerating && generationProgress >= index / generationLabels.length ? 'active' : 'waiting',
  }));
  let focusTarget: TourFocusTarget = 'case-input';
  if (timeMs >= TOUR_TIMING.inputEnd) focusTarget = 'create-session';
  if (isGenerating) focusTarget = 'generate';
  if (candidates.length) {
    focusTarget = 'candidate-1';
    if (timeMs >= roundTiming.selections[1]) focusTarget = 'candidate-2';
    if (timeMs >= roundTiming.selections[2]) focusTarget = 'candidate-3';
    if (timeMs >= roundTiming.noteStart) focusTarget = 'review-note';
    if (timeMs >= roundTiming.noteEnd) focusTarget = 'confirm';
    if (decisionConfirmed) focusTarget = 'trajectory';
  }
  if (evidenceTiming) focusTarget = evidenceSubmitted ? 'trajectory' : evidenceInputProgress >= 1 ? 'evidence-submit' : 'evidence-input';
  if (timeMs >= TOUR_TIMING.summary) focusTarget = 'summary';
  const activeCandidateId = focusTarget.startsWith('candidate-') ? candidates[Number(focusTarget.slice(-1)) - 1]?.id ?? null : null;
  const activeCandidate = candidates.find(candidate => candidate.id === activeCandidateId);
  const focusedNodes = nodes.filter(node => snapshot.stage.focusNodeIds.includes(node.id));
  const latestNodes = focusedNodes.length ? focusedNodes : nodes;
  const defaultNodeId = activeCandidate?.nodeIds[0] ?? [...latestNodes].sort((a, b) => a.x - b.x || a.y - b.y)[0]?.id ?? null;
  const trajectory = workflowStages.filter(stage => timeMs >= TOUR_STAGE_TIMES[stage.index]).map(stage => ({
    id: stage.id, title: stage.title, detail: stage.summary, atMs: TOUR_STAGE_TIMES[stage.index],
  }));
  const caption = !sessionCreated ? '录入此刻已知的症状和病史，建立独立的合成研究会话。'
    : isGenerating ? snapshot.stage.summary
      : evidenceTiming ? evidenceSubmitted ? snapshot.stage.summary : '医生录入本轮新获得的结果；提交后，证据进入工作台与 PBL 路径。'
        : decisionConfirmed ? snapshot.stage.summary
          : activeCandidate ? `${activeCandidate.title}：${activeCandidate.action}`
            : timeMs >= roundTiming.noteStart ? roundDefinition.reviewNote : snapshot.stage.summary;
  return {
    timeMs, progress: timeMs / TOUR_DURATION_MS, chapterIndex, chapter, phase: chapter.id,
    round: roundIndex + 1, stageIndex, snapshot, sessionCreated,
    inputText: typedText(TOUR_CASE.initialText, inputProgress), inputProgress,
    evidenceDraft: evidenceTiming && !evidenceSubmitted ? typedText(TOUR_EVIDENCE[evidenceTiming.index].text, evidenceInputProgress) : '',
    evidenceInputProgress, evidenceSubmitted, enteringEvidence: Boolean(evidenceTiming),
    visibleEvidence: TOUR_EVIDENCE.filter(evidence => timeMs >= evidence.availableAtMs),
    candidates, selectedCandidateIds, generationProgress, generationSteps, isGenerating, decisionConfirmed,
    reviewNote: typedText(roundDefinition.reviewNote, progressBetween(timeMs, roundTiming.noteStart, roundTiming.noteEnd)),
    activeCandidateId, defaultNodeId, trajectory, caption, coachTitle: chapter.title, focusTarget,
    completed: timeMs >= TOUR_DURATION_MS, summaryVisible: timeMs >= TOUR_TIMING.summary,
    statusLabel: !sessionCreated ? '正在录入' : isGenerating ? '智能体正在思考' : evidenceTiming && !evidenceSubmitted ? '录入新证据' : decisionConfirmed ? '医生已确认' : candidates.length ? '等待医生审核' : '准备生成',
  };
}

export type TourFrame = ReturnType<typeof getTourFrame>;
export type TourPblNode = WorkflowNode;
