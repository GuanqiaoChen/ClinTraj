"use client";

import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, FlaskConical, Plus, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  getWorkflowNodeHistory,
  workflowSources,
  type WorkflowNode,
} from "@/lib/pbl/diagnostic-workflow";

const kindLabels: Record<WorkflowNode["kind"], string> = {
  hypothesis: "假设",
  test: "检查",
  evidence: "证据",
  consultation: "检查",
  conclusion: "假设",
};

interface WorkflowInspectorProps {
  node: WorkflowNode;
  stageIndex: number;
  related: WorkflowNode[];
  onClose: () => void;
  onSelect: (id: string) => void;
  onContinue?: () => void;
  navigation: { index: number; total: number; onPrevious: () => void; onNext: () => void };
}

export function WorkflowInspector({ node, stageIndex, related, onClose, onSelect, onContinue, navigation }: WorkflowInspectorProps) {
  const inspector = useRef<HTMLElement>(null);
  useEffect(() => { if (inspector.current) inspector.current.scrollTop = 0; }, [node.id, stageIndex]);
  const history = getWorkflowNodeHistory(node.id, stageIndex);
  const sources = workflowSources.filter(source => node.sourceIds.includes(source.id));
  const canContinue = node.status !== "ruled-out" && node.kind !== "conclusion";
  const isDecision = node.kind === "test" || node.kind === "consultation";

  return (
    <aside ref={inspector} className="dw-inspector" role="complementary" aria-label="节点详情" data-node-id={node.id}>
      <header className="dw-detail-head">
        <span className={`dw-detail-kind kind-${node.kind}`}>{kindLabels[node.kind]}</span>
        <nav className="dw-detail-navigation" aria-label="按行浏览方框">
          <button type="button" className="dw-icon-button" aria-label="上一个方框" title="上一个方框" disabled={navigation.index <= 0} onClick={navigation.onPrevious}><ChevronLeft size={16} aria-hidden="true" /></button>
          <span aria-live="polite">{navigation.index < 0 ? "—" : navigation.index + 1} / {navigation.total}</span>
          <button type="button" className="dw-icon-button" aria-label="下一个方框" title="下一个方框" disabled={navigation.index >= navigation.total - 1} onClick={navigation.onNext}><ChevronRight size={16} aria-hidden="true" /></button>
          <button type="button" className="dw-icon-button" aria-label="返回本步首个方框" title="返回本步首个方框" onClick={onClose}><RotateCcw size={13} aria-hidden="true" /></button>
        </nav>
      </header>
      <p className="dw-detail-order">从上到下 · 同行从左到右</p>

      <h3>{node.title}</h3>
      <span className={`dw-detail-status status-${node.status}`}>{node.statusLabel}</span>

      {node.details.length > 0 && (
        <section className="dw-detail-section dw-diagnosis-information" aria-label="诊断信息">
          <h4>诊断信息</h4>
          <ul>{node.details.map((entry, index) => <li key={`${node.id}-detail-${index}`}>{entry}</li>)}</ul>
        </section>
      )}

      <section className="dw-detail-section">
        <h4>{isDecision ? "为什么选择这一步" : "判断依据"}</h4>
        <p>{node.rationale}</p>
      </section>

      {(node.priority || node.burden) && (
        <dl className="dw-metrics">
          {node.priority && <div><dt>优先级</dt><dd>{node.priority}</dd></div>}
          {node.burden && <div><dt>检查负担</dt><dd>{node.burden}</dd></div>}
        </dl>
      )}

      {node.evidence.length > 0 && (
        <section className="dw-detail-section">
          <h4>当前证据</h4>
          <ul>{node.evidence.map((entry, index) => <li key={`${node.id}-evidence-${index}`}>{entry}</li>)}</ul>
        </section>
      )}

      {related.length > 0 && (
        <section className="dw-detail-section dw-related">
          <h4>关联路径 <span>{related.length}</span></h4>
          {related.map(item => (
            <button type="button" key={item.id} className={`kind-${item.kind} status-${item.status}`} onClick={() => onSelect(item.id)}>
              <span><strong>{item.title}</strong><small>{kindLabels[item.kind]} · {item.statusLabel}</small></span>
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          ))}
        </section>
      )}

      {history.length > 0 && (
        <details className="dw-detail-section dw-history">
          <summary>状态演变 <span>{history.length}</span></summary>
          <ol>
            {history.map(entry => (
              <li key={entry.stageIndex} className={`status-${entry.status}`}>
                <span>{entry.stageLabel}</span>
                <strong>{entry.statusLabel}</strong>
                <p>{entry.summary}</p>
              </li>
            ))}
          </ol>
        </details>
      )}

      {sources.length > 0 && (
        <details className="dw-detail-section dw-sources">
          <summary>知识依据 <span>{sources.length}</span></summary>
          {sources.map(source => (
            <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer">
              <span>{source.title}</span><ArrowUpRight size={14} aria-hidden="true" />
            </a>
          ))}
        </details>
      )}

      <footer className="dw-provenance">
        <details>
          <summary><FlaskConical size={12} aria-hidden="true" />合成研究病例</summary>
          <p>{node.provenance.label}</p>
          <dl>
            <div><dt>研究病例</dt><dd>{node.provenance.fixtureId}</dd></div>
            <div><dt>节点引用</dt><dd>{node.id}</dd></div>
            {node.provenance.evidenceIds.length > 0 && <div><dt>证据引用</dt><dd>{node.provenance.evidenceIds.join(" · ")}</dd></div>}
          </dl>
        </details>
      </footer>

      {canContinue && onContinue && (
        <button type="button" className="dw-button dw-button-primary" onClick={onContinue}>
          <Plus size={14} aria-hidden="true" />从此节点继续<ArrowRight size={14} aria-hidden="true" />
        </button>
      )}
    </aside>
  );
}
