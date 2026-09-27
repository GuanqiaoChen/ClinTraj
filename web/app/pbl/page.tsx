import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Command } from "lucide-react";
import { DiagnosticWorkflow } from "@/components/pbl/DiagnosticWorkflow";
import { workflowCase, workflowProvenance } from "@/lib/pbl/diagnostic-workflow";

export const metadata: Metadata = { title: "诊断路径 · ClinTraj", description: "以 VINDICATED 逐项复核跨系统病因的合成研究病例：诊断假设、证据更新与医生确认。" };

export default function PblPage() {
  return <div className="dw-page">
    <header className="dw-site-header"><Link href="/workspace" className="dw-brand"><Command size={21} />ClinTraj<span>临床研究工作区</span></Link><Link className="dw-workspace-link" href="/workspace">医生工作台<ArrowUpRight size={14} /></Link></header>
    <main className="dw-main">
      <div className="dw-case-heading"><h1>{workflowCase.title}</h1><span className="dw-synthetic">{workflowProvenance.label}</span></div>
      <div className="dw-case-context"><span>{workflowCase.patientLabel}</span><span>{workflowCase.problem}</span><Link href="/demo">观看同例工作台演示<ArrowUpRight size={12} /></Link></div>
      <DiagnosticWorkflow />
    </main>
  </div>;
}
