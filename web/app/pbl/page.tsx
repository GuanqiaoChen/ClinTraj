import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Command } from "lucide-react";
import { DiagnosticWorkflow } from "@/components/pbl/DiagnosticWorkflow";

export const metadata: Metadata = { title: "诊断路径 · ClinTraj", description: "合成研究病例的诊断假设与证据验证工作区。" };

export default function PblPage() {
  return <div className="dw-page">
    <header className="dw-site-header"><Link href="/workspace" className="dw-brand"><Command size={21} />ClinTraj<span>临床研究工作区</span></Link><Link className="dw-workspace-link" href="/workspace">医生工作台<ArrowUpRight size={14} /></Link></header>
    <main className="dw-main"><DiagnosticWorkflow /></main>
  </div>;
}
