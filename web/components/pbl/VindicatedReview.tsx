"use client";

import { ArrowUpRight, ChevronDown, ListChecks } from "lucide-react";
import { workflowMnemonicNote, type WorkflowSnapshot } from "@/lib/pbl/diagnostic-workflow";

export function VindicatedReview({ snapshot, onSelect }: { snapshot: WorkflowSnapshot; onSelect: (id: string) => void }) {
  return <details className="dw-vindicated" aria-label="VINDICATED 全面鉴别">
    <summary>
      <ListChecks size={16} aria-hidden="true" />
      <strong>VINDICATED</strong>
      <span>10 类病因逐项复核</span>
      <small>呼吸 · 心血管 · 消化及其他系统</small>
      <ChevronDown size={15} className="dw-review-chevron" aria-hidden="true" />
    </summary>
    <div className="dw-review-context"><strong>{snapshot.stage.title}</strong><span>依据当前已知证据更新优先级；未获得的结果不作为排除依据。</span></div>
    <div className="dw-review-grid">
      {snapshot.vindicatedReview.map(entry => <article key={entry.id} data-review-id={entry.id}>
        <header><span>{entry.letter}</span><h3>{entry.label}</h3></header>
        <p className="dw-review-hypotheses">{entry.hypotheses.join(" · ")}</p>
        <p>{entry.assessment}</p>
        <p className="dw-review-next"><strong>下一步</strong>{entry.nextStep}</p>
        <div>{entry.nodeIds.map(id => {
          const node = snapshot.nodes.find(item => item.id === id);
          return node && <button key={id} type="button" onClick={() => onSelect(id)}>{node.title}<ArrowUpRight size={12} aria-hidden="true" /></button>;
        })}</div>
      </article>)}
    </div>
    <p className="dw-review-note">{workflowMnemonicNote}</p>
  </details>;
}
