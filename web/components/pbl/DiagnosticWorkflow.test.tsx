// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWorkflowSnapshot, workflowStages, type WorkflowNode } from "../../lib/pbl/diagnostic-workflow";
import { DiagnosticWorkflow } from "./DiagnosticWorkflow";

const viewport = vi.hoisted(() => ({ fitView: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn() }));

type RenderedNode = { id: string; ariaLabel: string; data: { item: WorkflowNode; muted: boolean } };
type RenderedEdge = { id: string; source: string; target: string; status: string };

// Keep graph geometry outside jsdom while exercising the real controls, fixture,
// inspector, composer, and the nodes/edges passed across the graph boundary.
vi.mock("@xyflow/react", () => ({
  ReactFlowProvider: ({ children }: { children: ReactNode }) => children,
  ReactFlow: ({ nodes, edges, onNodeClick, children }: {
    nodes: RenderedNode[];
    edges: RenderedEdge[];
    onNodeClick: (event: unknown, node: RenderedNode) => void;
    children: ReactNode;
  }) => <div data-testid="flow">
    {nodes.map(node => <button key={node.id} type="button" data-testid="flow-node" data-node-id={node.id} data-kind={node.data.item.kind} data-status={node.data.item.status} data-muted={node.data.muted} aria-label={node.ariaLabel} onClick={event => onNodeClick(event, node)}>
      <strong>{node.data.item.title}</strong><span>{node.data.item.summary}</span><span>{node.data.item.statusLabel}</span>
    </button>)}
    {edges.map(edge => <span key={edge.id} data-testid="flow-edge" data-source={edge.source} data-target={edge.target} data-status={edge.status} />)}
    {children}
  </div>,
  useReactFlow: () => viewport,
  useStore: (selector: (state: { width: number; height: number; transform: number[] }) => unknown) => selector({ width: 1200, height: 520, transform: [0, 0, 1] }),
  ViewportPortal: ({ children }: { children: ReactNode }) => children,
  Background: () => null,
  MiniMap: ({ ariaLabel }: { ariaLabel: string }) => <div aria-label={ariaLabel} />,
  Handle: () => null,
  BackgroundVariant: { Dots: "dots" },
  MarkerType: { ArrowClosed: "arrowclosed" },
  Position: { Top: "top", Bottom: "bottom" },
}));

vi.mock("motion/react", () => ({ useReducedMotion: () => true }));

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0)));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => window.clearTimeout(id)));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("The synthetic workflow must not call live session APIs"); }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<DiagnosticWorkflow />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  expect(fetch).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function button(label: string) {
  const match = [...host.querySelectorAll<HTMLButtonElement>("button")].find(item => item.getAttribute("aria-label") === label || item.textContent?.trim() === label);
  if (!match) throw new Error(`Button missing: ${label}`);
  return match;
}

async function click(label: string) { await act(async () => button(label).click()); }

async function goTo(stageIndex: number) { await click(`阶段 ${stageIndex + 1}：${workflowStages[stageIndex].label}`); }

function node(id: string) { return host.querySelector<HTMLButtonElement>(`[data-testid="flow-node"][data-node-id="${id}"]`); }

async function selectNode(id: string) {
  const element = node(id);
  if (!element) throw new Error(`Node missing: ${id}`);
  await act(async () => element.click());
}

