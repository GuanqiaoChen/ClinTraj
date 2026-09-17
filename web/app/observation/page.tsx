import { Observation } from "@/components/workspace/Observation";
import { notFound } from "next/navigation";
import { isShowcaseOnly } from "@/lib/server/showcase";

export const dynamic = "force-dynamic";

export default function ObservationPage() {
  if (isShowcaseOnly()) notFound();
  return <Observation />;
}
