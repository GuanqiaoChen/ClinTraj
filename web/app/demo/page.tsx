import type { Metadata } from "next";
import { WorkspaceTour } from "@/components/demo/WorkspaceTour";

export const metadata: Metadata = {
  title: "慢阻肺 · 医生工作台演示 | ClinTraj",
  description: "一段可暂停、定位和重播的中文合成病例演示：患者信息、三候选决策、医生选择与新证据录入。",
};

export default function DemoPage() { return <WorkspaceTour />; }