async function fill(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function chooseParent(title: string) {
  const option = [...host.querySelectorAll<HTMLInputElement>('[data-testid="diagnostic-composer"] input[type="checkbox"]')].find(input => input.getAttribute("aria-label") === title);
  if (!option) throw new Error(`Parent missing: ${title}`);
  await act(async () => option.click());
}

async function submitNode(title: string) {
  const composer = host.querySelector<HTMLFormElement>('[data-testid="diagnostic-composer"]')!;
  await fill(composer.querySelector<HTMLInputElement>('input[type="text"]')!, title);
  await fill(composer.querySelector<HTMLTextAreaElement>("textarea")!, "根据新线索进一步验证");
  await act(async () => composer.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}

function stageIndex() {
  return [...host.querySelectorAll('[data-testid="diagnostic-stage"]')].findIndex(item => item.getAttribute("aria-current") === "step");
}

async function advance(ms: number) { await act(async () => vi.advanceTimersByTime(ms)); }

describe("diagnostic workflow interactions", () => {
  it("switches between the current diagnostic step and complete history, with hypotheses always available for inspection", async () => {
    expect(button("当前推演").getAttribute("aria-pressed")).toBe("true");
    expect(button("全部路径").getAttribute("aria-pressed")).toBe("false");
    expect(node("presentation")).toBeNull();
    expect(host.querySelectorAll('[aria-label="诊断假设列表"] button[aria-label^="聚焦假设："]')).toHaveLength(3);

    await click("全部路径");
    expect(button("全部路径").getAttribute("aria-pressed")).toBe("true");
    expect(node("presentation")).not.toBeNull();
    expect(host.querySelectorAll('[data-testid="flow-node"]')).toHaveLength(getWorkflowSnapshot(0).nodes.length);

    await goTo(2);
    const historicalCount = host.querySelectorAll('[data-testid="flow-node"]').length;
    await click("当前推演");
    expect(host.querySelectorAll('[data-testid="flow-node"]').length).toBeLessThan(historicalCount);
    expect(node("obstruction")).not.toBeNull();
    expect(node("repeat-spirometry")).not.toBeNull();
    expect(node("bronchiectasis")).not.toBeNull();
    expect(node("copd")).toBeNull();
    expect(host.querySelectorAll('[aria-label="诊断假设列表"] button[aria-label^="聚焦假设："]')).toHaveLength(4);

    await click("聚焦假设：慢性阻塞性肺疾病");
    expect(button("聚焦假设：慢性阻塞性肺疾病").getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector('[aria-label="节点详情"] h3')?.textContent).toBe("慢性阻塞性肺疾病");
    expect(node("repeat-spirometry")?.dataset.muted).toBe("false");
    await click("关闭节点详情");
    expect(button("聚焦假设：慢性阻塞性肺疾病").getAttribute("aria-pressed")).toBe("false");
    expect(host.querySelector('[aria-label="节点详情"]')).toBeNull();
    expect(stageIndex()).toBe(2);
  });

  it("reveals evidence and final confirmation in time, then clears future nodes and inspector details on rollback", async () => {
    expect(stageIndex()).toBe(0);
    expect(button("上一步").disabled).toBe(true);
    expect(host.querySelectorAll('[data-testid="flow-node"][data-kind="hypothesis"]')).toHaveLength(3);
    expect(node("copd")?.dataset.status).toBe("candidate");
    expect(node("confirmed-diagnosis")).toBeNull();
    expect(node("bronchiectasis")).toBeNull();
    expect(host.textContent).not.toContain("0.62");
    expect(host.textContent).not.toContain("0.61");

    await click("全部路径");
    await click("下一步");
    expect(stageIndex()).toBe(1);
    expect(node("obstruction")).not.toBeNull();
    expect(node("heart-failure")?.dataset.status).toBe("ruled-out");
    expect(host.querySelector('[data-testid="flow-edge"][data-source="heart-failure"]')?.getAttribute("data-status")).toBe("ruled-out");
    await goTo(2);
    expect(node("bronchiectasis")?.dataset.status).toBe("candidate");
    expect(node("chest-ct")?.dataset.kind).toBe("test");

    await goTo(workflowStages.length - 1);
    expect(node("confirmed-diagnosis")?.dataset.status).toBe("confirmed");
    expect(node("copd")?.dataset.status).toBe("confirmed");
    expect(host.querySelectorAll('[data-testid="flow-node"]')).toHaveLength(getWorkflowSnapshot(workflowStages.length - 1).nodes.length);
    await selectNode("copd");
    expect(host.querySelector('[aria-label="节点详情"]')?.textContent).toContain("医生完成鉴别诊断复核");

    await goTo(0);
    expect(host.querySelector('[aria-label="节点详情"]')).toBeNull();
    expect(node("confirmed-diagnosis")).toBeNull();
    expect(node("obstruction")).toBeNull();
    expect(node("bronchiectasis")).toBeNull();
    expect(node("heart-failure")?.dataset.status).toBe("candidate");
    await selectNode("copd");
    expect(host.querySelector('[aria-label="节点详情"]')?.textContent).toContain("当前仅为假设");
    expect(host.textContent).not.toContain("医生完成鉴别诊断复核");
    expect(host.textContent).not.toContain("0.62");
    expect(host.textContent).not.toContain("0.61");
  });

  it("adds connected hypotheses and shared checks locally, preserving their introduction stage", async () => {
    await goTo(1);
    await click("追加节点");
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="diagnostic-composer"] input[type="checkbox"][aria-label="心力衰竭"]')).toBeNull();
    await chooseParent("慢性阻塞性肺疾病");
    await chooseParent("支气管哮喘");
    await submitNode("补充鉴别假设");
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(node("manual-1")?.dataset.kind).toBe("hypothesis");
    expect(node("manual-1")?.dataset.status).toBe("candidate");
    expect([...host.querySelectorAll('[data-testid="flow-edge"][data-target="manual-1"]')].map(edge => edge.getAttribute("data-source")).sort()).toEqual(["asthma", "copd"]);
    expect(host.querySelector('[aria-label="节点详情"]')?.textContent).toContain("未执行检查或生成检查结果");

    await click("从此节点继续");
    await click("检查决策");
    await chooseParent("慢性阻塞性肺疾病");
    await submitNode("共享验证检查");
    expect(node("manual-2")?.dataset.kind).toBe("test");
    expect(node("manual-2")?.dataset.status).toBe("active");
    expect([...host.querySelectorAll('[data-testid="flow-edge"][data-target="manual-2"]')].map(edge => edge.getAttribute("data-source")).sort()).toEqual(["copd", "manual-1"]);

    await goTo(0);
    expect(node("manual-1")).toBeNull();
    expect(node("manual-2")).toBeNull();
    expect(host.querySelector('[data-testid="flow-edge"][data-target^="manual-"]')).toBeNull();
    await goTo(1);
    expect(node("manual-1")).not.toBeNull();
    expect(node("manual-2")).not.toBeNull();
    expect(host.querySelectorAll('[data-testid="flow-edge"][data-target^="manual-"]')).toHaveLength(4);
    const visibleIds = new Set([...host.querySelectorAll('[data-testid="flow-node"]')].map(item => item.getAttribute("data-node-id")));
    for (const edge of host.querySelectorAll('[data-testid="flow-edge"]')) {
      expect(visibleIds.has(edge.getAttribute("data-source"))).toBe(true);
      expect(visibleIds.has(edge.getAttribute("data-target"))).toBe(true);
    }
  });

  it("requires a parent before adding a node and supports dismissing the composer", async () => {
    await click("追加节点");
    await submitNode("无连接的新假设");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("至少一个上游节点");
    expect(node("manual-1")).toBeNull();
    await act(async () => host.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it("honors playback speed, stops at the last stage, and replays without leaking final confirmation", async () => {
    const speed = host.querySelector<HTMLSelectElement>('[aria-label="推演速度"]')!;
    await act(async () => { speed.value = "2"; speed.dispatchEvent(new Event("change", { bubbles: true })); });
    await click("自动推演");
    await advance(2499);
    expect(stageIndex()).toBe(0);
    await advance(1);
    expect(stageIndex()).toBe(1);
    for (let index = 2; index < workflowStages.length; index++) await advance(2500);
    expect(stageIndex()).toBe(workflowStages.length - 1);
    expect(button("自动推演")).toBeTruthy();
    expect(node("confirmed-diagnosis")?.dataset.status).toBe("confirmed");
    await advance(25_000);
    expect(stageIndex()).toBe(workflowStages.length - 1);
    await click("重新推演");
    expect(stageIndex()).toBe(0);
    expect(node("confirmed-diagnosis")).toBeNull();
    expect(button("自动推演")).toBeTruthy();
  });

  it("pauses when the panel collapses and retains the same stage after expansion", async () => {
    await click("自动推演");
    await advance(5000);
    expect(stageIndex()).toBe(1);
    await click("收起模块");
    expect(host.querySelector('[data-testid="diagnostic-canvas"]')).toBeNull();
    await advance(50_000);
    await click("展开模块");
    expect(stageIndex()).toBe(1);
    expect(button("自动推演")).toBeTruthy();
    await advance(5000);
    expect(stageIndex()).toBe(1);
  });

  it("exposes zoom, fit, height, and fullscreen controls without resetting the stage", async () => {
    await goTo(2);
    await click("缩小画布");
    await click("放大画布");
    expect(button("跟随进展")).toBeTruthy();
    await click("查看完整工作流");
    await advance(0);
    expect(viewport.zoomOut).toHaveBeenCalledOnce();
    expect(viewport.zoomIn).toHaveBeenCalledOnce();
    expect(viewport.fitView).toHaveBeenCalledWith(expect.objectContaining({ minZoom: 0.12, maxZoom: 1 }));
    expect(button("全部路径").getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector('button[aria-label="跟随进展"]')).toBeNull();
    expect(host.querySelector('[aria-label="工作流全局导航"]')).toBeNull();
    await click("显示缩略图");
    expect(host.querySelector('[aria-label="工作流全局导航"]')).not.toBeNull();
    expect(button("显示缩略图").getAttribute("aria-pressed")).toBe("true");
    const panel = host.querySelector<HTMLElement>('[aria-label="动态诊断工作流"]')!;
    await click("增大模块高度");
    expect(panel.style.getPropertyValue("--dw-body-height")).toBe("690px");
    await click("减小模块高度");
    expect(panel.style.getPropertyValue("--dw-body-height")).toBe("600px");
    const previousOverflow = document.body.style.overflow;
    await click("全屏展开");
    expect(button("退出全屏")).toBeTruthy();
    expect(document.body.style.overflow).toBe("hidden");
    expect(button("增大模块高度").disabled).toBe(true);
    await click("退出全屏");
    expect(button("全屏展开")).toBeTruthy();
    expect(document.body.style.overflow).toBe(previousOverflow);
    expect(stageIndex()).toBe(2);
  });
});
