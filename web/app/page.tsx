import { redirect } from "next/navigation";
import { isShowcaseOnly } from "@/lib/server/showcase";

export const dynamic = "force-dynamic";

export default function Home() { redirect(isShowcaseOnly() ? "/demo" : "/workspace"); }
