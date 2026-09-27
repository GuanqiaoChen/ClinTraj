import { describe, expect, it } from 'vitest';
import { getWorkflowSnapshot, workflowCase, workflowDecisionRounds, workflowStages } from '../pbl/diagnostic-workflow';
import { getTourFrame, TOUR_CANDIDATES, TOUR_CASE, TOUR_CHAPTERS, TOUR_DURATION_MS, TOUR_EVIDENCE, TOUR_SOURCES, TOUR_STAGE_TIMES, TOUR_TIMING } from './workspace-tour';

describe('PBL-driven synthetic workspace tour', () => {
  it('derives the case, evidence and all three candidates from PBL', () => {
    expect(TOUR_CASE.initialText).toBe(workflowCase.initialText);
    expect(TOUR_CASE.synthetic).toBe(true);
    expect(TOUR_CASE.sessionKind).toBe('synthetic-research');
    workflowDecisionRounds.forEach((round, index) => {
      const snapshot = getWorkflowSnapshot(round.stageIndex);
      expect(TOUR_CANDIDATES[index]).toHaveLength(3);
      TOUR_CANDIDATES[index].forEach((candidate, candidateIndex) => {
        expect(candidate.nodeIds).toEqual(round.candidateNodeGroups[candidateIndex]);
        expect(candidate.title).toBe(round.candidateTitles[candidateIndex]);
        expect(candidate.action).toBe(round.candidateActions[candidateIndex]);
        candidate.nodeIds.forEach(id => expect(snapshot.nodes.some(node => node.id === id)).toBe(true));
        candidate.sourceIds.forEach(id => expect(TOUR_SOURCES.some(source => source.id === id)).toBe(true));
      });
    });
    TOUR_EVIDENCE.forEach(evidence => {
      const frame = getTourFrame(evidence.availableAtMs);
      expect(evidence.provenance.fixtureId).toBe(TOUR_CASE.id);
      expect(evidence.provenance.kind).toBe('synthetic');
      expect(evidence.provenance.evidenceIds).toEqual(evidence.nodeIds);
      evidence.nodeIds.forEach(id => expect(frame.snapshot.nodes.some(node => node.id === id)).toBe(true));
    });
  });

  it('shows both result sets only as drafts and then submitted PBL evidence', () => {
    for (const [start, end, submit, evidenceIndex, stage, report] of [
      [TOUR_TIMING.evidenceInputStart, TOUR_TIMING.evidenceInputEnd, TOUR_TIMING.evidenceSubmitted, 1, 1, 'PBL-SP-01'],
      [TOUR_TIMING.secondEvidenceInputStart, TOUR_TIMING.secondEvidenceInputEnd, TOUR_TIMING.secondEvidenceSubmitted, 2, 3, 'PBL-CT-01'],
    ] as const) {
      expect(JSON.stringify(getTourFrame(start))).not.toContain(report);
      const drafting = getTourFrame(end);
      expect(drafting.evidenceDraft).toBe(TOUR_EVIDENCE[evidenceIndex].text);
      expect(drafting.visibleEvidence).toHaveLength(evidenceIndex);
      expect(JSON.stringify(drafting.snapshot)).not.toContain(report);
      const submitted = getTourFrame(submit);
      expect(submitted.evidenceDraft).toBe('');
      expect(submitted.visibleEvidence).toHaveLength(evidenceIndex + 1);
      expect(submitted.stageIndex).toBe(stage);
      expect(submitted.snapshot).toEqual(getWorkflowSnapshot(stage));
    }
  });

  it('keeps three physician candidates before and after selection in every round', () => {
    [
      [TOUR_TIMING.firstCandidates, TOUR_TIMING.firstSelection, TOUR_TIMING.firstConfirmed],
      [TOUR_TIMING.secondCandidates, TOUR_TIMING.secondSelection, TOUR_TIMING.secondConfirmed],
      [TOUR_TIMING.thirdCandidates, TOUR_TIMING.thirdSelection, TOUR_TIMING.thirdConfirmed],
    ].forEach(([show, select, confirm], index) => {
      expect(getTourFrame(show - 1).candidates).toHaveLength(0);
      for (const at of [show, select, confirm]) expect(getTourFrame(at).candidates).toEqual(TOUR_CANDIDATES[index]);
      expect(getTourFrame(select).selectedCandidateIds).toEqual([`r${index + 1}-1`]);
      expect(getTourFrame(confirm - 1).decisionConfirmed).toBe(false);
      expect(getTourFrame(confirm).decisionConfirmed).toBe(true);
      expect(getTourFrame(confirm).selectedCandidateIds).toHaveLength(workflowDecisionRounds[index].selectedCandidateIndexes.length);
    });
  });

  it('synchronizes every PBL stage, reserves confirmation for the doctor and rewinds deterministically', () => {
    const before = getTourFrame(TOUR_TIMING.firstCandidates);
    TOUR_STAGE_TIMES.forEach((at, index) => expect(getTourFrame(at).stageIndex).toBe(index));
    for (const at of [0, TOUR_TIMING.firstCandidates, TOUR_TIMING.evidenceSubmitted, TOUR_TIMING.secondCandidates, TOUR_TIMING.secondEvidenceSubmitted, TOUR_TIMING.thirdConfirmed - 1]) {
      const frame = getTourFrame(at);
      expect(frame.snapshot.nodes.some(node => node.status === 'confirmed')).toBe(false);
      for (const edge of frame.snapshot.edges) {
        expect(frame.snapshot.nodes.some(node => node.id === edge.source)).toBe(true);
        expect(frame.snapshot.nodes.some(node => node.id === edge.target)).toBe(true);
      }
    }
    expect(getTourFrame(TOUR_TIMING.thirdConfirmed).snapshot.nodes.some(node => node.id === 'confirmed-diagnosis')).toBe(true);
    getTourFrame(TOUR_DURATION_MS);
    expect(getTourFrame(TOUR_TIMING.firstCandidates)).toEqual(before);
    expect(getTourFrame(0).snapshot.nodes).toEqual([]);
    expect(getTourFrame(0).trajectory).toEqual([]);
    expect(getTourFrame(TOUR_TIMING.inputEnd).inputText).toBe(workflowCase.initialText);
  });

  it('finishes six stages with a contiguous timeline and clamps invalid playback positions', () => {
    for (let i = 1; i < TOUR_CHAPTERS.length; i++) expect(TOUR_CHAPTERS[i].startMs).toBe(TOUR_CHAPTERS[i - 1].endMs);
    const completed = getTourFrame(TOUR_DURATION_MS);
    expect(completed.round).toBe(3);
    expect(completed.trajectory.map(node => node.id)).toEqual(workflowStages.map(stage => stage.id));
    expect(completed.summaryVisible && completed.completed).toBe(true);
    expect(getTourFrame(TOUR_DURATION_MS - 1).completed).toBe(false);
    expect(getTourFrame(Infinity)).toEqual(completed);
    expect(getTourFrame(-1)).toEqual(getTourFrame(0));
    expect(getTourFrame(NaN)).toEqual(getTourFrame(0));
  });
});
