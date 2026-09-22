import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ChevronRight, FlaskConical } from "lucide-react";
import { DiagnosticWorkflow } from "@/components/pbl/DiagnosticWorkflow";

export const metadata: Metadata = {
  title: "诊断推演 · ClinTraj",
  description: "合成研究病例的动态诊断假设与证据验证路径。",
};

export default function PblPage() {
  return <div className="pbl-page">
    <header className="pbl-site-header">
      <Link href="/workspace" className="pbl-brand"><Activity size={20} /><span>ClinTraj</span></Link>
      <nav aria-label="当前位置"><Link href="/workspace">医生工作台</Link><ChevronRight size={13} /><span className="is-current">诊断推演</span></nav>
      <span className="pbl-header-status"><i />研究工作区</span>
    </header>
    <main className="pbl-main">
      <div className="pbl-page-heading"><div><p className="pbl-eyebrow">CASE / SYN-PBL-001</p><h1>慢性咳嗽 · 活动后气促</h1></div><span className="pbl-case-tag"><FlaskConical size={13} />合成病例</span></div>
      <div className="pbl-case-strip" aria-label="初始病例信息"><span><strong>62 岁</strong>男性</span><span>咳嗽、咳痰 <strong>3 年</strong></span><span>活动后气促 <strong>1 年</strong></span><span>吸烟史 <strong>35 包年</strong></span><span>就诊问题 <strong>呼吸系统</strong></span></div>
      <DiagnosticWorkflow />
    </main>
  </div>;
}
