import type { WorkflowEdge, WorkflowNode, WorkflowSnapshot } from './diagnostic-workflow';

export const VIEW_NODE_WIDTH = 268;
export const VIEW_NODE_HEIGHT = 136;
export const VIEW_COLUMN_GAP = 330;
export const VIEW_ROW_GAP = 246;

export type WorkflowViewMode = 'focus' | 'all';

export interface WorkflowViewOptions {
  snapshot: WorkflowSnapshot;
  additions?: { nodes: WorkflowNode[]; edges: WorkflowEdge[] };
  mode: WorkflowViewMode;
  /** Limit the view to this node's ancestors and descendants. */
  branchId?: string | null;
}

export interface WorkflowView {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  rows: { y: number; label: string }[];
  relatedNodeIds: Set<string>;
}

type Position = { x: number; y: number };
type FocusLayout = { nodes: Record<string, Position>; labels: string[] };

const at = (step: number, branch: number): Position => ({
  x: branch * VIEW_COLUMN_GAP,
  y: step * VIEW_ROW_GAP,
});

// Each local view shows a diagnostic question and its immediate next step.
// Historical findings remain in the snapshot for the detail rail and overview.
const focusLayouts: FocusLayout[] = [
  {
    nodes: {
      copd: at(0, 0), asthma: at(0, 1), 'heart-failure': at(0, 2),
      spirometry: at(1, 0), 'baseline-tests': at(1, 1), 'cardiac-tests': at(1, 2),
    },
    labels: ['假设', '检查'],
  },
  {
    nodes: {
      spirometry: at(0, 0), 'baseline-tests': at(0, 1), 'cardiac-tests': at(0, 2),
      obstruction: at(1, 0), 'sputum-history': at(1, 1), 'cardiac-evidence': at(1, 2),
    },
    labels: ['检查', '证据'],
  },
  {
    nodes: {
      obstruction: at(0, 0.5), 'sputum-history': at(0, 2),
      'repeat-spirometry': at(1, 0), 'peak-flow': at(1, 1), bronchiectasis: at(1, 2),
      'chest-ct': at(2, 2),
    },
    labels: ['证据', '检查 · 假设', '检查'],
  },
  {
    nodes: {
      'repeat-spirometry': at(0, 0), 'peak-flow': at(0, 1), 'chest-ct': at(0, 2),
      'persistent-obstruction': at(1, 0.5), 'ct-evidence': at(1, 2),
    },
    labels: ['检查', '证据'],
  },
  {
    nodes: {
      'persistent-obstruction': at(0, 0), 'ct-evidence': at(0, 1), 'cardiac-evidence': at(0, 2),
      'respiratory-review': at(1, 1),
    },
    labels: ['证据', '检查'],
  },
  {
    nodes: { 'respiratory-review': at(0, 0), 'confirmed-diagnosis': at(1, 0) },
    labels: ['检查', '假设'],
  },
];

/**
 * Walk upstream and downstream separately. Treating the graph as undirected
 * would highlight every sibling hypothesis sharing a test with the selection.
 */
export function getRelatedPathIds(edges: WorkflowEdge[], nodeId: string): Set<string> {
  const related = new Set([nodeId]);
  const upstream = new Map<string, string[]>();
  const downstream = new Map<string, string[]>();
  for (const edge of edges) {
    upstream.set(edge.target, [...(upstream.get(edge.target) ?? []), edge.source]);
    downstream.set(edge.source, [...(downstream.get(edge.source) ?? []), edge.target]);
  }
  for (const adjacency of [upstream, downstream]) {
    const visited = new Set([nodeId]);
    const pending = [nodeId];
    while (pending.length) {
      for (const id of adjacency.get(pending.pop()!) ?? []) {
        if (visited.has(id)) continue;
        visited.add(id);
        related.add(id);
        pending.push(id);
      }
    }
  }
  return related;
}

