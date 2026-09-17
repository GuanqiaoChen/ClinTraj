import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../../app/api/[...path]/route";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("showcase API boundary", () => {
  it("rejects reading, streaming and running sessions before any upstream request", async () => {
    vi.stubEnv("CLINTRAJ_SHOWCASE_ONLY", "true");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const path of [["sessions"], ["sessions", "example", "events"], ["sessions", "example", "runs"]]) {
      for (const method of ["GET", "POST"] as const) {
        const request = new NextRequest(`http://example.test/api/${path.join("/")}`, { method });
        const result = await (method === "GET" ? GET : POST)(request, { params: Promise.resolve({ path }) });
        expect(result.status).toBe(404);
      }
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves the local live proxy when showcase mode is not enabled", async () => {
    vi.stubEnv("CLINTRAJ_SHOWCASE_ONLY", "false");
    vi.stubEnv("BACKEND_URL", "http://backend.test:8000");
    const fetch = vi.fn().mockResolvedValue(new Response('{"status":"ok"}', { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    const result = await GET(new NextRequest("http://localhost:3000/api/health"), { params: Promise.resolve({ path: ["health"] }) });
    expect(result.status).toBe(200);
    expect(fetch.mock.calls[0][0]).toBe("http://backend.test:8000/api/health");
  });
});
