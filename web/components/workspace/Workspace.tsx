"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { motion, useReducedMotion } from "motion/react";
import { Activity, ArrowRight, Check, ChevronDown, CircleDot, Database, GitBranch, Loader2, Plus, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, STAGES, type Candidate, type Citation, type GraphEvent, type Sample, type Session, type Trace } from "@/lib/workspace";
import "./workspace.css";

type Config = { deepseek_configured: boolean; local_model: string; deepseek_model: string; allow_external_clinical_data: boolean };
type SessionLink = Pick<Session, "id" | "title" | "status" | "provider" | "synthetic">;
type ClinicalFlowNode = Node<{ event: GraphEvent }, "clinical">;

function ClinicalCard({ data }: NodeProps<ClinicalFlowNode>) {
  const e = data.event;
  return <div className="clinical-node"><Handle type="target" position={Position.Left} />
    <div className="node-meta"><span>{e.event_id}</span><span>{e.problem_id} · t{e.clock}</span></div>
    <strong>{e.action_type.replaceAll("_", " ")}</strong><p>{e.relation} · {e.owner}</p>
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
        label: i ? "prior context" : e.relation, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, color: "#7482bd" },
        style: { stroke: "#7482bd", strokeWidth: e.relation === "TRANSFER" ? 2 : 1.2, strokeDasharray: e.relation === "CONSULT" ? "5 4" : undefined },
        labelStyle: { fontSize: 10, fill: "#68738e" } }))) };
  }, [session]);
  return <section className="ws-card trajectory-panel"><div className="ws-card-title"><h2><GitBranch size={16} />Clinical decision trajectory</h2><span>{nodes.length} recorded nodes</span></div>
    <div className="ws-graph"><ReactFlow key={nodes.length} nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: .2, maxZoom: 1 }}
      nodesDraggable={false} nodesConnectable={false} minZoom={.2} onNodeClick={(_, node) => setInspected(node.data.event)}>
      <Background gap={24} color="#eff0f4" /><Controls showInteractive={false} /></ReactFlow>
      {!nodes.length && <div className="ws-graph-empty">Open a patient session to start a trajectory.</div>}</div>
    <div className="ws-legend">CONTINUE · BRANCH · CONSULT · TRANSFER · RETURN <span>RETURN creates a new downstream reassessment.</span></div>
    {inspected && nodes.some(n => n.id === inspected.event_id) && <div className="ws-node-detail"><Button variant="ghost" size="icon" aria-label="Close node details" onClick={() => setInspected(null)}><X size={14} /></Button>
      <strong>{inspected.problem_id} / {inspected.relation}</strong><p>{inspected.rationale}</p><small>Owner: {inspected.owner}{inspected.advisory_specialty ? ` · Advisory: ${inspected.advisory_specialty}` : ""}</small>
      <small>Parents: {inspected.parent_event_ids.join(", ") || "START"}</small></div>}
  </section>;
}

function CitationCard({ citation, supporting }: { citation: Citation; supporting: boolean }) {
  const publicUrl = /^https:\/\//.test(citation.citation);
  return <details className="ws-citation"><summary><Database size={12} /><span>{citation.source}</span><small>{supporting ? "CITED SUPPORT" : "RETRIEVED"}</small><ChevronDown size={12} /></summary>
    <p>{citation.text}</p><dl><dt>Source</dt><dd>{publicUrl ? <a href={citation.citation} target="_blank" rel="noreferrer">Open original source ↗</a> : citation.citation}</dd>
      <dt>Version</dt><dd>{citation.version}</dd><dt>Document / chunk</dt><dd>{citation.document_id} / {citation.chunk_id}</dd><dt>Concept IDs</dt><dd>{citation.concept_ids.join(", ")}</dd>
      <dt>Content SHA-256</dt><dd>{citation.content_sha256}</dd><dt>Retrieved via</dt><dd>{citation.channels.join(" + ")}</dd><dt>Review / type</dt><dd>{citation.review_status ?? citation.kind}</dd><dt>License</dt><dd>{citation.license}</dd></dl></details>;
}

