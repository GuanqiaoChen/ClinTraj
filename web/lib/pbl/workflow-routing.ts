import type { WorkflowEdge, WorkflowNode } from './diagnostic-workflow';
import { VIEW_NODE_HEIGHT, VIEW_NODE_WIDTH, VIEW_ROW_GAP } from './workflow-view';

export interface WorkflowRoute {
  /** Fraction of the source card's bottom edge, measured from its left. */
  sourceOffset: number;
  /** Fraction of the target card's top edge, measured from its left. */
  targetOffset: number;
  /** Dedicated horizontal lane immediately below the source row. */
  centerY: number;
  /** Row-skipping paths travel outside all cards before returning to the target. */
  detourX?: number;
}

type Connection = { edge: WorkflowEdge; source: WorkflowNode; target: WorkflowNode };

const compareId = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const portOffset = (index: number, count: number) => count === 1 ? 0.5 : 0.2 + 0.6 * index / (count - 1);

/**
 * Give every relationship its own ports and lane. A shared check remains one
 * card, but its incoming arrows never collapse into an ambiguous shared stem.
 * This function does not mutate clinical nodes, edges, or their statuses.
 */
export function planWorkflowRoutes(nodes: WorkflowNode[], edges: WorkflowEdge[]): Map<string, WorkflowRoute> {
  const lookup = new Map(nodes.map(node => [node.id, node]));
  const connections: Connection[] = edges.flatMap(edge => {
    const source = lookup.get(edge.source);
    const target = lookup.get(edge.target);
    return source && target ? [{ edge, source, target }] : [];
  }).sort((left, right) =>
    left.source.y - right.source.y || left.source.x - right.source.x ||
    left.target.y - right.target.y || left.target.x - right.target.x || compareId(left.edge.id, right.edge.id),
  );
  const routes = new Map<string, WorkflowRoute>();
  const outgoing = new Map<string, Connection[]>();
  const incoming = new Map<string, Connection[]>();
  const departureRows = new Map<number, Connection[]>();

  for (const connection of connections) {
    const { edge, source } = connection;
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), connection]);
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), connection]);
    departureRows.set(source.y, [...(departureRows.get(source.y) ?? []), connection]);
    routes.set(edge.id, { sourceOffset: 0.5, targetOffset: 0.5, centerY: source.y + VIEW_NODE_HEIGHT });
  }

  for (const group of outgoing.values()) {
    group.sort((left, right) => left.target.x - right.target.x || left.target.y - right.target.y || compareId(left.edge.id, right.edge.id));
    group.forEach((connection, index) => {
      routes.get(connection.edge.id)!.sourceOffset = portOffset(index, group.length);
    });
  }
  for (const group of incoming.values()) {
    group.sort((left, right) => left.source.x - right.source.x || left.source.y - right.source.y || compareId(left.edge.id, right.edge.id));
    group.forEach((connection, index) => {
      routes.get(connection.edge.id)!.targetOffset = portOffset(index, group.length);
    });
  }

  const usedLanes = new Set<number>();
  for (const [rowY, group] of departureRows) {
    const sourceBottom = rowY + VIEW_NODE_HEIGHT;
    const nextRow = Math.min(...nodes.filter(node => node.y > sourceBottom).map(node => node.y), rowY + VIEW_ROW_GAP);
    const gap = nextRow - sourceBottom;
    const margin = Math.min(18, gap / 4);
    const firstLane = sourceBottom + margin;
    const lastLane = nextRow - margin;
    // Longer leftward connections leave first; rightward ones leave later.
    // Dedicated ports already preserve left-to-right order at each endpoint.
    group.sort((left, right) => (left.target.x - left.source.x) - (right.target.x - right.source.x) ||
      left.source.x - right.source.x || compareId(left.edge.id, right.edge.id));
    group.forEach((connection, index) => {
      let centerY = group.length === 1 ? (firstLane + lastLane) / 2 : firstLane + (lastLane - firstLane) * index / (group.length - 1);
      // Distinct, non-grid rows can theoretically yield the same lane value.
      // Keep deterministic uniqueness without perceptibly shifting a path.
      while (usedLanes.has(centerY)) centerY += 0.000001;
      usedLanes.add(centerY);
      routes.get(connection.edge.id)!.centerY = centerY;
    });
  }

  const rightmost = Math.max(0, ...nodes.map(node => node.x));
  let detourIndex = 0;
  for (const { edge, source, target } of connections) {
    const skipsRow = target.y - source.y > VIEW_ROW_GAP + 0.001;
    const interveningRow = nodes.some(node => node.id !== source.id && node.id !== target.id &&
      node.y > source.y + VIEW_NODE_HEIGHT && node.y < target.y);
    const nonForward = target.y <= source.y + VIEW_NODE_HEIGHT;
    if (skipsRow || interveningRow || nonForward) {
      routes.get(edge.id)!.detourX = rightmost + VIEW_NODE_WIDTH + 36 + detourIndex * 18;
      detourIndex += 1;
    }
  }
  return routes;
}
