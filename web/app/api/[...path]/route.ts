import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin && !["http://localhost:3000", "http://127.0.0.1:3000"].includes(origin)) {
    return Response.json({ detail: "Origin is not allowed" }, { status: 403 });
  }
  const headers = new Headers();
  for (const name of ["content-type", "last-event-id", "origin"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const upstream = await fetch(`${process.env.BACKEND_URL ?? "http://127.0.0.1:8000"}/api/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`, {
      method: request.method, headers, cache: "no-store", signal: request.signal,
      body: request.method === "GET" ? undefined : await request.text(),
    });
    return new Response(upstream.body, { status: upstream.status, headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no",
    } });
  } catch {
    return Response.json({ detail: "Backend unavailable. Check docker compose logs backend." }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
