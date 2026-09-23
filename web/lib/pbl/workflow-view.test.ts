import { describe, expect, it } from 'vitest';
import { getWorkflowSnapshot, workflowStages, type WorkflowEdge, type WorkflowNode } from './diagnostic-workflow';
import { buildWorkflowView, getRelatedPathIds, VIEW_NODE_HEIGHT, VIEW_NODE_WIDTH } from './workflow-view';

const ids = (nodes: WorkflowNode[]) => nodes.map(node => node.id);
const edge = (source: string, target: string, introducedAt = 0): WorkflowEdge => ({
  id: `${source}--${target}`, source, target, introducedAt, status: 'active',
});

function manualNode(id: string, introducedAt = 0): WorkflowNode {
  return { ...getWorkflowSnapshot(0).nodes.find(node => node.id === 'spirometry')!, id, introducedAt };
}

function expectNoOverlap(nodes: WorkflowNode[]) {
  for (let index = 0; index < nodes.length; index += 1) {
    for (const other of nodes.slice(index + 1)) {
      const node = nodes[index];
      expect(Math.abs(node.x - other.x) >= VIEW_NODE_WIDTH || Math.abs(node.y - other.y) >= VIEW_NODE_HEIGHT,
        `${node.id} overlaps ${other.id}`).toBe(true);
    }
  }
}

