import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const origin = request.headers.get("origin");
  const allowedOrigins = [request.nextUrl.origin, process.env.PUBLIC_ORIGIN, "http://localhost:3000", "http://127.0.0.1:3000"];
  if (origin && !allowedOrigins.includes(origin)) {
    return Response.json({ detail: "请求来源不被允许，请从工作台访问。" }, { status: 403 });
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
    return Response.json({ detail: "后端服务不可用，请检查 docker compose logs backend。" }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
