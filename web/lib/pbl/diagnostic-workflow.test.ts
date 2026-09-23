import { describe, expect, it } from 'vitest';
import {
  getWorkflowNodeHistory,
  getWorkflowSnapshot,
  workflowProvenance,
  workflowSources,
  workflowStages,
} from './diagnostic-workflow';

describe('synthetic diagnostic workflow', () => {
  it('starts with three unconfirmed hypotheses and genuinely shared checks', () => {
    const initial = getWorkflowSnapshot(0);
    expect(initial.nodes.filter((node) => node.kind === 'hypothesis').map((node) => node.id)).toEqual(['copd', 'asthma', 'heart-failure']);
    expect(initial.nodes.some((node) => node.status === 'confirmed')).toBe(false);
    expect(initial.edges.filter((edge) => edge.target === 'spirometry').map((edge) => edge.source)).toEqual(['copd', 'asthma']);
    expect(initial.edges.filter((edge) => edge.target === 'baseline-tests')).toHaveLength(3);
    expect(initial.nodes.find((node) => node.id === 'spirometry')?.status).toBe('active');
  });

  it('reveals evidence and new hypotheses only when they become available', () => {
    const initial = JSON.stringify(getWorkflowSnapshot(0));
    expect(initial).not.toContain('0.62');
    expect(initial).not.toContain('NT-proBNP 84');
    expect(initial).not.toContain('bronchiectasis');
    expect(getWorkflowNodeHistory('bronchiectasis', 1)).toEqual([]);
    expect(getWorkflowSnapshot(1).nodes.some((node) => node.id === 'sputum-history')).toBe(true);
    expect(getWorkflowSnapshot(1).nodes.some((node) => node.id === 'chest-ct')).toBe(false);
    expect(getWorkflowSnapshot(2).nodes.find((node) => node.id === 'bronchiectasis')?.status).toBe('candidate');
    expect(JSON.stringify(getWorkflowSnapshot(2))).not.toContain('0.61');
    expect(JSON.stringify(getWorkflowSnapshot(2))).not.toContain('PBL-CT-01');
    expect(getWorkflowNodeHistory('copd', 1).every((entry) => entry.stageIndex <= 1)).toBe(true);
  });

  it('restores historical statuses when rewound, without sharing mutable evidence', () => {
    const initial = getWorkflowSnapshot(0);
    const later = getWorkflowSnapshot(5);
    expect(later.nodes.find((node) => node.id === 'copd')?.status).toBe('confirmed');
    expect(getWorkflowSnapshot(0)).toEqual(initial);
    expect(getWorkflowSnapshot(1).nodes.find((node) => node.id === 'asthma')?.status).toBe('candidate');
    later.nodes[0].details.push('mutation');
    later.nodes[0].provenance.evidenceIds.push('future-evidence');
    later.stage.focusNodeIds.push('future-evidence');
    expect(getWorkflowSnapshot(0)).toEqual(initial);
    expect(getWorkflowSnapshot(5).nodes[0].details).not.toContain('mutation');
  });

  it('keeps edges and provenance references inside the visible graph at every stage', () => {
    for (const stage of workflowStages) {
      const snapshot = getWorkflowSnapshot(stage.index);
      const ids = new Set(snapshot.nodes.map((node) => node.id));
      expect(ids.size).toBe(snapshot.nodes.length);
      expect(new Set(snapshot.edges.map((edge) => edge.id)).size).toBe(snapshot.edges.length);
      for (const edge of snapshot.edges) {
        expect(ids.has(edge.source), edge.id).toBe(true);
        expect(ids.has(edge.target), edge.id).toBe(true);
        const source = snapshot.nodes.find((node) => node.id === edge.source)!;
        const target = snapshot.nodes.find((node) => node.id === edge.target)!;
        expect(source.x, edge.id).toBeLessThan(target.x);
      }
      for (const node of snapshot.nodes) {
        for (const evidenceId of node.provenance.evidenceIds) expect(ids.has(evidenceId), `${node.id}: ${evidenceId}`).toBe(true);
        for (const sourceId of node.sourceIds) expect(workflowSources.some((source) => source.id === sourceId)).toBe(true);
      }
      for (const focusId of stage.focusNodeIds) expect(ids.has(focusId)).toBe(true);
    }
  });

  it('appends stable-position nodes and edges while supporting forks and merges', () => {
    for (let stage = 1; stage < workflowStages.length; stage += 1) {
      const previous = getWorkflowSnapshot(stage - 1);
      const current = getWorkflowSnapshot(stage);
      for (const node of previous.nodes) {
        const retained = current.nodes.find((item) => item.id === node.id)!;
        expect([retained.x, retained.y]).toEqual([node.x, node.y]);
      }
      for (const edge of previous.edges) expect(current.edges.some((item) => item.id === edge.id)).toBe(true);
    }
    const expanded = getWorkflowSnapshot(2);
    expect(expanded.edges.filter((edge) => edge.source === 'obstruction').length).toBeGreaterThan(1);
    expect(expanded.edges.filter((edge) => edge.target === 'chest-ct').length).toBeGreaterThan(1);
    expect(getWorkflowSnapshot(4).edges.filter((edge) => edge.target === 'respiratory-review').map(edge => edge.source).sort()).toEqual(['cardiac-evidence', 'ct-evidence', 'persistent-obstruction']);
  });

  it('dims discontinued hypothesis paths while preserving shared diagnostic evidence', () => {
    const reviewed = getWorkflowSnapshot(4);
    for (const id of ['asthma', 'heart-failure', 'bronchiectasis']) {
      expect(reviewed.nodes.find((node) => node.id === id)?.status).toBe('ruled-out');
      expect(reviewed.edges.filter((edge) => edge.source === id).every((edge) => edge.status === 'ruled-out')).toBe(true);
    }
    expect(reviewed.nodes.find((node) => node.id === 'spirometry')?.status).toBe('complete');
    expect(reviewed.nodes.find((node) => node.id === 'chest-ct')?.status).toBe('complete');
    expect(reviewed.edges.find((edge) => edge.source === 'copd' && edge.target === 'spirometry')?.status).toBe('complete');
    expect(reviewed.edges.find((edge) => edge.source === 'obstruction' && edge.target === 'chest-ct')?.status).toBe('complete');
  });

  it('reserves confirmation for the final physician review stage', () => {
    for (let stage = 0; stage < workflowStages.length - 1; stage += 1) {
      const snapshot = getWorkflowSnapshot(stage);
      expect(snapshot.nodes.some((node) => node.kind === 'conclusion' || node.status === 'confirmed')).toBe(false);
      expect(getWorkflowNodeHistory('copd', stage).some((entry) => entry.status === 'confirmed')).toBe(false);
    }
    const final = getWorkflowSnapshot(5);
    expect(final.nodes.find((node) => node.id === 'confirmed-diagnosis')?.status).toBe('confirmed');
    expect(final.edges.find((edge) => edge.target === 'confirmed-diagnosis')?.source).toBe('respiratory-review');
    expect(final.nodes.find((node) => node.id === 'respiratory-review')?.status).toBe('complete');
  });

  it('labels every generated item as synthetic with local provenance', () => {
    const snapshot = getWorkflowSnapshot(5);
    expect(snapshot.provenance.sessionKind).toBe('synthetic-research');
    expect(snapshot.provenance.label).toContain('合成');
    for (const node of snapshot.nodes) {
      expect(node.provenance.kind).toBe('synthetic');
      expect(node.provenance.fixtureId).toBe(workflowProvenance.fixtureId);
      expect(node.provenance.sessionKind).toBe('synthetic-research');
      if (node.id !== 'presentation') expect(node.provenance.evidenceIds.length).toBeGreaterThan(0);
    }
    expect(workflowSources.every((source) => /https:\/\/(goldcopd\.org|www\.nice\.org\.uk)\//.test(source.url))).toBe(true);
  });

  it('normalizes invalid replay positions without exposing future data', () => {
    expect(getWorkflowSnapshot(-1).stage.index).toBe(0);
    expect(getWorkflowSnapshot(Number.NaN).stage.index).toBe(0);
    expect(getWorkflowSnapshot(Infinity).stage.index).toBe(0);
    expect(getWorkflowSnapshot(2.9).stage.index).toBe(2);
    expect(getWorkflowSnapshot(100).stage.index).toBe(5);
  });
});
