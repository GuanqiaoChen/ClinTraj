"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Background, Controls, MarkerType, Position, ReactFlow } from "@xyflow/react";
import { Activity, Radio, ShieldAlert } from "lucide-react";
import { api, type Session, type Trace } from "@/lib/workspace";
import { FLOW_LABELS, findingText, traceText, uiError, zh } from "@/lib/ui-zh";
import "./workspace.css";

type Profiles = Record<string, { label: string }>;

export function Observation() {
  const [sessions, setSessions] = useState<Pick<Session, "id" | "title">[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [runId, setRunId] = useState("");
  const [events, setEvents] = useState<Trace[]>([]);
  const [connected, setConnected] = useState(false);
  const [warningsOnly, setWarningsOnly] = useState(false);
  const [error, setError] = useState("");
  const [profiles, setProfiles] = useState<Profiles>({ copd: { label: "慢阻肺专科" }, oncology: { label: "肿瘤专科" }, pneumonia: { label: "肺炎专科" } });
  const refresh = useCallback((id: string) => api<Session>(`/sessions/${id}`).then(setSession), []);
  useEffect(() => {
    api<Session[]>("/sessions").then(items => {
      setSessions(items);
      const requested = new URLSearchParams(window.location.search).get("session") || localStorage.getItem("clintraj.session");
      setSessionId(items.find(s => s.id === requested)?.id ?? items[0]?.id ?? "");
    }).catch(e => setError(uiError(e.message)));
    api<{specialists: {specialists: Profiles}}>("/config").then(cfg => setProfiles(cfg.specialists.specialists)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!sessionId) return;
    refresh(sessionId).catch(e => setError(uiError(e.message)));
    const stream = new EventSource(`/api/sessions/${sessionId}/events`);
    stream.onopen = () => setConnected(true);
    stream.onerror = () => setConnected(false);
    stream.addEventListener("trace", event => {
      const next = JSON.parse((event as MessageEvent).data) as Trace;
      setEvents(rows => rows.some(r => r.id === next.id) ? rows : [...rows, next].slice(-2000));
      if (["RUN_COMPLETED", "PHYSICIAN_DECISION", "RUN_FAILED", "SIMULATION_COMPLETED"].includes(next.type)) refresh(sessionId).catch(() => {});
    });
    const timer = setInterval(() => refresh(sessionId).catch(() => {}), 5000);
    return () => { stream.close(); clearInterval(timer); setConnected(false); };
  }, [sessionId, refresh]);
  const run = session?.runs.find(r => r.id === runId) ?? session?.runs[0];
  const current = useMemo(() => events.filter(e => e.run_id === run?.id), [events, run?.id]);
  const graph = useMemo(() => {
    const specialistIds = Object.keys(profiles);
    const center = Math.max(110, (specialistIds.length - 1) * 55);
    const stages: [string, string, number, number][] = [
      ["triage", "全科主分诊", 0, center], ["retrieval", "共享知识库与图谱", 250, center],
      ...specialistIds.map((id, i): [string, string, number, number] => [id, profiles[id].label, 500, i * 110]),
      ["action_generator", "三个候选决策", 750, center], ["physician_review", "医生自主选择", 1000, center],
      ["safety_critic", "异步规则审计", 750, center + 170], ["evidence_simulator", "模拟证据生成", 1250, center],
    ];
    const routed = current.find(e => e.type === "ROUTING_COMPLETED")?.data.specialties as string[] | undefined;
    const status = (id: string) => {
      const last = [...current].reverse().find(e => e.agent === id);
      if (id === "physician_review" && run?.status === "awaiting_physician") return "等待医生";
      if (last?.type === "SAFETY_WARNING") return "已记录审计";
      if (last?.type === "AGENT_STARTED") return "运行中";
      if (last) return "已完成";
      return specialistIds.includes(id) && routed && !routed.includes(id) ? "本轮未调用" : "待运行";
    };
    return {
      nodes: stages.map(([id, label, x, y]) => ({ id, position: { x, y }, sourcePosition: Position.Right, targetPosition: Position.Left,
        data: { label: <div><strong>{label}</strong><span className="obs-node-status">{status(id)}</span></div> },
        style: { width: 210, padding: 18, fontSize: 16, border: `1.5px solid ${status(id) === "运行中" ? "#111" : "#889099"}`,
          borderRadius: 9, background: status(id) === "运行中" ? "#e9ebee" : "#fff", color: "#17191c" } })),
      edges: [["triage", "retrieval"], ["retrieval", "action_generator"], ...specialistIds.flatMap(s => [["retrieval", s], [s, "action_generator"]]),
        ["action_generator", "physician_review"], ["action_generator", "safety_critic"], ["physician_review", "evidence_simulator"]].map(([source, target]) => ({
          id: `${source}-${target}`, source, target, ariaLabel: `${profiles[source]?.label ?? zh(source)} 到 ${profiles[target]?.label ?? zh(target)}`, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, color: "#59616a" },
          style: { stroke: "#59616a", strokeWidth: 1.6, strokeDasharray: target === "safety_critic" ? "5 4" : undefined } })),
    };
  }, [current, run?.status, profiles]);
  const shown = (warningsOnly ? current.filter(e => e.type === "SAFETY_WARNING") : current).slice().reverse();
  const rec = run?.recommendation;
  return <div className="live-workspace"><header className="site-header"><a className="brand" href="/workspace">ClinTraj<span>智能体观察台</span></a><nav><a href="/workspace">返回医生工作台 ↗</a></nav></header>
    <main className="ws-main"><div className="ws-heading"><div><h1>任务观察</h1><p>主分诊、检索、专科协作与规则审计</p></div><span className="obs-connection"><Radio size={16} />{connected ? "实时连接" : "正在连接"}</span></div>
      <div className="ws-session-bar"><label>患者会话<select aria-label="观察会话" value={sessionId} onChange={e => { setSession(null); setEvents([]); setRunId(""); setSessionId(e.target.value); }}><option value="" disabled>选择会话</option>{sessions.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
        <label>运行记录<select aria-label="观察运行" value={run?.id ?? ""} onChange={e => setRunId(e.target.value)}><option value="" disabled>尚无运行</option>{session?.runs.map((r, i) => <option key={r.id} value={r.id}>第 {session.runs.length - i} 轮 · {zh(r.status)}</option>)}</select></label></div>
      {error && <p className="ws-alert">{error}</p>}
      <div className="obs-metrics"><div><span>候选决策</span><strong>{rec?.candidates.length ?? "—"}<small> / 3</small></strong></div><div><span>生成用时</span><strong>{rec ? (rec.elapsed_ms / 1000).toFixed(1) : "—"}<small> 秒</small></strong></div><div><span>审计记录</span><strong>{current.filter(e => e.type === "SAFETY_WARNING").length}</strong></div><div><span>工作流引擎</span><strong>LangGraph</strong><small>原生流事件 · 持久化检查点</small></div></div>
      <section className="ws-card"><div className="ws-card-title"><h2><Activity size={18} />智能体协作轨迹</h2><span>规则意见不阻断医生选择</span></div><div className="obs-graph"><ReactFlow nodes={graph.nodes} edges={graph.edges} fitView fitViewOptions={{ padding: .16 }} nodesDraggable={false} nodesConnectable={false} ariaLabelConfig={FLOW_LABELS}><Background gap={26} color="#d4d7db" /><Controls showInteractive={false} /></ReactFlow></div></section>
      {run?.error && <div className="ws-alert"><ShieldAlert size={18} />{uiError(run.error)}</div>}
      <section className="ws-card"><div className="ws-card-title"><h2>执行事件</h2><label className="obs-filter"><input type="checkbox" checked={warningsOnly} onChange={e => setWarningsOnly(e.target.checked)} />仅查看审计</label></div>
        <div className="obs-timeline">{!shown.length && <p className="ws-muted">本轮事件将在此实时出现。</p>}{shown.map(e => <details key={e.id} className={e.type === "SAFETY_WARNING" ? "obs-warning" : ""}><summary><time>{new Date(e.timestamp).toLocaleTimeString("zh-CN")}</time><strong>{zh(e.agent)}</strong><span>{zh(e.type)}</span></summary>
          {e.type === "SAFETY_WARNING" && <p>{findingText(String(e.data.code ?? ""), String(e.data.explanation ?? ""))}{e.data.would_veto === true ? "（原规则会否决；当前仅记录）" : ""}</p>}<pre>{traceText(e.data)}</pre></details>)}</div></section>
      {run?.bundle && <section className="ws-card"><div className="ws-card-title"><h2>检索与排序依据</h2><span>共享语料 · 按专科任务排序</span></div><div className="ws-card-body"><pre className="obs-json">{traceText(run.bundle.retrieval_metadata ?? {})}</pre>
        {[...run.bundle.public, ...run.bundle.historical].map(c => <details className="ws-citation" key={c.citation_id}><summary><span>{c.source}</span><small>{c.channels.map(zh).join(" · ")}</small></summary><p>{c.text}</p><pre className="obs-json">{traceText({ score: c.score, score_breakdown: c.score_breakdown, facets: c.facets, citation_id: c.citation_id })}</pre></details>)}
        <details className="ws-detail"><summary>本轮检索限制</summary>{run.bundle.limitations.map((s, i) => <p key={i}>{zh(s)}</p>)}</details></div></section>}
    </main></div>;
}
