// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceTour } from "./WorkspaceTour";
import { TOUR_DURATION_MS, TOUR_TIMING } from "../../lib/demo/workspace-tour";
import { getWorkflowSnapshot } from "../../lib/pbl/diagnostic-workflow";

let host: HTMLDivElement;
let root: Root;
let now: number;
let rafId: number;
let callbacks: Map<number, FrameRequestCallback>;

beforeEach(async () => {
  now = 0;
  rafId = 0;
  callbacks = new Map();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callbacks.set(++rafId, callback); return rafId; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("The replay must not call the live API"); }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<WorkspaceTour />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function button(label: string) {
  const match = [...host.querySelectorAll<HTMLButtonElement>("button")].find(item => item.getAttribute("aria-label") === label || item.textContent?.includes(label));
  if (!match) throw new Error(`Button missing: ${label}`);
  return match;
}

async function click(label: string) { await act(async () => button(label).click()); }

async function advance(ms: number) {
  await act(async () => {
    now += ms;
    const pending = [...callbacks.values()];
    callbacks.clear();
    pending.forEach(callback => callback(now));
  });
}

function position() { return Number(host.querySelector<HTMLInputElement>('input[aria-label="演示播放进度"]')!.value); }

async function seek(ms: number) {
  const range = host.querySelector<HTMLInputElement>('input[aria-label="演示播放进度"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(range, String(ms));
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("workspace tour playback controls", () => {
  it("renders synchronized PBL cards, supports inspection and distinguishes paused AI animation", async () => {
    await seek(TOUR_TIMING.firstGenerationStart + 8000);
    expect(host.querySelector('[aria-label="第 1 轮智能体思考演示"]')).not.toBeNull();
    expect(host.querySelectorAll('.tour-orbit-letter')).toHaveLength(10);
    expect(host.querySelector('.tour-orbit-letter.is-scanning')).not.toBeNull();
    expect(host.querySelector('.tour-generation-activity')?.textContent).toContain('正在思考逐项复核各类病因');
    expect(host.querySelector('.tour-generation-activity')?.textContent).not.toMatch(/[a-z]/i);
    expect(host.querySelector('.tour-candidate-skeletons')).toBeNull();
    expect(host.querySelector('.workspace-tour')?.classList.contains('is-paused')).toBe(true);
    await click('播放演示');
    expect(host.querySelector('.workspace-tour')?.classList.contains('is-playing')).toBe(true);
    await seek(TOUR_TIMING.evidenceSubmitted);
    const snapshot = getWorkflowSnapshot(1);
    for (const card of host.querySelectorAll<HTMLElement>('[data-pbl-node-id]')) {
      const source = snapshot.nodes.find(node => node.id === card.dataset.pblNodeId)!;
      expect(card.textContent).toContain(source.title);
      expect(card.textContent).toContain(source.summary);
    }
    const card = host.querySelector<HTMLButtonElement>('[data-pbl-node-id="reflux-history"]')!;
    await act(async () => card.click());
    expect(host.querySelector('[aria-label="PBL 方框详情"]')?.getAttribute('data-selected-node-id')).toBe('reflux-history');
    await click('下一个 PBL 方框');
    expect(host.querySelector('[aria-label="PBL 方框详情"]')?.getAttribute('data-selected-node-id')).not.toBe('reflux-history');
    await seek(TOUR_TIMING.thirdConfirmed);
    expect(host.querySelector('[data-pbl-node-id="confirmed-diagnosis"]')).not.toBeNull();
    await seek(TOUR_TIMING.firstCandidates);
    expect(host.querySelector('[data-pbl-node-id="confirmed-diagnosis"]')).toBeNull();
    expect(host.textContent).not.toMatch(/PBL-GI-OBS-01|PBL-CT-01|急性加重|无创通气|\?{3}/);
  });

  it("starts typing, pauses without drifting, and resumes from the same position", async () => {
    expect(host.textContent).toContain("开始观看");
    await click("开始观看");
    await advance(10_000);
    expect(position()).toBe(10_000);
    expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="演示中的患者信息输入"]')!.value).toContain("62 岁男性");
    await click("暂停演示");
    await advance(5_000);
    expect(position()).toBe(10_000);
    await click("播放演示");
    await advance(2_000);
    expect(position()).toBe(12_000);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("seeks both ways, clears later evidence, and keeps all three candidates after choosing", async () => {
    await seek(TOUR_TIMING.evidenceSubmitted);
    expect(host.querySelectorAll(".tour-evidence-item")).toHaveLength(2);
    expect(host.textContent).toContain("0.62");
    await seek(TOUR_TIMING.firstAdditionalSelection);
    expect(position()).toBe(TOUR_TIMING.firstAdditionalSelection);
    expect(host.querySelectorAll(".tour-candidate")).toHaveLength(3);
    expect(host.querySelectorAll(".tour-candidate.is-selected")).toHaveLength(2);
    expect(host.querySelectorAll(".tour-evidence-item")).toHaveLength(1);
    expect(host.textContent).not.toContain("0.62");
    expect(button("播放演示")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("honors speed and chapter navigation, stops at the end, and replays cleanly", async () => {
    await click("开始观看");
    const speed = host.querySelector<HTMLSelectElement>('select[aria-label="播放速度"]')!;
    await act(async () => { speed.value = "2"; speed.dispatchEvent(new Event("change", { bubbles: true })); });
    await advance(5_000);
    expect(position()).toBe(10_000);
    await click("下一章节");
    expect(position()).toBe(TOUR_TIMING.firstGenerationStart);
    expect(button("播放演示")).toBeTruthy();
    await seek(TOUR_DURATION_MS - 1000);
    await click("播放演示");
    await advance(2_000);
    expect(position()).toBe(TOUR_DURATION_MS);
    expect(button("重播演示")).toBeTruthy();
    expect(host.textContent).toContain("播放结束");
    await click("重播演示");
    expect(position()).toBe(0);
    expect(host.querySelectorAll(".tour-evidence-item")).toHaveLength(0);
    expect(host.querySelectorAll(".tour-candidate.is-selected")).toHaveLength(0);
    expect(host.querySelector(".tour-summary")).toBeNull();
    expect(button("暂停演示")).toBeTruthy();
  });

  it("does not hijack keyboard input on the timeline and pauses when hidden", async () => {
    await click("开始观看");
    await advance(5000);
    const range = host.querySelector<HTMLInputElement>('input[aria-label="演示播放进度"]')!;
    await act(async () => range.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true })));
    expect(button("暂停演示")).toBeTruthy();
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" })));
    expect(button("播放演示")).toBeTruthy();
    await click("播放演示");
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await advance(5000);
    expect(position()).toBe(5000);
    expect(button("播放演示")).toBeTruthy();
  });
});
