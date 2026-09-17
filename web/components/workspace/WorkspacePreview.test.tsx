// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { WorkspacePreview } from "./WorkspacePreview";

it("only switches authored snapshots and never enables clinical actions or transport", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetch = vi.fn();
  const eventSource = vi.fn();
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("EventSource", eventSource);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<WorkspacePreview />));
    expect(host.textContent).toContain("界面展示");
    expect(host.querySelectorAll(".ws-candidate")).toHaveLength(3);
    expect(host.textContent).not.toContain("7.29");
    const select = host.querySelector("select")!;
    await act(async () => { select.value = "2"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(host.textContent).toContain("7.29");
    expect(host.querySelectorAll(".ws-candidate")).toHaveLength(3);
    const showForm = [...host.querySelectorAll("button")].find(button => button.textContent?.includes("查看录入界面"))!;
    await act(async () => showForm.click());
    for (const field of host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")) {
      expect(field.readOnly || field.disabled).toBe(true);
    }
    for (const label of ["生成下一步建议", "添加证据", "接受所选", "全部拒绝并自填", "创建会话"]) {
      expect([...host.querySelectorAll("button")].find(button => button.textContent?.includes(label))?.disabled).toBe(true);
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(eventSource).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
