"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { motion, useReducedMotion } from "motion/react";
import { Activity, ArrowRight, Check, ChevronDown, CircleDot, Database, GitBranch, Loader2, Plus, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, type Candidate, type Citation, type GraphEvent, type Sample, type Session, type Trace } from "@/lib/workspace";
import { FLOW_LABELS, SAMPLE_ZH, uiError, zh } from "@/lib/ui-zh";
import "./workspace.css";

type Config = { deepseek_configured: boolean; local_model: string; deepseek_model: string; allow_external_clinical_data: boolean };
type SessionLink = Pick<Session, "id" | "title" | "status" | "provider" | "synthetic">;
type ClinicalFlowNode = Node<{ event: GraphEvent }, "clinical">;

function ClinicalCard({ data }: NodeProps<ClinicalFlowNode>) {
  const e = data.event;
  return <div className="clinical-node"><Handle type="target" position={Position.Left} />
    <div className="node-meta"><span>{e.event_id}</span><span>{e.problem_id} · 第{e.clock}步</span></div>
    <strong>{zh(e.action_type)}</strong><p>{zh(e.relation)} · {zh(e.owner)}</p>
    <Handle type="source" position={Position.Right} /></div>;
}
const nodeTypes = { clinical: ClinicalCard };

function Trajectory({ session }: { session: Session | null }) {
  const [inspected, setInspected] = useState<GraphEvent | null>(null);
  const { nodes, edges } = useMemo(() => {
    const events = session?.state.clinical_graph ?? [];
    const rows = [...new Set(events.map(e => e.problem_id))];
    return { nodes: events.map((event, i) => ({ id: event.event_id, type: "clinical" as const,
      position: { x: i * 260, y: rows.indexOf(event.problem_id) * 145 }, data: { event } })),
      edges: events.flatMap(e => e.parent_event_ids.map((parent, i) => ({ id: `${parent}-${e.event_id}`, source: parent, target: e.event_id,
        label: i ? "既往上下文" : zh(e.relation), type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, color: "#7482bd" },
        style: { stroke: "#7482bd", strokeWidth: e.relation === "TRANSFER" ? 2 : 1.2, strokeDasharray: e.relation === "CONSULT" ? "5 4" : undefined },
        labelStyle: { fontSize: 10, fill: "#68738e" } }))) };
  }, [session]);
  return <section className="ws-card trajectory-panel"><div className="ws-card-title"><h2><GitBranch size={16} />临床决策轨迹</h2><span>已记录 {nodes.length} 个节点</span></div>
    <div className="ws-graph"><ReactFlow key={nodes.length} nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: .2, maxZoom: 1 }}
      ariaLabelConfig={FLOW_LABELS} aria-label="临床决策轨迹图"
      nodesDraggable={false} nodesConnectable={false} minZoom={.2} onNodeClick={(_, node) => setInspected(node.data.event)}>
      <Background gap={24} color="#eff0f4" /><Controls showInteractive={false} /></ReactFlow>
      {!nodes.length && <div className="ws-graph-empty">打开一个患者会话后，这里会显示决策轨迹。</div>}</div>
    <div className="ws-legend">继续 · 新问题分支 · 会诊 · 转交主管 · 回归主线 <span>回归主线会新建一个向前的重新评估节点。</span></div>
    {inspected && nodes.some(n => n.id === inspected.event_id) && <div className="ws-node-detail"><Button variant="ghost" size="icon" aria-label="关闭节点详情" onClick={() => setInspected(null)}><X size={14} /></Button>
      <strong>{inspected.problem_id} / {zh(inspected.relation)}</strong><p>{inspected.rationale}</p><small>主管团队：{zh(inspected.owner)}{inspected.advisory_specialty ? ` · 会诊专科：${zh(inspected.advisory_specialty)}` : ""}</small>
      <small>上游节点：{inspected.parent_event_ids.join("、") || "无（初始评估）"}</small></div>}
  </section>;
}