describe('diagnostic workflow views', () => {
  it('starts with hypotheses above their shared checks in two rows', () => {
    const view = buildWorkflowView({ snapshot: getWorkflowSnapshot(0), mode: 'focus' });
    expect(ids(view.nodes)).toEqual(['copd', 'asthma', 'heart-failure', 'spirometry', 'baseline-tests', 'cardiac-tests']);
    expect(view.rows).toEqual([{ y: 0, label: '假设' }, { y: 246, label: '检查' }]);
    expect(view.nodes.find(node => node.id === 'cardiac-tests')).toMatchObject({ x: 660, y: 246 });
    expect(view.edges.filter(item => item.target === 'spirometry').map(item => item.source)).toEqual(['copd', 'asthma']);
    expect(view.edges.filter(item => item.target === 'baseline-tests')).toHaveLength(3);
  });

  it('presents the current evidence, expansion, convergence and final review without future findings', () => {
    for (const stage of workflowStages) {
      const snapshot = getWorkflowSnapshot(stage.index);
      const view = buildWorkflowView({ snapshot, mode: 'focus' });
      const visibleIds = new Set(ids(view.nodes));
      expect(view.nodes.every(node => node.introducedAt <= stage.index)).toBe(true);
      for (const item of view.edges) {
        expect(visibleIds.has(item.source)).toBe(true);
        expect(visibleIds.has(item.target)).toBe(true);
        expect(snapshot.edges).toContainEqual(item);
      }
      if (stage.index < 5) expect(view.nodes.some(node => node.status === 'confirmed')).toBe(false);
    }
    const expand = buildWorkflowView({ snapshot: getWorkflowSnapshot(2), mode: 'focus' });
    expect(ids(expand.nodes)).toContain('bronchiectasis');
    expect(expand.edges.filter(item => item.target === 'chest-ct')).toHaveLength(2);
    const converge = buildWorkflowView({ snapshot: getWorkflowSnapshot(3), mode: 'focus' });
    expect(converge.edges.filter(item => item.target === 'persistent-obstruction')).toHaveLength(2);
    const final = buildWorkflowView({ snapshot: getWorkflowSnapshot(5), mode: 'focus' });
    expect(ids(final.nodes)).toEqual(['respiratory-review', 'confirmed-diagnosis']);
  });

  it('keeps cards apart in both views and retains a stable full-graph map during replay', () => {
    let previous = buildWorkflowView({ snapshot: getWorkflowSnapshot(0), mode: 'all' });
    for (const stage of workflowStages) {
      const snapshot = getWorkflowSnapshot(stage.index);
      const overview = buildWorkflowView({ snapshot, mode: 'all' });
      expectNoOverlap(overview.nodes);
      expectNoOverlap(buildWorkflowView({ snapshot, mode: 'focus' }).nodes);
      expect(overview.edges).toHaveLength(snapshot.edges.length);
      for (const view of [overview, buildWorkflowView({ snapshot, mode: 'focus' })]) {
        for (const edge of view.edges) {
          expect(view.nodes.find(node => node.id === edge.target)!.y).toBeGreaterThan(view.nodes.find(node => node.id === edge.source)!.y);
        }
      }
      for (const node of previous.nodes) {
        expect(overview.nodes.find(item => item.id === node.id)).toMatchObject({ x: node.x, y: node.y });
      }
      previous = overview;
    }
  });

  it('finds transitive ancestors and descendants without taking sibling branches at a shared test', () => {
    const edges = [edge('start', 'a'), edge('start', 'b'), edge('a', 'shared'), edge('b', 'shared'), edge('shared', 'result'), edge('result', 'review')];
    expect([...getRelatedPathIds(edges, 'a')].sort()).toEqual(['a', 'result', 'review', 'shared', 'start']);
    expect([...getRelatedPathIds(edges, 'shared')].sort()).toEqual(['a', 'b', 'result', 'review', 'shared', 'start']);
    expect([...getRelatedPathIds([...edges, edge('review', 'shared')], 'a')].sort()).toEqual(['a', 'result', 'review', 'shared', 'start']);
  });

  it('filters a selected branch without introducing unrelated hypotheses', () => {
    const view = buildWorkflowView({ snapshot: getWorkflowSnapshot(0), mode: 'focus', branchId: 'copd' });
    expect(ids(view.nodes)).toEqual(['copd', 'spirometry', 'baseline-tests']);
    expect(view.edges.map(item => item.source)).toEqual(['copd', 'copd']);
  });

  it('shows only stage-visible additions and retains their earlier-stage parents and merged paths', () => {
    const additions = {
      nodes: [manualNode('child', 2), manualNode('parent', 2), manualNode('sibling', 2), manualNode('future', 5)],
      edges: [edge('parent', 'child', 2), edge('copd', 'parent', 2), edge('obstruction', 'parent', 2), edge('copd', 'sibling', 2), edge('child', 'future', 5)],
    };
    expect(ids(buildWorkflowView({ snapshot: getWorkflowSnapshot(1), additions, mode: 'focus' }).nodes)).not.toContain('parent');
    const view = buildWorkflowView({ snapshot: getWorkflowSnapshot(2), additions, mode: 'focus' });
    expect(ids(view.nodes)).toContain('copd');
    expect(ids(view.nodes)).toContain('child');
    expect(ids(view.nodes)).not.toContain('future');
    expect(view.edges.filter(item => item.target === 'parent')).toHaveLength(2);
    expect(view.nodes.find(node => node.id === 'child')!.y).toBeGreaterThan(view.nodes.find(node => node.id === 'parent')!.y);
    expectNoOverlap(view.nodes);
    expect(view.edges.every(item => ids(view.nodes).includes(item.source) && ids(view.nodes).includes(item.target))).toBe(true);
  });

  it('never changes clinical statuses, provenance, or source snapshot positions', () => {
    const snapshot = getWorkflowSnapshot(4);
    const original = structuredClone(snapshot);
    const view = buildWorkflowView({ snapshot, mode: 'all' });
    expect(snapshot).toEqual(original);
    for (const node of view.nodes) {
      const source = snapshot.nodes.find(item => item.id === node.id)!;
      expect(node.status).toBe(source.status);
      expect(node.provenance).toEqual(source.provenance);
      expect(node.details).toEqual(source.details);
    }
    expect(view.nodes.find(node => node.id === 'asthma')!.status).toBe('ruled-out');
  });
});
