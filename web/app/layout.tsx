import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@xyflow/react/dist/style.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClinTraj · 临床决策轨迹工作台",
  description: "面向医生的临床决策支持：可见证据、可溯源建议、可审核决定与实时执行轨迹。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN" className={`${GeistSans.variable} ${GeistMono.variable}`}><body>{children}</body></html>;
}
