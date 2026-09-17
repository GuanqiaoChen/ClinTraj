// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceTour } from "./WorkspaceTour";
import { TOUR_DURATION_MS, TOUR_TIMING } from "../../lib/demo/workspace-tour";

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
  it("starts typing, pauses without drifting, and resumes from the same position", async () => {
    expect(host.textContent).toContain("开始观看");
    await click("开始观看");
    await advance(10_000);
    expect(position()).toBe(10_000);
    expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="演示中的患者信息输入"]')!.value).toContain("合成病例");
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
    expect(host.textContent).toContain("7.29");
    await seek(TOUR_TIMING.firstAdditionalSelection);
    expect(position()).toBe(TOUR_TIMING.firstAdditionalSelection);
    expect(host.querySelectorAll(".tour-candidate")).toHaveLength(3);
    expect(host.querySelectorAll(".tour-candidate.is-selected")).toHaveLength(2);
    expect(host.querySelectorAll(".tour-evidence-item")).toHaveLength(1);
    expect(host.textContent).not.toContain("7.29");
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