export function Workspace() {
  const reducedMotion = useReducedMotion();
  const [config, setConfig] = useState<Config | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [links, setLinks] = useState<SessionLink[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [trace, setTrace] = useState<Trace[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(true);
  const [title, setTitle] = useState("New patient session");
  const [initial, setInitial] = useState("");
  const [problem, setProblem] = useState("");
  const [synthetic, setSynthetic] = useState(false);
  const [provider, setProvider] = useState("local");
  const [consent, setConsent] = useState(false);
  const [newEvidence, setNewEvidence] = useState("");
  const [releaseAt, setReleaseAt] = useState("");
  const [risk, setRisk] = useState(false);
  const [physician, setPhysician] = useState("local-physician");
  const [reviewNote, setReviewNote] = useState("");
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
        if (saved && sessions.some(s => s.id === saved)) { refresh(saved).then(() => setCreating(false)).catch(e => setError(e.message)); }
      }).catch(e => setError(e.message));
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
      if (["RUN_COMPLETED", "RUN_FAILED", "NODE_FINALIZED", "PHYSICIAN_DECISION", "EVIDENCE_UNLOCKED"].includes(next.type)) refresh(sessionId).catch(e => setError(e.message));
    });
    return () => { stream.close(); setConnected(false); };
  }, [sessionId, refresh]);
  useEffect(() => {
    if (!sessionId || !["running", "reviewing"].includes(session?.status ?? "")) return;
    const timer = setInterval(() => refresh(sessionId).catch(e => setError(e.message)), 5000);
    return () => clearInterval(timer);
  }, [sessionId, session?.status, refresh]);
  useEffect(() => {
    if (localReady) return;
    const timer = setInterval(() => api<{ local_ready: boolean }>("/models/status").then(value => setLocalReady(value.local_ready)).catch(() => {}), 10000);
    return () => clearInterval(timer);
  }, [localReady]);

  async function perform(task: () => Promise<void>) {
    setBusy(true); setError("");
    try { await task(); } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); } finally { setBusy(false); }
  }
  function chooseSample(id: string) {
    const sample = samples.find(c => c.id === id); if (!sample) return;
    setTitle(sample.title); setInitial(sample.text); setProblem(sample.problem); setSynthetic(true);
  }
  async function openSession(id: string) {
    await perform(async () => { setTrace([]); await refresh(id); localStorage.setItem("clintraj.session", id); setCreating(false); setModified(null); });
  }
  const run = session?.runs[0];
  const rec = run?.recommendation;
  const selected = rec?.candidates.find(c => c.candidate_id === rec.selected_candidate_id);
  const pending = session?.status === "awaiting_physician";
  const running = session?.status === "running" || session?.status === "reviewing";
  const canEdit = Boolean(session && !pending && !running && !busy);
  const currentTrace = trace.filter(e => e.run_id === run?.id);
  const agentStatus = (agent: string) => {
    if (agent === "physician_review" && pending) return "active";
    const last = [...currentTrace].reverse().find(e => e.agent === agent && ["AGENT_STARTED", "AGENT_COMPLETED"].includes(e.type));
    return last?.type === "AGENT_STARTED" && running ? "active" : last?.type === "AGENT_COMPLETED" ? "complete" : "idle";
  };
  const citations = [...(run?.bundle?.public ?? []), ...(run?.bundle?.historical ?? [])];
  const supporting = selected ? rec?.candidate_citations[selected.candidate_id] ?? [] : [];

  async function decision(response: "ACCEPT" | "MODIFY" | "REJECT") {
    if (!session || !rec || !run) return;
    await perform(async () => {
      setSession({ ...session, status: "reviewing" });
      try {
      const next = await api<Session>(`/sessions/${session.id}/runs/${run.id}/decision`, {
        recommendation_id: rec.recommendation_id, response, physician_ref: physician,
        rationale: reviewNote || `Physician ${response.toLowerCase()} after reviewing the available evidence.`,
        modified_action: response === "MODIFY" ? modified : null,
      }); setSession(next); setModified(null); setReviewNote("");
      } catch (error) { await refresh(session.id); throw error; }
    });
  }

  return <div className="live-workspace"><a href="#patient-workspace" className="skip-link">Skip to workspace</a>
    <header className="site-header"><a href="/workspace" className="brand">ClinTraj<span>Clinical decision support</span></a><nav><a href="/demo">Trajectory replay</a><span className="ws-version">LOCAL V1</span></nav></header>
    <main id="patient-workspace" className="ws-main"><div className="ws-heading"><div><p className="ws-eyebrow">PHYSICIAN WORKSPACE</p><h1>One decision. In context.</h1><p>Current evidence, clinical expertise, and a trajectory you can inspect.</p></div>
      <Button onClick={() => setCreating(!creating)} variant="outline"><Plus size={15} />New session</Button></div>
    <div className="ws-session-bar"><label>Patient session<select aria-label="Patient session" value={session?.id ?? ""} onChange={e => openSession(e.target.value)}><option value="" disabled>Select a session</option>{links.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
      <div className="ws-service"><Database size={13} />{knowledge ? `${knowledge.chunks.toLocaleString()} knowledge chunks · ${knowledge.historical_cases} source cases` : "Connecting to knowledge stores"}</div>
      <span className="ws-stream"><i className={connected ? "connected" : ""} />{connected ? "Live trace connected" : "Trace awaiting connection"}</span></div>
    {error && <div role="alert" className="ws-alert"><ShieldAlert size={16} />{error}<Button variant="ghost" size="icon" onClick={() => setError("")} aria-label="Dismiss error"><X size={14} /></Button></div>}
    {creating && <form className="ws-card ws-create" onSubmit={e => { e.preventDefault(); perform(async () => {
      const next = await api<Session>("/sessions", { title, evidence: initial, problem, synthetic, provider, external_consent: consent, risk_flags: risk ? ["requires_escalation"] : [] });
      setSession(next); setTrace([]); localStorage.setItem("clintraj.session", next.id); setLinks(await api<SessionLink[]>("/sessions")); setCreating(false); setModified(null);
    }); }}><div className="ws-card-title"><h2>Open a patient session</h2><select aria-label="Load synthetic example" defaultValue="" onChange={e => chooseSample(e.target.value)}><option value="" disabled>Load a synthetic example</option>{samples.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></div>
      <div className="ws-form-grid"><label>Session label<input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} /></label><label>Presenting problem<input required value={problem} onChange={e => setProblem(e.target.value)} /></label>
      <label className="ws-span">Currently available patient information<textarea required rows={4} value={initial} onChange={e => setInitial(e.target.value)} placeholder="Presenting concern, history, examination and available results. Include what is unknown." /></label>
      <label>Model<select aria-label="Model provider" value={provider} onChange={e => setProvider(e.target.value)}><option value="local">Local · {config?.local_model ?? "Ollama / vLLM"}</option><option value="deepseek" disabled={!config?.deepseek_configured}>DeepSeek · {config?.deepseek_model ?? "configure server key"}</option></select></label>
      <div className="ws-checks"><label><input type="checkbox" checked={synthetic} onChange={e => setSynthetic(e.target.checked)} />This contains only synthetic patient data</label><label><input type="checkbox" checked={risk} onChange={e => setRisk(e.target.checked)} />Escalation required</label></div>
      {provider === "deepseek" && <div className="ws-span ws-provider-note">This session sends its visible observations to DeepSeek. Private historical cases are excluded.
        {!synthetic && (config?.allow_external_clinical_data ? <label><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />I authorize sending this session&apos;s clinical data.</label> : <p>Real patient cloud transmission is disabled in server configuration. Select Local or use synthetic data.</p>)}</div>}
      <div className="ws-span ws-form-footer"><span>Physician-facing support. Recommendations require your review.</span><Button disabled={busy || (provider === "deepseek" && !synthetic && !(config?.allow_external_clinical_data && consent))} type="submit">{busy ? <Loader2 className="ws-spin" size={15} /> : <ArrowRight size={15} />}Open session</Button></div></div></form>}

    <div className="ws-columns"><aside className="ws-patient"><section className="ws-card"><div className="ws-card-title"><h2><CircleDot size={16} />Current patient state</h2><span>t{session?.state.clock ?? 0}</span></div>
      <div className="ws-card-body"><div className="ws-patient-name"><h3>{session?.title ?? "No session selected"}</h3>{session && <span className="ws-chip">{session.synthetic ? "SYNTHETIC" : "CLINICAL"} · {session.provider}</span>}</div>
      <h4>Active problems</h4>{session?.state.active_problems.map(p => <div className="ws-problem" key={p.problem_id}><span>{p.problem_id}</span><div><strong>{p.label}</strong><small>Managed by {p.owner}{p.parent_problem_id ? ` · Branch of ${p.parent_problem_id}` : ""}</small></div>
        <button disabled={!canEdit} title="Suspend problem" onClick={() => perform(async () => setSession(await api(`/sessions/${session.id}/problems/${p.problem_id}`, { operation: "suspend", rationale: reviewNote || "Physician suspended this problem pending reassessment." })))}>Suspend</button></div>)}
      {session?.state.suspended_problems.map(p => <div className="ws-problem" key={p.problem_id}><span>{p.problem_id}</span><div><strong>{p.label}</strong><small>Suspended · {p.owner}</small></div><button disabled={!canEdit} onClick={() => perform(async () => setSession(await api(`/sessions/${session.id}/problems/${p.problem_id}`, { operation: "resume", rationale: reviewNote || "Physician resumed this problem for reassessment." })))}>Resume</button></div>)}
      {(session?.state.risk_flags.length ?? 0) > 0 && <div className="ws-risk"><ShieldAlert size={14} /><span>{session?.state.risk_flags.join(" · ")}</span></div>}
      <h4>Available evidence <span>{session?.state.available_evidence.length ?? 0}</span></h4><div className="ws-evidence-list">{session?.state.available_evidence.map((e, i) => <article key={e.evidence_id}><div><span>E{i + 1}</span><small>{e.source} · t{e.available_at}</small></div><p>{e.text}</p></article>)}</div>
      {session?.scheduled_evidence.map(e => <div className="ws-scheduled" key={e.id}><span>Evidence scheduled for t{e.available_at}</span><Button variant="ghost" size="sm" disabled={!canEdit} onClick={() => perform(async () => setSession(await api(`/sessions/${session.id}/unlock`, { clock: Math.max(e.available_at, session.state.clock) })))}>Unlock</Button></div>)}
      <form className="ws-add-evidence" onSubmit={e => { e.preventDefault(); if (!session) return; perform(async () => {
        setSession(await api(`/sessions/${session.id}/evidence`, { text: newEvidence, available_at: releaseAt ? Number(releaseAt) : null, risk_flags: risk ? ["requires_escalation"] : [] })); setNewEvidence(""); setReleaseAt("");
      }); }}><label>New observation<textarea aria-label="New observation" required rows={3} value={newEvidence} onChange={e => setNewEvidence(e.target.value)} disabled={!canEdit} placeholder="Add a result, examination finding, or updated history…" /></label>
        <div className="ws-evidence-controls"><label>Release at<input aria-label="Evidence release time" type="number" min={session?.state.clock ?? 0} value={releaseAt} onChange={e => setReleaseAt(e.target.value)} placeholder="Now" /></label><Button variant="outline" type="submit" disabled={!canEdit || !newEvidence.trim()}><Plus size={13} />Add evidence</Button></div>
      </form></div></section></aside>

    <div className="ws-decision-column"><section className="ws-card ws-recommendation"><div className="ws-card-title"><h2>Next clinical decision</h2><span className="ws-chip">{running ? "RUNNING" : pending ? "AWAITING YOUR REVIEW" : "READY"}</span></div>
      <div className="ws-card-body"><div className="ws-run-row"><p>{running ? "Agents are working from the current visible evidence." : "Generate a recommendation using current observations and retrieved knowledge."}</p>
        <Button disabled={!canEdit} onClick={() => session && perform(async () => { await api(`/sessions/${session.id}/runs`, {}); await refresh(session.id); })}>{running ? <Loader2 size={15} className="ws-spin" /> : <Activity size={15} />}Run next decision</Button></div>
      {provider === "local" && !localReady && !rec && <p className="ws-muted">The local model may still be downloading. Check model-init in Docker; DeepSeek is available for explicitly selected synthetic sessions.</p>}
      {run?.error && <div className="ws-alert" role="status"><ShieldAlert size={15} />{run.error}</div>}
      {rec && <motion.div initial={{ opacity: 0, y: reducedMotion ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} key={rec.recommendation_id}>
        <div className="ws-action-meta"><span>{selected?.action_type ?? "NO ELIGIBLE ACTION"}</span><span>{selected?.relation}</span><span>{selected?.problem_id}</span></div>
        <h3 className="ws-action-title">{selected?.action ?? "The proposed actions need reconsideration."}</h3><h4>Clinical rationale</h4><p className="ws-rationale">{selected?.rationale ?? rec.explanation}</p>
        {selected && <div className="ws-grounding-status">{supporting.length ? `${supporting.length} retrieved source(s) linked to this action` : "No retrieved source directly supports this action; clinician assessment is required."}</div>}
        <div className="ws-findings">{rec.safety_assessments.flatMap(a => a.findings.map((f, i) => <div className="ws-risk" key={`${a.candidate_id}-${i}`}><ShieldAlert size={14} /><p><strong>{f.veto ? "VETO" : "FLAG"} · {a.candidate_id}</strong>{f.explanation}</p></div>))}</div>
        <details className="ws-detail"><summary>Arbitration, differential & uncertainty<ChevronDown size={13} /></summary><p>{rec.explanation}</p><h4>Differential considerations</h4><p>{rec.proposed_differential.join(" · ") || "Not established"}</p>
          <h4>Uncertainty</h4><ul>{rec.uncertainty.map((u, i) => <li key={i}>{u}</li>)}</ul><h4>Comparative assessment</h4>{rec.rankings.map(r => <p key={r.candidate_id}>{r.candidate_id}: ordinal score {r.heuristic_score}; unknown dimensions: {r.unknown_dimensions.join(", ") || "none"}</p>)}
          {rec.specialist_advice.map(a => <p key={a.specialty}><strong>{a.specialty}: </strong>{a.advice}</p>)}</details>
        <div className="ws-review"><h4>Physician review</h4><div className="ws-review-fields"><label>Reviewer<input aria-label="Reviewer" value={physician} onChange={e => setPhysician(e.target.value)} /></label><label>Review note<input aria-label="Review note" value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="Reason for your decision" /></label></div>
        {modified && <div className="ws-modify"><label>Modified action<textarea aria-label="Modified action" rows={3} value={modified.action} onChange={e => setModified({ ...modified, action: e.target.value })} /></label><label>Clinical rationale<textarea aria-label="Modified clinical rationale" rows={2} value={modified.rationale} onChange={e => setModified({ ...modified, rationale: e.target.value })} /></label>
          <div className="ws-form-grid">{(["action_type", "relation"] as const).map(field => <label key={field}>{field === "action_type" ? "Action type" : "Trajectory relation"}<select aria-label={`Modified ${field}`} value={modified[field]} onChange={e => setModified({ ...modified, [field]: e.target.value })}>{(field === "action_type" ? ["ASK_HISTORY", "EXAM", "TEST", "CONSULT", "TRANSFER", "TREATMENT", "PROCEDURE", "PATHOLOGY", "REASSESS", "DISCHARGE_FOLLOWUP"] : ["START", "CONTINUE", "BRANCH", "CONSULT", "TRANSFER", "RETURN"]).map(v => <option key={v}>{v}</option>)}</select></label>)}
          {(["problem_id", "specialty", "new_problem_label", "parent_problem_id", "reintegration_target_id"] as const).map(field => <label key={field}>{field.replaceAll("_", " ")}<input aria-label={`Modified ${field}`} value={modified[field] ?? ""} onChange={e => setModified({ ...modified, [field]: e.target.value || null })} /></label>)}</div>
          <p>Modifications receive fresh grounding, graph validation and independent safety review.</p><Button disabled={busy || !modified.action.trim() || !modified.rationale.trim()} onClick={() => decision("MODIFY")}>{busy && <Loader2 className="ws-spin" size={14} />}Submit modification</Button><Button variant="ghost" onClick={() => setModified(null)}>Cancel</Button></div>}
        {pending && run?.physician_decision ? <div className="ws-review-actions"><p>A saved {run.physician_decision.response} decision is awaiting completion.</p><Button disabled={busy} onClick={() => session && perform(async () => { setSession(await api(`/sessions/${session.id}/runs/${run.id}/decision`, run.physician_decision)); setModified(null); })}>Retry saved decision</Button></div> : !modified && <div className="ws-review-actions"><Button disabled={!pending || busy || !selected || !physician.trim()} onClick={() => decision("ACCEPT")}><Check size={14} />Accept</Button><Button variant="outline" disabled={!pending || busy || !rec.candidates.length} onClick={() => setModified(structuredClone(selected ?? rec.candidates[0]))}>Modify</Button><Button variant="ghost" disabled={!pending || busy || !physician.trim()} onClick={() => decision("REJECT")}><X size={14} />Reject</Button>{busy && <Loader2 className="ws-spin" size={15} />}</div>}
        {run?.physician_decision && !pending && <div className="ws-receipt"><p>{run.physician_decision.response} · {run.status} · {run.physician_decision.rationale}</p>{run.status === "executed" && run.physician_decision.modified_action && <p>Approved modification: {run.physician_decision.modified_action.action}</p>}</div>}</div>
      </motion.div>}
      {!rec && !running && <div className="ws-empty"><Activity size={22} /><p>Your next recommendation will appear here.</p><span>Evidence → problems → knowledge → specialists → safety → physician</span></div>}
      {!!citations.length && <div className="ws-citations"><h4>Public medical knowledge</h4>{citations.filter(c => c.corpus === "public").map(c => <CitationCard key={c.citation_id} citation={c} supporting={supporting.includes(c.citation_id)} />)}
        <h4>Historical case knowledge</h4>{citations.filter(c => c.corpus !== "public").map(c => <CitationCard key={c.citation_id} citation={c} supporting={supporting.includes(c.citation_id)} />)}</div>}
      </div></section><Trajectory key={session?.id ?? "empty"} session={session} /></div></div>

    <section className="ws-card ws-architecture"><div className="ws-card-title"><h2>Multi-agent architecture</h2><span>Live runtime activity</span></div><div className="ws-stages">{STAGES.map(([id, label], index) => <div key={id} className={`ws-stage ${agentStatus(id)}`}><span>{String(index + 1).padStart(2, "0")}</span><strong>{label}</strong><i>{agentStatus(id) === "active" ? <Loader2 size={13} className="ws-spin" /> : agentStatus(id) === "complete" ? <Check size={13} /> : <CircleDot size={12} />}</i></div>)}</div>
      <p className="ws-architecture-note">Specialists are routed from current problems. Clinical graph transitions are validated independently of the agent runtime.</p></section>
    <section className="ws-card ws-trace"><div className="ws-card-title"><h2>Agent activity</h2><span>Structured execution events · {trace.length}</span></div><div className="ws-trace-table" aria-label="Agent execution trace">{trace.length === 0 ? <p className="ws-muted">Events appear as the session progresses.</p> : [...trace].reverse().map(e => <div className={e.type === "SAFETY_WARNING" ? "ws-trace-warning" : ""} key={e.id}><time>{new Date(e.timestamp).toLocaleTimeString()}</time><code>{e.type}</code><span>{e.agent.replaceAll("_", " ")}</span><pre>{JSON.stringify(e.data)}</pre></div>)}</div></section>
    <footer className="ws-footer"><span>ClinTraj · Physician-facing decision support · No autonomous orders</span><span>Uses Human Phenotype Ontology; source version and attribution are preserved in every retrieved record.</span></footer>
    </main></div>;
}