function CitationCard({ citation, supporting }: { citation: Citation; supporting: boolean }) {
  const publicUrl = /^https:\/\//.test(citation.citation);
  return <details className="ws-citation"><summary><Database size={12} /><span>{citation.source}</span><small>{supporting ? "已引用" : "已检索"}</small><ChevronDown size={12} /></summary>
    <p>{citation.text}</p><dl><dt>来源</dt><dd>{publicUrl ? <a href={citation.citation} target="_blank" rel="noreferrer">打开原始来源 ↗</a> : citation.citation}</dd>
      <dt>版本</dt><dd>{citation.version}</dd><dt>文档 / 片段</dt><dd>{citation.document_id} / {citation.chunk_id}</dd><dt>概念编号</dt><dd>{citation.concept_ids.join("、")}</dd>
      <dt>内容 SHA-256</dt><dd>{citation.content_sha256}</dd><dt>召回方式</dt><dd>{citation.channels.map(zh).join(" + ")}</dd><dt>审核 / 类型</dt><dd>{zh(citation.review_status ?? citation.kind)}</dd><dt>许可</dt><dd>{citation.license}</dd></dl></details>;
}

export function Workspace() {
  const reducedMotion = useReducedMotion();
  const [config, setConfig] = useState<Config | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [links, setLinks] = useState<SessionLink[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [, setTrace] = useState<Trace[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(true);
  const [title, setTitle] = useState("新建患者会话");
  const [initial, setInitial] = useState("");
  const [problem, setProblem] = useState("");
  const [synthetic, setSynthetic] = useState(false);
  const [provider, setProvider] = useState("local");
  const [consent, setConsent] = useState(false);
  const [newEvidence, setNewEvidence] = useState("");
  const [releaseAt, setReleaseAt] = useState("");
  const [risk, setRisk] = useState(false);
  const [physician, setPhysician] = useState("本地医生");
  const [reviewNote, setReviewNote] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [simulateEvidence, setSimulateEvidence] = useState(true);
  const [modified, setModified] = useState<Candidate | null>(null);
  const [knowledge, setKnowledge] = useState<{ chunks: number; historical_cases: number } | null>(null);
  const [localReady, setLocalReady] = useState(false);

  const refresh = useCallback(async (id: string) => {
    const next = await api<Session>(`/sessions/${id}`); setSession(next); return next;
  }, []);
  useEffect(() => {
    Promise.all([api<Config>("/config"), api<Sample[]>("/synthetic-cases"), api<SessionLink[]>("/sessions"),
      api<{ chunks: number; historical_cases: number }>("/knowledge/status"), api<{ local_ready: boolean }>("/models/status")])
      .then(([cfg, cases, sessions, kb, models]) => { setConfig(cfg); setSamples(cases); setLinks(sessions); setKnowledge(kb); setLocalReady(models.local_ready);
        const saved = localStorage.getItem("clintraj.session");
        if (saved && sessions.some(s => s.id === saved)) { refresh(saved).then(() => setCreating(false)).catch(e => setError(uiError(e.message))); }
      }).catch(e => setError(uiError(e.message)));
  }, [refresh]);
  const sessionId = session?.id;
  useEffect(() => {
    if (!sessionId) return;
    const stream = new EventSource(`/api/sessions/${sessionId}/events`);
    stream.onopen = () => setConnected(true);
    stream.onerror = () => setConnected(false);
    stream.addEventListener("trace", event => {
      const next = JSON.parse((event as MessageEvent).data) as Trace;
      setTrace(previous => previous.some(e => e.id === next.id) ? previous : [...previous, next].slice(-500));
      if (["RUN_COMPLETED", "RUN_FAILED", "NODE_FINALIZED", "PHYSICIAN_DECISION", "EVIDENCE_UNLOCKED", "SIMULATION_COMPLETED"].includes(next.type)) refresh(sessionId).catch(e => setError(uiError(e.message)));
    });
    return () => { stream.close(); setConnected(false); };
  }, [sessionId, refresh]);
  useEffect(() => {
    if (!sessionId || !["running", "reviewing", "simulating"].includes(session?.status ?? "")) return;
    const timer = setInterval(() => refresh(sessionId).catch(e => setError(uiError(e.message))), 5000);
    return () => clearInterval(timer);
  }, [sessionId, session?.status, refresh]);
  useEffect(() => {
    if (localReady) return;
    const timer = setInterval(() => api<{ local_ready: boolean }>("/models/status").then(value => setLocalReady(value.local_ready)).catch(() => {}), 10000);
    return () => clearInterval(timer);
  }, [localReady]);

  async function perform(task: () => Promise<void>) {
    setBusy(true); setError("");
    try { await task(); } catch (e) { setError(uiError(e instanceof Error ? e.message : "Request failed")); } finally { setBusy(false); }
  }
  function chooseSample(id: string) {
    const sample = samples.find(c => c.id === id); if (!sample) return;
    const localized = SAMPLE_ZH[sample.id];
    setTitle(localized?.title ?? sample.title); setInitial(localized?.text ?? sample.text);
    setProblem(localized?.problem ?? sample.problem); setSynthetic(true);
  }
  async function openSession(id: string) {
    await perform(async () => { setTrace([]); await refresh(id); localStorage.setItem("clintraj.session", id); setCreating(false); setModified(null); setSelectedIds([]); });
  }
  const run = session?.runs[0];
  const rec = run?.recommendation;
  const selected = rec?.candidates.find(c => c.candidate_id === rec.selected_candidate_id);
  const pending = session?.status === "awaiting_physician";
  const running = session?.status === "running" || session?.status === "reviewing" || session?.status === "simulating";
  const canEdit = Boolean(session && !pending && !running && !busy);
  const citations = [...(run?.bundle?.public ?? []), ...(run?.bundle?.historical ?? [])];
  const supporting = selected ? rec?.candidate_citations[selected.candidate_id] ?? [] : [];

  async function decision(response: "ACCEPT" | "MODIFY" | "REJECT") {
    if (!session || !rec || !run) return;
    await perform(async () => {
      setSession({ ...session, status: "reviewing" });
      try {
      const next = await api<Session>(`/sessions/${session.id}/runs/${run.id}/decision`, {
        recommendation_id: rec.recommendation_id, response, physician_ref: physician,
        rationale: reviewNote || `医生在查看当前证据后选择了${zh(response)}。`,
        modified_action: response === "MODIFY" ? modified : null,
        selected_candidate_ids: response === "ACCEPT" ? selectedIds : [],
      }); setSession(next); setModified(null); setReviewNote(""); setSelectedIds([]);
      } catch (error) { await refresh(session.id); throw error; }
    });
  }

  return <div className="live-workspace"><a href="#patient-workspace" className="skip-link">跳到工作台</a>
    <header className="site-header"><a href="/workspace" className="brand">ClinTraj<span>临床决策支持</span></a><nav><a href={session ? `/observation?session=${session.id}` : "/observation"}>智能体观察台 ↗</a><a href="/demo">工作台演示</a></nav></header>
    <main id="patient-workspace" className="ws-main"><div className="ws-heading"><div><h1>医生工作台</h1></div>
      <Button onClick={() => setCreating(!creating)} variant="outline"><Plus size={15} />新建会话</Button></div>
    <div className="ws-session-bar"><label>患者会话<select aria-label="患者会话" value={session?.id ?? ""} onChange={e => openSession(e.target.value)}><option value="" disabled>请选择一个会话</option>{links.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
      <div className="ws-service"><Database size={13} />{knowledge ? `知识片段 ${knowledge.chunks.toLocaleString()} 条 · 源病例 ${knowledge.historical_cases} 例` : "正在连接知识库"}</div>
      <span className="ws-stream"><i className={connected ? "connected" : ""} />{connected ? "实时轨迹已连接" : "等待轨迹连接"}</span></div>
    {error && <div role="alert" className="ws-alert"><ShieldAlert size={16} />{error}<Button variant="ghost" size="icon" onClick={() => setError("")} aria-label="关闭提示"><X size={14} /></Button></div>}
    {creating && <form className="ws-card ws-create" onSubmit={e => { e.preventDefault(); perform(async () => {
      const next = await api<Session>("/sessions", { title, evidence: initial, problem, synthetic, simulate_evidence: synthetic && simulateEvidence, provider, external_consent: consent, risk_flags: risk ? ["requires_escalation"] : [] });
      setSession(next); setTrace([]); localStorage.setItem("clintraj.session", next.id); setLinks(await api<SessionLink[]>("/sessions")); setCreating(false); setModified(null); setSelectedIds([]);
    }); }}><div className="ws-card-title"><h2>新建患者会话</h2><select aria-label="载入合成示例" defaultValue="" onChange={e => chooseSample(e.target.value)}><option value="" disabled>载入一个合成示例</option>{samples.map(s => <option key={s.id} value={s.id}>{SAMPLE_ZH[s.id]?.title ?? s.title}</option>)}</select></div>
      <div className="ws-form-grid"><label>会话名称<input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} /></label><label>主诉问题<input required value={problem} onChange={e => setProblem(e.target.value)} /></label>
      <label className="ws-span">当前已掌握的患者信息<textarea required rows={4} value={initial} onChange={e => setInitial(e.target.value)} placeholder="主诉、现病史、查体与已有结果。也请写明目前还不清楚的内容。" /></label>
      <label>模型<select aria-label="模型来源" value={provider} onChange={e => setProvider(e.target.value)}><option value="local">本地 · {config?.local_model ?? "Ollama / vLLM"}</option><option value="deepseek" disabled={!config?.deepseek_configured}>DeepSeek · {config?.deepseek_model ?? "请先在服务端配置密钥"}</option></select></label>
      <div className="ws-checks"><label><input type="checkbox" checked={synthetic} onChange={e => setSynthetic(e.target.checked)} />本会话只包含合成数据</label>{synthetic && <label><input type="checkbox" checked={simulateEvidence} onChange={e => setSimulateEvidence(e.target.checked)} />决策后自动生成模拟证据</label>}<label><input type="checkbox" checked={risk} onChange={e => setRisk(e.target.checked)} />需要升级处置</label></div>
      {provider === "deepseek" && <div className="ws-span ws-provider-note">本会话会把可见的观察信息发送给 DeepSeek，私有历史病例不会外发。
        {!synthetic && (config?.allow_external_clinical_data ? <label><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />我授权发送本会话的临床数据。</label> : <p>服务端已禁止真实患者数据外发，请选择本地模型或改用合成数据。</p>)}</div>}
      <div className="ws-span ws-form-footer"><span>面向医生的辅助工具，所有建议都需要您审核后才能执行。</span><Button disabled={busy || (provider === "deepseek" && !synthetic && !(config?.allow_external_clinical_data && consent))} type="submit">{busy ? <Loader2 className="ws-spin" size={15} /> : <ArrowRight size={15} />}创建会话</Button></div></div></form>}

    <div className="ws-columns"><aside className="ws-patient"><section className="ws-card"><div className="ws-card-title"><h2><CircleDot size={16} />当前患者状态</h2><span>第 {session?.state.clock ?? 0} 步</span></div>
      <div className="ws-card-body"><div className="ws-patient-name"><h3>{session?.title ?? "尚未选择会话"}</h3>{session && <span className="ws-chip">{session.synthetic ? "合成数据" : "临床数据"} · {zh(session.provider)}</span>}</div>
      <h4>进行中的问题</h4>{session?.state.active_problems.map(p => <div className="ws-problem" key={p.problem_id}><span>{p.problem_id}</span><div><strong>{p.label}</strong><small>主管：{zh(p.owner)}{p.parent_problem_id ? ` · 来自 ${p.parent_problem_id} 的分支` : ""}</small></div>
        <button disabled={!canEdit} title="暂停该问题" onClick={() => perform(async () => setSession(await api(`/sessions/${session.id}/problems/${p.problem_id}`, { operation: "suspend", rationale: reviewNote || "医生暂停该问题，等待重新评估。" })))}>暂停</button></div>)}
      {session?.state.suspended_problems.map(p => <div className="ws-problem" key={p.problem_id}><span>{p.problem_id}</span><div><strong>{p.label}</strong><small>已暂停 · {zh(p.owner)}</small></div><button disabled={!canEdit} onClick={() => perform(async () => setSession(await api(`/sessions/${session.id}/problems/${p.problem_id}`, { operation: "resume", rationale: reviewNote || "医生恢复该问题以便重新评估。" })))}>恢复</button></div>)}
      {(session?.state.risk_flags.length ?? 0) > 0 && <div className="ws-risk"><ShieldAlert size={14} /><span>{session?.state.risk_flags.map(zh).join(" · ")}</span></div>}
      <h4>当前可用证据 <span>{session?.state.available_evidence.length ?? 0}</span></h4><div className="ws-evidence-list">{session?.state.available_evidence.map((e, i) => <article key={e.evidence_id}><div><span>E{i + 1}</span><small>{e.synthetic ? "模拟证据" : zh(e.source)} · 第{e.available_at}步</small></div><p>{e.text}</p></article>)}</div>
      {session?.scheduled_evidence.map(e => <div className="ws-scheduled" key={e.id}><span>该证据将在第 {e.available_at} 步解锁</span><Button variant="ghost" size="sm" disabled={!canEdit} onClick={() => perform(async () => setSession(await api(`/sessions/${session.id}/unlock`, { clock: Math.max(e.available_at, session.state.clock) })))}>立即解锁</Button></div>)}
      <form className="ws-add-evidence" onSubmit={e => { e.preventDefault(); if (!session) return; perform(async () => {
        setSession(await api(`/sessions/${session.id}/evidence`, { text: newEvidence, available_at: releaseAt ? Number(releaseAt) : null, risk_flags: risk ? ["requires_escalation"] : [] })); setNewEvidence(""); setReleaseAt("");
      }); }}><label>新增观察信息<textarea aria-label="新增观察信息" required rows={3} value={newEvidence} onChange={e => setNewEvidence(e.target.value)} disabled={!canEdit} placeholder="补充检查结果、查体发现或更新的病史……" /></label>
        <div className="ws-evidence-controls"><label>解锁时间<input aria-label="证据解锁时间" type="number" min={session?.state.clock ?? 0} value={releaseAt} onChange={e => setReleaseAt(e.target.value)} placeholder="立即" /></label><Button variant="outline" type="submit" disabled={!canEdit || !newEvidence.trim()}><Plus size={13} />添加证据</Button></div>
      </form></div></section></aside>

    <div className="ws-decision-column"><section className="ws-card ws-recommendation"><div className="ws-card-title"><h2>下一步临床决策</h2><span className="ws-chip">{session?.status === "simulating" ? "模拟证据生成中" : running ? "生成中" : pending ? "待您审核" : "就绪"}</span></div>
      <div className="ws-card-body"><div className="ws-run-row"><p>{session?.status === "simulating" ? "正在根据已采用的决策生成下一轮模拟观察。" : running ? "正在处理。任务详情可在智能体观察台查看。" : "每步提供三个候选，可接受一个或多个，也可自行输入。"}</p>
        <Button disabled={!canEdit} onClick={() => session && perform(async () => { await api(`/sessions/${session.id}/runs`, {}); await refresh(session.id); })}>{running ? <Loader2 size={15} className="ws-spin" /> : <Activity size={15} />}生成下一步建议</Button></div>
      {provider === "local" && !localReady && !rec && <p className="ws-muted">本地模型可能仍在下载，请检查 Docker 中的 model-init；已明确选择合成数据的会话也可以使用 DeepSeek。</p>}
      {rec && <motion.div initial={{ opacity: 0, y: reducedMotion ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} key={rec.recommendation_id}>
        {rec.generation_mode === "degraded" && <p className="ws-muted">本轮包含限时备用方案。</p>}
        <div className="ws-candidate-grid">{rec.candidates.map((candidate, index) => <label key={candidate.candidate_id} className={`ws-candidate ${selectedIds.includes(candidate.candidate_id) ? "chosen" : ""}`}>
          <div className="ws-candidate-top"><span>方案 {String(index + 1).padStart(2, "0")}</span><input type="checkbox" aria-label={`选择方案${index + 1}`} checked={selectedIds.includes(candidate.candidate_id)} disabled={!pending || busy} onChange={e => setSelectedIds(ids => e.target.checked ? [...ids, candidate.candidate_id] : ids.filter(id => id !== candidate.candidate_id))} /></div>
          <h3>{candidate.action}</h3><p>{candidate.rationale}</p><small>{zh(candidate.action_type)} · {zh(candidate.relation)}</small>
          <span className="ws-candidate-source">{rec.candidate_citations[candidate.candidate_id]?.length ?? 0} 条来源</span>
        </label>)}</div>
        <details className="ws-detail"><summary>鉴别方向与专科意见<ChevronDown size={13} /></summary><p>{rec.proposed_differential.join(" · ") || "待补充信息"}</p>
          {rec.specialist_advice.map(a => <p key={a.specialty}><strong>{zh(a.specialty)}?</strong>{a.advice}</p>)}</details>
        <div className="ws-review"><h4>医生审核</h4><div className="ws-review-fields"><label>审核人<input aria-label="审核人" value={physician} onChange={e => setPhysician(e.target.value)} /></label><label>审核意见<input aria-label="审核意见" value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="填写做出该决定的理由" /></label></div>
        {modified && <div className="ws-modify"><label>医生自主决策<textarea aria-label="医生自主决策" rows={3} value={modified.action} onChange={e => setModified({ ...modified, action: e.target.value })} /></label><label>临床理由<textarea aria-label="自主决策理由" rows={2} value={modified.rationale} onChange={e => setModified({ ...modified, rationale: e.target.value })} /></label>
          <div className="ws-form-grid">{(["action_type", "relation"] as const).map(field => <label key={field}>{zh(field)}<select aria-label={`修改${zh(field)}`} value={modified[field]} onChange={e => setModified({ ...modified, [field]: e.target.value })}>{(field === "action_type" ? ["ASK_HISTORY", "EXAM", "TEST", "CONSULT", "TRANSFER", "TREATMENT", "PROCEDURE", "PATHOLOGY", "REASSESS", "DISCHARGE_FOLLOWUP"] : ["START", "CONTINUE", "BRANCH", "CONSULT", "TRANSFER", "RETURN"]).map(v => <option key={v} value={v}>{zh(v)}</option>)}</select></label>)}
          {(["problem_id", "specialty", "new_problem_label", "parent_problem_id", "reintegration_target_id"] as const).map(field => <label key={field}>{zh(field)}<input aria-label={`修改${zh(field)}`} value={modified[field] ?? ""} onChange={e => setModified({ ...modified, [field]: e.target.value || null })} /></label>)}</div>
          <p>提交后记录您的决定，继续下一步。</p><Button disabled={!pending || busy || !physician.trim() || !modified.action.trim() || !modified.rationale.trim()} onClick={() => decision("MODIFY")}>{busy && <Loader2 className="ws-spin" size={14} />}提交自主决策</Button><Button variant="ghost" onClick={() => setModified(null)}>取消</Button></div>}
        {pending && run?.physician_decision ? <div className="ws-review-actions"><p>已保存一个{zh(run.physician_decision.response)}决定，等待完成处理。</p><Button disabled={busy} onClick={() => session && perform(async () => { setSession(await api(`/sessions/${session.id}/runs/${run.id}/decision`, run.physician_decision)); setModified(null); })}>重试已保存的决定</Button></div> : !modified && <div className="ws-review-actions"><Button disabled={!pending || busy || !selectedIds.length || !physician.trim()} onClick={() => decision("ACCEPT")}><Check size={14} />接受所选{selectedIds.length ? `（${selectedIds.length}）` : ""}</Button><Button variant="outline" disabled={!pending || busy || !rec.candidates.length} onClick={() => setModified({ ...structuredClone(selected ?? rec.candidates[0]), candidate_id: "physician-custom", action: "", rationale: "医生依据当前证据自主决策。", action_type: "REASSESS", relation: "CONTINUE", specialty: null, new_problem_label: null, parent_problem_id: null, reintegration_target_id: null, contraindications: [], prerequisites: [], uncertainty: [] })}>全部拒绝并自填</Button><Button variant="ghost" disabled={!pending || busy || !physician.trim()} onClick={() => decision("REJECT")}><X size={14} />全部拒绝</Button>{busy && <Loader2 className="ws-spin" size={15} />}</div>}
        {run?.physician_decision && !pending && <div className="ws-receipt"><p>{zh(run.physician_decision.response)} · {zh(run.status)} · {run.physician_decision.rationale}</p>{run.status === "executed" && run.physician_decision.modified_action && <p>已批准的修改：{run.physician_decision.modified_action.action}</p>}</div>}</div>
      </motion.div>}
      {!rec && !running && <div className="ws-empty"><Activity size={22} /><p>三个候选方案将显示在这里。</p><span>选择方案，或输入您自己的决策</span></div>}
      {!!citations.length && <div className="ws-citations"><h4>公共医学知识</h4>{citations.filter(c => c.corpus === "public").map(c => <CitationCard key={c.citation_id} citation={c} supporting={supporting.includes(c.citation_id)} />)}
        <h4>历史病例知识</h4>{citations.filter(c => c.corpus !== "public").map(c => <CitationCard key={c.citation_id} citation={c} supporting={supporting.includes(c.citation_id)} />)}</div>}
      </div></section><Trajectory key={session?.id ?? "empty"} session={session} /></div></div>

    <footer className="ws-footer"><span>ClinTraj · 面向医生的临床决策支持 · 不自动下达任何医嘱</span><span>使用人类表型本体（HPO）；每条检索记录都保留来源版本与署名信息。</span></footer>
    </main></div>;
}
