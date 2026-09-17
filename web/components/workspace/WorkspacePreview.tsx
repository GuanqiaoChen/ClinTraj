"use client";

import { useState } from "react";
import { Activity, ArrowRight, BookOpen, Check, CircleDot, Eye, GitBranch, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTourFrame, TOUR_CASE, TOUR_SOURCES, TOUR_TIMING } from "@/lib/demo/workspace-tour";
import "./workspace.css";
import "./workspace-preview.css";

/** A display-only screen: no API, EventSource, clinical storage, or model imports. */
export function WorkspacePreview() {
  const [round, setRound] = useState<1 | 2>(1);
  const frame = getTourFrame(round === 1 ? TOUR_TIMING.firstCandidates : TOUR_TIMING.secondCandidates);
  const [showCreate, setShowCreate] = useState(false);

  return <div className="live-workspace workspace-preview">
    <a href="#preview-workspace" className="skip-link">跳到工作台预览</a>
    <header className="site-header"><a href="/workspace" className="brand">ClinTraj<span>临床决策支持</span></a><nav><a href="/demo">观看完整演示<ArrowRight size={14} /></a></nav></header>
    <main id="preview-workspace" className="ws-main">
      <div className="ws-heading"><div><h1>医生工作台</h1><p>查看患者状态、三条候选方案与连续决策轨迹。</p></div><Button variant="outline" onClick={() => setShowCreate(value => !value)}><Eye size={15} />{showCreate ? "收起录入界面" : "查看录入界面"}</Button></div>
      <div className="preview-notice" role="note"><Eye size={18} /><div><strong>界面展示</strong><p>当前为预置合成病例，仅供浏览。无法提交患者信息、生成建议或执行决策。</p></div><a href="/demo">播放完整使用流程<ArrowRight size={15} /></a></div>
      <div className="ws-session-bar"><label>患者会话<select aria-label="展示阶段" value={round} onChange={event => setRound(Number(event.target.value) as 1 | 2)}><option value={1}>慢阻肺 · 第一轮评估</option><option value={2}>慢阻肺 · 新证据后的第二轮</option></select></label><span className="ws-service">原创合成病例 · 预置展示内容</span><span className="ws-stream"><Eye size={14} />只读预览</span></div>
      {showCreate && <section className="ws-card ws-create"><div className="ws-card-title"><h2>新建患者会话</h2><span>录入界面预览</span></div><div className="ws-form-grid">
        <label>会话名称<input readOnly value={TOUR_CASE.title} /></label><label>主诉问题<input readOnly value={TOUR_CASE.problem} /></label>
        <label className="ws-span">当前已掌握的患者信息<textarea readOnly rows={5} value={TOUR_CASE.initialText} /></label>
        <div className="ws-checks"><label><input type="checkbox" checked disabled />本会话只包含合成数据</label></div><div className="ws-span ws-form-footer"><span>此页面不接受输入或创建真实会话。</span><Button disabled><ArrowRight size={15} />创建会话</Button></div>
      </div></section>}
      <div className="ws-columns"><aside className="ws-patient"><section className="ws-card"><div className="ws-card-title"><h2><CircleDot size={16} />当前患者状态</h2><span>第 {round} 轮</span></div><div className="ws-card-body">
        <div className="ws-patient-name"><h3>慢阻肺急性加重</h3><span className="ws-chip">{TOUR_CASE.patientLabel}</span></div>
        <h4>进行中的问题</h4><div className="ws-problem"><span>P1</span><div><strong>{TOUR_CASE.problem}</strong><small>主管：呼吸与危重症医学科</small></div></div>
        <h4>当前可用证据 <span>{frame.visibleEvidence.length}</span></h4><div className="ws-evidence-list">{frame.visibleEvidence.map((evidence, index) => <article key={evidence.id}><div><span>E{index + 1}</span><small>合成证据</small></div><p>{evidence.text}</p></article>)}</div>
        <div className="ws-add-evidence"><label>新增观察信息<textarea aria-label="新增观察信息（展示模式）" readOnly rows={3} value="" placeholder="展示模式：不接受患者信息" /></label><div className="ws-evidence-controls"><label>解锁时间<input readOnly value="立即" /></label><Button variant="outline" disabled><Plus size={13} />添加证据</Button></div></div>
      </div></section></aside>
      <div className="ws-decision-column"><section className="ws-card ws-recommendation"><div className="ws-card-title"><h2>下一步临床决策</h2><span className="ws-chip">预置候选 · 第 {round} 轮</span></div><div className="ws-card-body">
        <div className="ws-run-row"><p>每步展示三个候选。真实工作台中，医生可接受一个或多个，也可自主决策。</p><Button disabled><Activity size={15} />生成下一步建议</Button></div>
        <div className="ws-candidate-grid">{frame.candidates.map((candidate, index) => <article className="ws-candidate" key={candidate.id}><div className="ws-candidate-top"><span>方案 {String(index + 1).padStart(2, "0")}</span><input aria-label={`选择方案${index + 1}（展示模式）`} type="checkbox" checked={false} disabled /></div><h3>{candidate.title}</h3><p>{candidate.action}</p><p>{candidate.rationale}</p><small>{candidate.tags.join(" · ")}</small><span className="ws-candidate-source">{candidate.sourceIds.length} 条参考来源</span></article>)}</div>
        <div className="ws-review"><h4>医生审核</h4><div className="ws-review-fields"><label>审核人<input readOnly value="演示医生" /></label><label>审核意见<input readOnly value="" placeholder="展示模式：审核与提交未开放" /></label></div><div className="ws-review-actions"><Button disabled><Check size={14} />接受所选</Button><Button variant="outline" disabled>全部拒绝并自填</Button><Button variant="ghost" disabled>全部拒绝</Button></div></div>
        <details className="ws-detail"><summary><span><BookOpen size={14} />合成示例参考来源</span></summary>{TOUR_SOURCES.map(source => <p key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></p>)}<p>这些公开来源用于编写示例，不表示本页进行了模型生成或实时检索。</p></details>
      </div></section>
      <section className="ws-card"><div className="ws-card-title"><h2><GitBranch size={16} />临床决策轨迹</h2><span>预置合成轨迹</span></div><div className="preview-trajectory">{frame.trajectory.map((node, index) => <div key={node.id}>{index > 0 && <ArrowRight size={19} />}<article><span>{String(index + 1).padStart(2, "0")}</span><strong>{node.title}</strong><p>{node.detail}</p></article></div>)}</div></section>
      </div></div>
      <footer className="ws-footer"><span>ClinTraj · 面向医生的临床决策支持 · 公开界面展示</span><span>本页只包含预置合成内容，不连接临床会话或模型。</span></footer>
    </main>
  </div>;
}
