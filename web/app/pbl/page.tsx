import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Command, FlaskConical, UserRound } from "lucide-react";
import { DiagnosticWorkflow } from "@/components/pbl/DiagnosticWorkflow";

export const metadata: Metadata = { title: "诊断路径 · ClinTraj", description: "合成研究病例的诊断假设与证据验证工作区。" };

export default function PblPage() {
  return <div className="dw-page">
    <header className="dw-site-header"><Link href="/workspace" className="dw-brand"><Command size={21} />ClinTraj<span>临床研究工作区</span></Link><Link className="dw-workspace-link" href="/workspace">医生工作台<ArrowUpRight size={14} /></Link></header>
    <main className="dw-main"><div className="dw-case-heading"><div><span className="dw-case-id">病例 001</span><h1>慢性咳嗽，活动后气促</h1></div><span className="dw-synthetic"><FlaskConical size={13} />合成病例</span></div><div className="dw-case-context" aria-label="初始病例信息"><span><UserRound size={14} /><strong>62 岁 · 男性</strong></span><i /><span>咳嗽、咳痰 <strong>3 年</strong></span><span>活动后气促 <strong>1 年</strong></span><span>吸烟 <strong>35 包年</strong></span></div><DiagnosticWorkflow /></main>
  </div>;
}
