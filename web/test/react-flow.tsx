import type { ReactNode } from "react";
import { vi } from "vitest";
import type { WorkflowNode } from "@/lib/pbl/diagnostic-workflow";

export const viewport = { fitView: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn() };
type RenderedNode = { id: string; ariaLabel: string; position: { x: number; y: number }; data: { item: WorkflowNode; muted: boolean } };
type RenderedEdge = { id: string; source: string; target: string; status: string; sourceHandle: string; targetHandle: string };

// jsdom exercises the real workflow controls and the complete graph boundary.
// Browser checks cover React Flow's measured geometry and animated viewport.
export const ReactFlowProvider = ({ children }: { children: ReactNode }) => children;
export function ReactFlow({ nodes, edges, onNodeClick, children }: {
  nodes: RenderedNode[];
  edges: RenderedEdge[];
  onNodeClick: (event: unknown, node: RenderedNode) => void;
  children: ReactNode;
}) {
  return <div data-testid="flow">
    {nodes.map(node => <button key={node.id} type="button" data-testid="flow-node" data-node-id={node.id} data-kind={node.data.item.kind} data-status={node.data.item.status} data-muted={node.data.muted} data-position={`${node.position.x},${node.position.y}`} aria-label={node.ariaLabel} onClick={event => onNodeClick(event, node)}>
      <strong>{node.data.item.title}</strong><span>{node.data.item.summary}</span><span>{node.data.item.statusLabel}</span>
    </button>)}
    {edges.map(edge => <span key={edge.id} data-testid="flow-edge" data-source={edge.source} data-target={edge.target} data-status={edge.status} data-source-handle={edge.sourceHandle} data-target-handle={edge.targetHandle} />)}
    {children}
  </div>;
}
export const useReactFlow = () => viewport;
export const useStore = (selector: (state: { width: number; height: number; transform: number[] }) => unknown) => selector({ width: 1200, height: 520, transform: [0, 0, 1] });
export const ViewportPortal = ({ children }: { children: ReactNode }) => children;
export const Background = () => null;
export const MiniMap = ({ ariaLabel }: { ariaLabel: string }) => <div aria-label={ariaLabel} />;
export const Handle = () => null;
export const BackgroundVariant = { Dots: "dots" };
export const MarkerType = { ArrowClosed: "arrowclosed" };
export const Position = { Top: "top", Bottom: "bottom" };
