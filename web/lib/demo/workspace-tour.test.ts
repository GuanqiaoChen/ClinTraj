import { describe, expect, it } from 'vitest';
import {
  getTourFrame,
  TOUR_CANDIDATES,
  TOUR_CASE,
  TOUR_CHAPTERS,
  TOUR_DURATION_MS,
  TOUR_EVIDENCE,
  TOUR_SOURCES,
  TOUR_TIMING,
} from './workspace-tour';

describe('synthetic COPD workspace tour', () => {
  it('reconstructs the same frame when seeking backward or replaying', () => {
    const opening = getTourFrame(0);
    const firstReview = getTourFrame(58_500);
    getTourFrame(TOUR_DURATION_MS);
    getTourFrame(101_500);
    expect(getTourFrame(58_500)).toEqual(firstReview);
    expect(getTourFrame(0)).toEqual(opening);
    expect(opening.trajectory).toEqual([]);
    expect(opening.selectedCandidateIds).toEqual([]);
    expect(opening.inputText).toBe('');
    expect(getTourFrame(TOUR_TIMING.inputEnd).inputText).toBe(TOUR_CASE.initialText);
  });

  it('reveals new clinical results only as a draft and then as submitted evidence', () => {
    const beforeDraft = getTourFrame(TOUR_TIMING.evidenceInputStart);
    expect(beforeDraft.visibleEvidence.map(item => item.id)).toEqual(['synthetic-e1']);
    expect(beforeDraft.evidenceDraft).toBe('');
    expect(JSON.stringify(beforeDraft)).not.toContain('7.29');

    const drafting = getTourFrame(TOUR_TIMING.evidenceInputEnd);
    expect(drafting.evidenceDraft).toBe(TOUR_EVIDENCE[1].text);
    expect(drafting.visibleEvidence).toHaveLength(1);
    expect(drafting.candidates.map(item => item.id)).toEqual(['r1-a', 'r1-b', 'r1-c']);

    const submitted = getTourFrame(TOUR_TIMING.evidenceSubmitted);
    expect(submitted.visibleEvidence).toHaveLength(2);
    expect(submitted.evidenceDraft).toBe('');
    expect(submitted.trajectory.map(item => item.id)).toContain('evidence-r2');
    expect(getTourFrame(TOUR_TIMING.evidenceSubmitted - 1).visibleEvidence).toHaveLength(1);
  });

  it('keeps all three candidates through multiple selections and confirmation in each round', () => {
    const rounds = [
      { number: 1, show: TOUR_TIMING.firstCandidates, select: TOUR_TIMING.firstSelection, multi: TOUR_TIMING.firstAdditionalSelection, confirm: TOUR_TIMING.firstConfirmed },
      { number: 2, show: TOUR_TIMING.secondCandidates, select: TOUR_TIMING.secondSelection, multi: TOUR_TIMING.secondAdditionalSelection, confirm: TOUR_TIMING.secondConfirmed },
    ] as const;
    for (const round of rounds) {
      expect(getTourFrame(round.show - 1).candidates).toHaveLength(0);
      for (const time of [round.show, round.select, round.multi, round.confirm, round.confirm + 1_000]) {
        expect(getTourFrame(time).candidates).toEqual(TOUR_CANDIDATES[round.number]);
      }
      expect(getTourFrame(round.select).selectedCandidateIds).toEqual([`r${round.number}-a`]);
      expect(getTourFrame(round.multi).selectedCandidateIds).toEqual([`r${round.number}-a`, `r${round.number}-b`]);
      expect(getTourFrame(round.confirm - 1).decisionConfirmed).toBe(false);
      expect(getTourFrame(round.confirm).decisionConfirmed).toBe(true);
    }
  });

  it('links every synthetic result to its authored provenance and already confirmed upstream decision', () => {
    expect(TOUR_CASE.synthetic).toBe(true);
    expect(TOUR_CASE.sessionKind).toBe('synthetic-research');
    for (const evidence of TOUR_EVIDENCE) {
      expect(evidence.synthetic).toBe(true);
      expect(evidence.provenance.scenarioId).toBe(TOUR_CASE.id);
      expect(evidence.provenance.source).toBe('authored-synthetic-fixture');
      expect(evidence.provenance.fixtureId).toBeTruthy();
      const frame = getTourFrame(evidence.availableAtMs);
      for (const decisionId of evidence.provenance.parentDecisionIds) {
        expect(frame.trajectory.find(node => node.id === decisionId)?.atMs).toBeLessThan(evidence.availableAtMs);
      }
    }
    for (const candidate of Object.values(TOUR_CANDIDATES).flat()) {
      expect(candidate.sourceIds.length).toBeGreaterThan(0);
      for (const sourceId of candidate.sourceIds) {
        expect(TOUR_SOURCES.some(source => source.id === sourceId && source.url.startsWith('https://www.nice.org.uk/'))).toBe(true);
      }
    }
  });

  it('finishes the full forward trajectory and clamps invalid playback positions', () => {
    expect(TOUR_CHAPTERS[0].startMs).toBe(0);
    for (let index = 1; index < TOUR_CHAPTERS.length; index += 1) {
      expect(TOUR_CHAPTERS[index].startMs).toBe(TOUR_CHAPTERS[index - 1].endMs);
    }
    const completed = getTourFrame(TOUR_DURATION_MS);
    expect(completed.completed).toBe(true);
    expect(completed.summaryVisible).toBe(true);
    expect(completed.progress).toBe(1);
    expect(completed.round).toBe(2);
    expect(completed.trajectory.map(node => node.id)).toEqual(['intake', 'decision-r1', 'evidence-r2', 'decision-r2']);
    for (const node of completed.trajectory) {
      for (const parentId of node.parentIds) {
        expect(completed.trajectory.find(parent => parent.id === parentId)?.atMs).toBeLessThan(node.atMs);
      }
    }
    expect(getTourFrame(TOUR_DURATION_MS - 1).completed).toBe(false);
    expect(getTourFrame(Infinity)).toEqual(completed);
    expect(getTourFrame(-1)).toEqual(getTourFrame(0));
    expect(getTourFrame(NaN)).toEqual(getTourFrame(0));
  });
});
