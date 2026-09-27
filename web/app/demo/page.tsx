import type { Metadata } from "next";
import { WorkspaceTour } from "@/components/demo/WorkspaceTour";

export const metadata: Metadata = {
  title: "PBL 诊断推演 · 医生工作台演示 | ClinTraj",
  description: "与 PBL 同步的合成诊断案例：VINDICATED 全面鉴别、证据更新、AI 候选与医生复核，支持暂停和重播。",
};

export default function DemoPage() { return <WorkspaceTour />; }
