import { Workspace } from "@/components/workspace/Workspace";
import { WorkspacePreview } from "@/components/workspace/WorkspacePreview";
import { isShowcaseOnly } from "@/lib/server/showcase";

// The same image can be run locally or as a public showcase without rebuilding.
export const dynamic = "force-dynamic";

export default function WorkspacePage() {
  return isShowcaseOnly() ? <WorkspacePreview /> : <Workspace />;
}
