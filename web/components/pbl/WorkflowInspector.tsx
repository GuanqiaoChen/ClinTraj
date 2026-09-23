"use client";

import { ArrowRight, ArrowUpRight, ChevronRight, FlaskConical, Plus, X } from "lucide-react";
import {
  getWorkflowNodeHistory,
  workflowSources,
  type WorkflowNode,
} from "@/lib/pbl/diagnostic-workflow";

const kindLabels: Record<WorkflowNode["kind"], string> = {
  hypothesis: "诊断假设",
  test: "检查决策",
  evidence: "医学证据",
  consultation: "专科会诊",
  conclusion: "诊断确认",
};

interface WorkflowInspectorProps {
  node: WorkflowNode;
  stageIndex: number;
  related: WorkflowNode[];
  onClose: () => void;
  onSelect: (id: string) => void;
  onContinue: () => void;
}

export function WorkflowInspector({ node, stageIndex, related, onClose, onSelect, onContinue }: WorkflowInspectorProps) {
  const history = getWorkflowNodeHistory(node.id, stageIndex);
  const sources = workflowSources.filter(source => node.sourceIds.includes(source.id));
  const canContinue = node.status !== "ruled-out" && node.kind !== "conclusion";
  const isDecision = node.kind === "test" || node.kind === "consultation";

  return (
    <aside className="dw-inspector" role="complementary" aria-label="节点详情">
      <header className="dw-detail-head">
        <span className={`dw-detail-kind kind-${node.kind}`}>{kindLabels[node.kind]}</span>
        <button type="button" className="dw-icon-button" aria-label="关闭节点详情" title="关闭节点详情" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <h3>{node.title}</h3>
      <span className={`dw-detail-status status-${node.status}`}>{node.statusLabel}</span>

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

      {node.details.length > 0 && (
        <details className="dw-detail-section">
          <summary>诊断信息</summary>
          <ul>{node.details.map((entry, index) => <li key={`${node.id}-detail-${index}`}>{entry}</li>)}</ul>
        </details>
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

      {canContinue && (
        <button type="button" className="dw-button dw-button-primary" onClick={onContinue}>
          <Plus size={14} aria-hidden="true" />从此节点继续<ArrowRight size={14} aria-hidden="true" />
        </button>
      )}
    </aside>
  );
}
