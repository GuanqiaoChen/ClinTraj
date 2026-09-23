import { describe, expect, it } from 'vitest';
import { getWorkflowSnapshot, workflowStages, type WorkflowEdge, type WorkflowNode } from './diagnostic-workflow';
import { buildWorkflowView, VIEW_NODE_HEIGHT, VIEW_NODE_WIDTH, VIEW_ROW_GAP } from './workflow-view';
import { planWorkflowRoutes, workflowRoutePath } from './workflow-routing';

const edge = (id: string, source: string, target: string): WorkflowEdge => ({ id, source, target, introducedAt: 0, status: 'active' });
const node = (id: string, x: number, y: number): WorkflowNode => ({ ...getWorkflowSnapshot(0).nodes[0], id, x, y });

describe('workflow relationship routing', () => {
  it('rounds an early lane without overshooting and reversing the source stem', () => {
    const path = workflowRoutePath(219, 138, 134, 244, { sourceOffset: 0.2, targetOffset: 0.5, centerY: 154 });
    expect(path).toBe('M219,138 L219,146 Q219,154 211,154 L142,154 Q134,154 134,162 L134,244');
    expect(path).not.toContain('NaN');
  });
  it('assigns unique ports and horizontal lanes at every stage in both views', () => {
    for (const mode of ['focus', 'all'] as const) {
      for (const stage of workflowStages) {
        const view = buildWorkflowView({ snapshot: getWorkflowSnapshot(stage.index), mode });
        const routes = planWorkflowRoutes(view.nodes, view.edges);
        expect(routes.size).toBe(view.edges.length);
        expect(new Set([...routes.values()].map(route => route.centerY)).size).toBe(routes.size);
        for (const item of view.nodes) {
          const outgoing = view.edges.filter(connection => connection.source === item.id).map(connection => routes.get(connection.id)!.sourceOffset);
          const incoming = view.edges.filter(connection => connection.target === item.id).map(connection => routes.get(connection.id)!.targetOffset);
          for (const ports of [outgoing, incoming]) {
            expect(new Set(ports).size).toBe(ports.length);
            expect(ports.every(offset => offset >= 0.2 && offset <= 0.8)).toBe(true);
          }
        }
        for (const connection of view.edges) {
          const route = routes.get(connection.id)!;
          const source = view.nodes.find(item => item.id === connection.source)!;
          const target = view.nodes.find(item => item.id === connection.target)!;
          expect(route.centerY).toBeGreaterThan(source.y + VIEW_NODE_HEIGHT);
          expect(route.centerY).toBeLessThan(target.y);
        }
      }
    }
  });

  it('places ports in opposite-end x order so sibling arrows start and finish separately', () => {
    const nodes = [node('source', 330, 0), node('left', 0, VIEW_ROW_GAP), node('right', 660, VIEW_ROW_GAP), node('target', 330, 2 * VIEW_ROW_GAP)];
    const edges = [edge('right', 'source', 'right'), edge('left', 'source', 'left'), edge('in-right', 'right', 'target'), edge('in-left', 'left', 'target')];
    const routes = planWorkflowRoutes(nodes, edges);
    expect(routes.get('left')!.sourceOffset).toBe(0.2);
    expect(routes.get('right')!.sourceOffset).toBe(0.8);
    expect(routes.get('in-left')!.targetOffset).toBeLessThan(routes.get('in-right')!.targetOffset);
  });

  it('routes every row-skipping relationship outside all cards on a separate vertical lane', () => {
    for (const mode of ['focus', 'all'] as const) {
      const view = buildWorkflowView({ snapshot: getWorkflowSnapshot(5), mode });
      const routes = planWorkflowRoutes(view.nodes, view.edges);
      const detours = [...routes.values()].flatMap(route => route.detourX === undefined ? [] : [route.detourX]);
      expect(new Set(detours).size).toBe(detours.length);
      const rightmost = Math.max(...view.nodes.map(item => item.x + VIEW_NODE_WIDTH));
      for (const x of detours) expect(x).toBeGreaterThanOrEqual(rightmost + 36);
      for (const connection of view.edges) {
        const source = view.nodes.find(item => item.id === connection.source)!;
        const target = view.nodes.find(item => item.id === connection.target)!;
        if (target.y - source.y > VIEW_ROW_GAP + 0.001) expect(routes.get(connection.id)!.detourX).toBeDefined();
      }
    }
    const nodes = [node('a', 0, 0), node('b', 330, VIEW_ROW_GAP), node('c', 0, 2 * VIEW_ROW_GAP)];
    const routes = planWorkflowRoutes(nodes, [edge('a-c', 'a', 'c'), edge('b-c', 'b', 'c')]);
    expect(routes.get('a-c')!.detourX).toBe(330 + VIEW_NODE_WIDTH + 36);
    expect(routes.get('b-c')!.detourX).toBeUndefined();
  });

  it('gives parallel edges different ports and lanes, even with identical endpoints', () => {
    const nodes = [node('a', 0, 0), node('b', 0, VIEW_ROW_GAP)];
    const routes = planWorkflowRoutes(nodes, [edge('first', 'a', 'b'), edge('second', 'a', 'b')]);
    expect(routes.get('first')!.sourceOffset).not.toBe(routes.get('second')!.sourceOffset);
    expect(routes.get('first')!.targetOffset).not.toBe(routes.get('second')!.targetOffset);
    expect(routes.get('first')!.centerY).not.toBe(routes.get('second')!.centerY);
  });

  it('keeps arrival stems clear of unrelated departure stems between initial rows', () => {
    const view = buildWorkflowView({ snapshot: getWorkflowSnapshot(0), mode: 'focus' });
    const routes = planWorkflowRoutes(view.nodes, view.edges);
    for (const incoming of view.edges) {
      const target = view.nodes.find(item => item.id === incoming.target)!;
      const arrivalX = target.x + routes.get(incoming.id)!.targetOffset * VIEW_NODE_WIDTH;
      for (const outgoing of view.edges.filter(item => item.id !== incoming.id)) {
        const source = view.nodes.find(item => item.id === outgoing.source)!;
        const departureX = source.x + routes.get(outgoing.id)!.sourceOffset * VIEW_NODE_WIDTH;
        expect(Math.abs(arrivalX - departureX), `${incoming.id} overlaps ${outgoing.id}`).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('is deterministic regardless of input order and does not mutate the graph', () => {
    const view = buildWorkflowView({ snapshot: getWorkflowSnapshot(5), mode: 'all' });
    const original = structuredClone(view);
    const forward = planWorkflowRoutes(view.nodes, view.edges);
    expect([...planWorkflowRoutes([...view.nodes].reverse(), [...view.edges].reverse())]).toEqual([...forward]);
    expect(view).toEqual(original);
    expect(planWorkflowRoutes([], []).size).toBe(0);
    expect(planWorkflowRoutes(view.nodes, [edge('missing', 'unknown', view.nodes[0].id)]).size).toBe(0);
  });
});