function collides(position: Position, nodes: WorkflowNode[]): boolean {
  return nodes.some(node =>
    Math.abs(node.x - position.x) < VIEW_NODE_WIDTH + 24 &&
    Math.abs(node.y - position.y) < VIEW_NODE_HEIGHT + 24,
  );
}

function availablePosition(position: Position, nodes: WorkflowNode[]): Position {
  const result = { ...position };
  while (collides(result, nodes)) result.x += VIEW_COLUMN_GAP;
  return result;
}

const overviewLabels = ['证据', '假设', '检查', '证据', '检查 · 假设', '检查', '证据', '检查', '假设'];

/** Derive display positions only; clinical statuses and evidence stay untouched. */
export function buildWorkflowView({ snapshot, additions, mode, branchId }: WorkflowViewOptions): WorkflowView {
  const stage = snapshot.stage.index;
  const fixtureNodes = snapshot.nodes.filter(node => node.introducedAt <= stage);
  const fixtureIds = new Set(fixtureNodes.map(node => node.id));
  const additionalNodes = (additions?.nodes ?? []).filter(node => node.introducedAt <= stage && !fixtureIds.has(node.id));
  const allNodes = [...fixtureNodes, ...additionalNodes];
  const allIds = new Set(allNodes.map(node => node.id));
  const allEdges = [...snapshot.edges, ...(additions?.edges ?? [])].filter(edge =>
    edge.introducedAt <= stage && allIds.has(edge.source) && allIds.has(edge.target),
  );
  const relatedNodeIds = branchId ? getRelatedPathIds(allEdges, branchId) : allIds;
  const layout = focusLayouts[stage] ?? focusLayouts[0];
  const nodes: WorkflowNode[] = [];

  for (const node of fixtureNodes) {
    const position = mode === 'all' ? { x: node.y / 150 * VIEW_COLUMN_GAP, y: node.x / 320 * VIEW_ROW_GAP } : layout.nodes[node.id];
    if (position) nodes.push({ ...node, ...availablePosition(position, nodes) });
  }

  // An added node may refer to an earlier-stage item outside this local view.
  // Bring that explicit parent into view so its new arrow has a real endpoint.
  const additionalIds = new Set(additionalNodes.map(node => node.id));
  const requiredParentIds = new Set(allEdges.filter(edge => additionalIds.has(edge.target)).map(edge => edge.source));
  for (const node of fixtureNodes) {
    if (!requiredParentIds.has(node.id) || nodes.some(item => item.id === node.id)) continue;
    nodes.push({ ...node, ...availablePosition(at(0, 0), nodes) });
  }

  // Place parents before children even when additions arrive out of order.
  const pending = [...additionalNodes];
  while (pending.length) {
    const nextIndex = pending.findIndex(node => allEdges
      .filter(edge => edge.target === node.id)
      .every(edge => !pending.some(parent => parent.id === edge.source)));
    const [node] = pending.splice(nextIndex < 0 ? 0 : nextIndex, 1);
    const parents = allEdges.filter(edge => edge.target === node.id)
      .flatMap(edge => nodes.filter(parent => parent.id === edge.source));
    const position = parents.length
      ? { x: parents.reduce((sum, parent) => sum + parent.x, 0) / parents.length, y: Math.max(...parents.map(parent => parent.y)) + VIEW_ROW_GAP }
      : at(0, 0);
    nodes.push({ ...node, ...availablePosition(position, nodes) });
  }

  const visibleNodes = branchId ? nodes.filter(node => relatedNodeIds.has(node.id)) : nodes;
  const visibleIds = new Set(visibleNodes.map(node => node.id));
  const edges = allEdges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target));
  const rows = [...new Set(visibleNodes.map(node => node.y))].sort((top, bottom) => top - bottom).map(y => ({
    y,
    label: mode === 'focus'
      ? layout.labels[Math.round(y / VIEW_ROW_GAP)] ?? '检查'
      : overviewLabels[Math.round(y / VIEW_ROW_GAP)] ?? '检查',
  }));
  return { nodes: visibleNodes, edges, rows, relatedNodeIds };
}
