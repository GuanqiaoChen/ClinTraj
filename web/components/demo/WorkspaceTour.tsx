"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Activity, ArrowDown, ArrowLeft, ArrowRight, BookOpen, Check, CheckCheck,
  ChevronRight, CircleDot, ClipboardCheck, FileText, GitBranch, Maximize2,
  Minimize2, MousePointer2, Pause, Play, Plus, RotateCcw, SkipBack, SkipForward,
  Stethoscope, UserRound,
} from "lucide-react";
import {
  getTourFrame, TOUR_CASE, TOUR_CHAPTERS, TOUR_DURATION_MS, TOUR_SOURCES, TOUR_TIMING,
} from "@/lib/demo/workspace-tour";
import "./workspace-tour.css";

type TourFrame = ReturnType<typeof getTourFrame>;

function clock(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function useTourPlayer() {
  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timeRef = useRef(0);

  const seek = useCallback((next: number) => {
    const clamped = Math.min(TOUR_DURATION_MS, Math.max(0, next));
    timeRef.current = clamped;
    setTimeMs(clamped);
    setPlaying(false);
  }, []);
  const replay = useCallback(() => {
    timeRef.current = 0;
    setTimeMs(0);
    setPlaying(true);
  }, []);
  const toggle = useCallback(() => {
    if (timeRef.current >= TOUR_DURATION_MS) {
      timeRef.current = 0;
      setTimeMs(0);
      setPlaying(true);
    } else setPlaying(value => !value);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let previous = performance.now();
    let lastPaint = previous;
    const tick = (now: number) => {
      timeRef.current = Math.min(TOUR_DURATION_MS, timeRef.current + (now - previous) * speed);
      previous = now;
      if (now - lastPaint >= 60 || timeRef.current >= TOUR_DURATION_MS) {
        setTimeMs(timeRef.current);
        lastPaint = now;
      }
      if (timeRef.current >= TOUR_DURATION_MS) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const visibility = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener("visibilitychange", visibility);
    return () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", visibility); };
  }, [playing, speed]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, button, a, [contenteditable=true], [role=slider]")) return;
      if (event.code === "Space") { event.preventDefault(); toggle(); }
      if (event.code === "ArrowLeft") { event.preventDefault(); seek(timeRef.current - 5000); }
      if (event.code === "ArrowRight") { event.preventDefault(); seek(timeRef.current + 5000); }
      if (event.key.toLowerCase() === "r") { event.preventDefault(); replay(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, seek, replay]);

  return { timeMs, playing, speed, setSpeed, seek, replay, toggle };
}

function Pointer({ label = "医生操作" }: { label?: string }) {
  return <span className="tour-pointer" aria-hidden="true"><MousePointer2 size={22} fill="currentColor" /><span>{label}</span></span>;
}

function PanelTitle({ icon, title, detail }: { icon: ReactNode; title: string; detail?: string }) {
  return <div className="tour-panel-title"><h3>{icon}{title}</h3>{detail && <span>{detail}</span>}</div>;
}

function PatientPanel({ frame }: { frame: TourFrame }) {
  const enteringEvidence = frame.phase === "evidence";
  return <aside className={`tour-patient ${enteringEvidence ? "is-active" : ""}`}>
    <PanelTitle icon={<UserRound size={16} />} title="当前患者状态" detail={`第 ${frame.round} 轮`} />
    <div className="tour-patient-body">
      <div className="tour-patient-identity"><span className="tour-avatar"><UserRound size={23} /></span><div><strong>慢阻肺急性加重</strong><span>{TOUR_CASE.patientLabel}</span></div></div>
      <div className="tour-problem"><span>P1</span><div><strong>{TOUR_CASE.problem}</strong><small>主管团队：呼吸与危重症医学科</small></div></div>
      <div className="tour-evidence-heading"><h4>当前可用证据</h4><span>{frame.visibleEvidence.length} 条</span></div>
      <div className="tour-evidence-list">
        {frame.visibleEvidence.map((evidence, index) => <article key={evidence.id} className="tour-evidence-item">
          <div><span>E{index + 1}</span><strong>{evidence.title}</strong><small>合成</small></div><p>{evidence.text}</p>
        </article>)}
        {!frame.visibleEvidence.length && <div className="tour-evidence-empty"><FileText size={22} /><p>先录入患者信息</p><span>新证据将在录入后显示</span></div>}
      </div>
      {enteringEvidence && frame.timeMs < TOUR_TIMING.evidenceSubmitted && <div className="tour-evidence-entry tour-focus">
        <label htmlFor="tour-evidence">新增观察信息</label>
        <textarea id="tour-evidence" readOnly tabIndex={-1} rows={5} value={frame.evidenceDraft} placeholder="补充复查血气、查体与病情变化……" />
        <div className="tour-evidence-entry-footer"><span>解锁时间 · 立即</span><span className={`tour-action ${frame.evidenceInputProgress >= 1 ? "is-active" : ""}`}><Plus size={13} />添加证据</span></div>
        <Pointer label={frame.evidenceInputProgress < 1 ? "录入新证据" : "提交证据"} />
      </div>}
      {enteringEvidence && frame.timeMs >= TOUR_TIMING.evidenceSubmitted && <div className="tour-receipt"><Check size={14} /><span>新证据已录入 · 当前可用证据 2 条</span></div>}
      {!enteringEvidence && frame.sessionCreated && <div className="tour-next-evidence"><Plus size={14} /><span>{frame.round === 1 ? "等待本轮决策后的新观察" : "新证据已纳入本轮评估"}</span></div>}
      <div className="tour-synthetic-note"><CircleDot size={12} />独立合成会话 · 不写入真实工作台</div>
    </div>
  </aside>;
}

function Intake({ frame }: { frame: TourFrame }) {
  return <div className="tour-intake-form">
    <div className="tour-intake-heading"><span className="tour-step-marker">01</span><div><h3>新建患者会话</h3><p>从患者此刻的信息开始。</p></div><span className="tour-small-tag">合成示例</span></div>
    <div className="tour-form-grid">
      <label>会话名称<input readOnly tabIndex={-1} value={frame.timeMs > 1500 ? "慢阻肺急性加重 · 演示病例" : ""} placeholder="输入会话名称" /></label>
      <label>主诉问题<input readOnly tabIndex={-1} value={frame.timeMs > 3500 ? "气促加重 3 天" : ""} placeholder="本轮需要解决的问题" /></label>
      <label className={`tour-form-wide tour-input-field ${frame.inputProgress > 0 && frame.inputProgress < 1 ? "tour-focus" : ""}`}>
        当前已掌握的患者信息
        <textarea readOnly tabIndex={-1} aria-label="演示中的患者信息输入" rows={5} value={frame.inputText} placeholder="主诉、现病史、查体与已有结果……" />
        {frame.inputProgress > 0 && frame.inputProgress < 1 && <Pointer label="正在输入" />}
      </label>
    </div>
    <div className="tour-intake-footer"><span className="tour-checked-note"><Check size={14} />本会话只包含合成数据</span><span className={`tour-action tour-create-action ${frame.inputProgress === 1 ? "tour-focus is-active" : ""}`}><ArrowRight size={15} />创建会话{frame.inputProgress === 1 && <Pointer label="创建会话" />}</span></div>
    <div className="tour-intake-preview"><span>接下来</span><div>生成三条候选<ChevronRight size={12} />医生选择<ChevronRight size={12} />录入新证据<ChevronRight size={12} />继续下一轮</div></div>
  </div>;
}

function Generation({ frame }: { frame: TourFrame }) {
  return <div className="tour-generation" aria-label={`第${frame.round}轮决策生成演示`}>
    <div className="tour-generation-heading"><span className="tour-generation-orbit"><Activity size={26} /></span><div><h3>{frame.round === 1 ? "从当前证据形成决策" : "结合新证据，重新评估"}</h3><p>{frame.round === 1 ? "围绕慢阻肺急性加重，组织三个可比较的下一步方案。" : "复查结果已进入当前状态，下一轮决策随之更新。"}</p></div></div>
    <div className="tour-generation-steps">{frame.generationSteps.map((step, index) => <div key={step.id} className={`tour-generation-step is-${step.status}`}><span>{step.status === "completed" ? <Check size={14} /> : String(index + 1).padStart(2, "0")}</span><strong>{step.label}</strong><i /></div>)}</div>
    <div className="tour-generation-meter"><span style={{ width: `${frame.generationProgress * 100}%` }} /></div>
    <div className="tour-candidate-skeletons" aria-hidden="true">{[1, 2, 3].map(n => <div key={n}><span>方案 0{n}</span><i /><i /><i /></div>)}</div>
    <p className="tour-generation-note">演示预编排的生成过程 · 所有候选由医生审核后选择</p>
  </div>;
}

function Decisions({ frame }: { frame: TourFrame }) {
  const [expandedSource, setExpandedSource] = useState(false);
  return <>
    <div className="tour-decision-hint"><span><ClipboardCheck size={15} />{frame.decisionConfirmed ? "医生决定已记录" : "三个候选方案，请医生审核"}</span><small>可选一个或多个，也可自行输入</small></div>
    <div className="tour-candidates">{frame.candidates.map((candidate, index) => {
      const selected = frame.selectedCandidateIds.includes(candidate.id);
      return <article key={candidate.id} className={`tour-candidate ${selected ? "is-selected" : ""} ${frame.activeCandidateId === candidate.id ? "tour-focus" : ""}`}>
        <div className="tour-candidate-top"><span>方案 0{index + 1}</span><span className="tour-checkbox" aria-label={selected ? "已选择" : "未选择"}>{selected && <Check size={14} />}</span></div>
        <h4>{candidate.title}</h4><p className="tour-candidate-action">{candidate.action}</p><p className="tour-candidate-reason">{candidate.rationale}</p>
        <div className="tour-candidate-tags">{candidate.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
        <div className="tour-candidate-source"><BookOpen size={12} /><span>{candidate.sourceIds.length} 条参考来源</span></div>
        {frame.activeCandidateId === candidate.id && <Pointer label="选择方案" />}
      </article>;
    })}</div>
    <div className="tour-review">
      <div className="tour-review-title"><h4>医生审核</h4><span>最终决定由医生确认</span></div>
      <div className="tour-review-fields"><label>审核人<input readOnly tabIndex={-1} value="演示医生" /></label><label className={frame.focusTarget === "review-note" ? "tour-focus" : ""}>审核意见<input readOnly tabIndex={-1} value={frame.reviewNote} placeholder="填写选择这些方案的理由" />{frame.focusTarget === "review-note" && <Pointer label="填写审核意见" />}</label></div>
      <div className="tour-review-actions"><span className={`tour-action ${frame.selectedCandidateIds.length ? "is-active" : ""} ${frame.decisionConfirmed ? "is-confirmed" : ""} ${frame.focusTarget === "confirm" ? "tour-focus" : ""}`}><CheckCheck size={15} />{frame.decisionConfirmed ? "已确认并记录" : `接受所选${frame.selectedCandidateIds.length ? `（${frame.selectedCandidateIds.length}）` : ""}`}{frame.focusTarget === "confirm" && <Pointer label="确认选择" />}</span><span className="tour-action-secondary">全部拒绝并自填</span><span className="tour-action-text">全部拒绝</span></div>
      {frame.decisionConfirmed && <div className="tour-receipt"><Check size={14} /><span>已记录医生选择 · 轨迹向前推进，保留全部三个候选</span></div>}
    </div>
    <div className="tour-source-disclosure"><button type="button" aria-expanded={expandedSource} onClick={() => setExpandedSource(value => !value)}><BookOpen size={13} />演示参考来源<ChevronRight size={13} /></button>{expandedSource && <div className="tour-source-list">{TOUR_SOURCES.map(source => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>)}<p>用于编写合成流程示例，不代表本次进行了在线检索或临床验证。</p></div>}</div>
  </>;
}

function Timeline({ frame }: { frame: TourFrame }) {
  return <div className="tour-trajectory"><div className="tour-trajectory-title"><GitBranch size={14} /><h4>临床决策轨迹</h4><span>{frame.trajectory.length} 个节点</span></div><div className="tour-trajectory-nodes">{frame.trajectory.length ? frame.trajectory.map((node, index) => <div className="tour-trajectory-step" key={node.id}>{index > 0 && <ArrowRight size={13} />}<div><span>{String(index + 1).padStart(2, "0")}</span><strong>{node.title}</strong><small>{node.detail}</small></div></div>) : <p>医生确认后，决策节点将在这里逐步形成。</p>}</div></div>;
}

export function WorkspaceTour() {
  const player = useTourPlayer();
  const frame = getTourFrame(player.timeMs);
  const shell = useRef<HTMLElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const [started, setStarted] = useState(false);
  const begin = () => { setStarted(true); player.replay(); };
  const seek = (time: number) => { setStarted(true); player.seek(time); };
  const toggle = () => { setStarted(true); player.toggle(); };
  useEffect(() => {
    const changed = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  useEffect(() => {
    if (!shell.current || frame.summaryVisible) return;
    const patient = shell.current.querySelector<HTMLElement>(".tour-patient-body");
    const decision = shell.current.querySelector<HTMLElement>(".tour-decision-body");
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
    const follow = (container: HTMLElement | null, selector?: string) => {
      if (!container || container.scrollHeight <= container.clientHeight) return;
      const target = selector ? container.querySelector<HTMLElement>(selector) : null;
      const top = target ? target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 16 : 0;
      container.scrollTo({ top: Math.max(0, top), behavior });
    };
    if (frame.focusTarget === "evidence-input" || frame.focusTarget === "evidence-submit") follow(patient, ".tour-evidence-entry");
    else if (frame.phase === "evidence") follow(patient, ".tour-evidence-item:last-child");
    else follow(patient);
    if (frame.focusTarget === "case-input") follow(decision, ".tour-input-field");
    else if (frame.focusTarget === "create-session") follow(decision, ".tour-intake-footer");
    else if (frame.focusTarget.startsWith("candidate-")) follow(decision, `.tour-candidate:nth-child(${frame.focusTarget.slice(-1)})`);
    else if (frame.focusTarget === "review-note" || frame.focusTarget === "confirm") follow(decision, ".tour-review");
    else if (frame.focusTarget === "trajectory") follow(decision, ".tour-trajectory");
    else follow(decision);
  }, [frame.focusTarget, frame.phase, frame.summaryVisible]);
  useEffect(() => {
    shell.current?.querySelectorAll<HTMLTextAreaElement>("textarea").forEach(field => { field.scrollTop = field.scrollHeight; });
  }, [frame.inputText, frame.evidenceDraft]);
  const enterFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (shell.current?.requestFullscreen) await shell.current.requestFullscreen();
      else setFullscreenError("当前浏览器不支持全屏，请使用浏览器放大功能。");
    } catch { setFullscreenError("无法进入全屏，仍可在当前页面观看完整演示。"); }
  };
  const initial = !started && !player.playing && player.timeMs === 0;

  return <div className={`workspace-tour ${player.playing ? "is-playing" : "is-paused"}`}>
    <a className="skip-link" href="#tour-player">跳到演示播放器</a>
    <header className="tour-site-header"><a href="/demo" className="tour-brand">ClinTraj<span>临床决策支持</span></a><nav aria-label="演示导航"><a href="/demo/trajectory">轨迹图回放</a><a href="/workspace" className="tour-workspace-link">打开医生工作台<ArrowRight size={14} /></a></nav></header>
    <main className="tour-main">
      <div className="tour-intro"><div><p className="tour-eyebrow"><span />工作台体验演示</p><h1>跟随一次完整的临床决策。</h1><p className="tour-intro-description">从患者信息到新证据，看医生如何与 ClinTraj 一起推进诊疗。</p></div><div className="tour-intro-meta"><span><Stethoscope size={14} />慢阻肺急性加重</span><span>{clock(TOUR_DURATION_MS)} · 中文 · 可重播</span></div></div>
      <section id="tour-player" className="tour-shell" ref={shell} aria-label="慢阻肺医生工作台演示播放器">
        <div className="tour-stage" data-phase={frame.phase}>
          <div className="tour-workspace-header"><div><span className="tour-app-mark"><Activity size={17} /></span><h2>医生工作台</h2><span className="tour-mode-label">演示模式</span></div><div className="tour-workspace-status"><span className={player.playing ? "is-active" : ""} />{frame.statusLabel}</div></div>
          <div className="tour-session-bar"><div><span>患者会话</span><strong>慢阻肺急性加重 · 合成病例</strong></div><span className="tour-session-detail">输入 → 决策 → 医生选择 → 新证据</span><span className="tour-synthetic-badge">合成数据</span></div>
          <div className="tour-columns"><PatientPanel frame={frame} /><div className="tour-decision">
            <PanelTitle icon={<Activity size={16} />} title={frame.sessionCreated ? "下一步临床决策" : "患者信息录入"} detail={frame.sessionCreated ? `第 ${frame.round} 轮` : "建立合成会话"} />
            <div className="tour-decision-body">
              {!frame.sessionCreated ? <Intake frame={frame} /> : frame.isGenerating ? <Generation frame={frame} /> : frame.candidates.length ? <Decisions key={frame.round} frame={frame} /> : <div className="tour-ready"><Activity size={30} /><h3>患者会话已创建</h3><p>当前信息已纳入患者状态，准备生成下一步建议。</p><span className="tour-action is-active"><Activity size={14} />生成下一步建议<Pointer label="开始生成" /></span></div>}
              {frame.phase === "evidence" && frame.timeMs >= TOUR_TIMING.evidenceSubmitted && <div className="tour-next-round"><span className="tour-action is-active"><Activity size={14} />根据新证据，生成下一步建议<Pointer label="继续下一轮" /></span></div>}
              {frame.sessionCreated && <Timeline frame={frame} />}
            </div>
          </div></div>
          {initial && <div className="tour-start-overlay"><div className="tour-start-card"><span className="tour-preview-label">CLINTRAJ / 医生工作台</span><h2>一位患者。两轮决策。<br />一段完整的工作体验。</h2><p>患者输入、建议生成、医生选择、新证据录入。<br />点击开始，跟随一个慢阻肺合成病例。</p><button type="button" className="tour-start-button" onClick={begin}><Play size={20} fill="currentColor" />开始观看<span>{clock(TOUR_DURATION_MS)}</span></button><small>预编排界面演示 · 支持暂停、定位与重播</small></div><div className="tour-poster-steps" aria-hidden="true">{["输入患者信息", "生成三条候选", "医生确认选择", "录入新的证据"].map((text, index) => <div key={text}><span>0{index + 1}</span><strong>{text}</strong>{index < 3 && <ArrowDown size={17} />}</div>)}</div></div>}
          {frame.summaryVisible && <div className="tour-summary"><span className="tour-summary-check"><CheckCheck size={30} /></span><p className="tour-summary-eyebrow">一次完整的工作台体验</p><h2>新证据，让下一步更清楚。</h2><p>两轮决策均经医生选择；新增观察沿时间顺序进入会话。<br />三个候选、选择理由与证据共同组成可追溯的轨迹。</p><div className="tour-summary-stats"><span><strong>2</strong>轮决策</span><span><strong>3</strong>候选 / 轮</span><span><strong>1</strong>次新证据录入</span></div><div className="tour-summary-path" aria-label="已完成的四个轨迹节点">{frame.trajectory.map((node, index) => <div key={node.id}>{index > 0 && <ChevronRight size={14} />}<span><Check size={13} />{node.title}</span></div>)}</div><div className="tour-summary-actions"><button type="button" onClick={begin}><RotateCcw size={16} />从头重播</button><button type="button" onClick={() => seek(TOUR_TIMING.secondNoteStart)}><ArrowLeft size={15} />回看医生选择</button></div><small>病例、生成过程和医生操作均为演示脚本，不表示真实诊疗结果。</small></div>}
        </div>
        <div className="tour-caption"><span className="tour-caption-number">{String(frame.chapterIndex + 1).padStart(2, "0")}</span><div><span className="tour-caption-title">{frame.coachTitle}</span><p aria-live="polite" aria-atomic="true">{frame.caption}</p></div><span className="tour-caption-label">中文字幕</span></div>
        <div className="tour-controls">
          <div className="tour-progress-wrap"><input type="range" min={0} max={TOUR_DURATION_MS} step={100} value={player.timeMs} aria-label="演示播放进度" aria-valuetext={`${clock(player.timeMs)}，${frame.chapter.title}`} onChange={event => seek(Number(event.target.value))} style={{ "--tour-progress": `${frame.progress * 100}%` } as CSSProperties} /><div className="tour-progress-ticks" aria-hidden="true">{TOUR_CHAPTERS.slice(1).map(chapter => <i key={chapter.id} style={{ left: `${chapter.startMs / TOUR_DURATION_MS * 100}%` }} />)}</div></div>
          <div className="tour-control-row"><div className="tour-transport"><button type="button" className="tour-play" aria-label={frame.completed ? "重播演示" : player.playing ? "暂停演示" : "播放演示"} onClick={toggle}>{player.playing ? <Pause size={18} fill="currentColor" /> : frame.completed ? <RotateCcw size={18} /> : <Play size={18} fill="currentColor" />}</button><button type="button" aria-label="上一章节" disabled={frame.chapterIndex === 0 && player.timeMs === 0} onClick={() => seek(TOUR_CHAPTERS[Math.max(0, frame.chapterIndex - 1)].startMs)}><SkipBack size={17} /></button><button type="button" aria-label="下一章节" disabled={frame.chapterIndex === TOUR_CHAPTERS.length - 1} onClick={() => seek(TOUR_CHAPTERS[Math.min(TOUR_CHAPTERS.length - 1, frame.chapterIndex + 1)].startMs)}><SkipForward size={17} /></button><span className="tour-time"><strong>{clock(player.timeMs)}</strong><span>/ {clock(TOUR_DURATION_MS)}</span></span><span className="tour-playing-label">{frame.completed ? "播放结束" : player.playing ? "正在播放" : initial ? "准备就绪" : "已暂停"}</span></div><div className="tour-control-options"><label><span className="sr-only">播放速度</span><select value={player.speed} aria-label="播放速度" onChange={event => player.setSpeed(Number(event.target.value))}>{[0.75, 1, 1.5, 2].map(value => <option key={value} value={value}>{value}×</option>)}</select></label><button type="button" onClick={begin} aria-label="从头重播"><RotateCcw size={15} /><span>重播</span></button><button type="button" onClick={enterFullscreen} aria-label={fullscreen ? "退出全屏" : "全屏观看"}>{fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button></div></div>
          {fullscreenError && <p className="tour-fullscreen-message" role="status">{fullscreenError}</p>}
        </div>
        <nav className="tour-chapters" aria-label="演示章节">{TOUR_CHAPTERS.map((chapter, index) => <button type="button" key={chapter.id} className={`${index === frame.chapterIndex ? "is-active" : ""} ${index < frame.chapterIndex ? "is-complete" : ""}`} aria-current={index === frame.chapterIndex ? "step" : undefined} onClick={() => seek(chapter.startMs)}><span>{index < frame.chapterIndex ? <Check size={12} /> : String(index + 1).padStart(2, "0")}</span><strong>{chapter.shortTitle}</strong><small>{clock(chapter.startMs)}</small></button>)}</nav>
      </section>
      <footer className="tour-footer"><p><CircleDot size={12} />全程为合成病例与预编排操作，不调用模型，不提交临床决定。</p><span>空格：播放 / 暂停 · ← →：5 秒 · R：重播</span></footer>
    </main>
  </div>;
}
