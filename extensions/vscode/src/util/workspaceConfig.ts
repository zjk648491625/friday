// Modified by Friday AI Team - Rebranded from Continue
import { workspace } from "vscode";

export const FRIDAY_WORKSPACE_KEY = "friday";

export function getFridayWorkspaceConfig() {
  return workspace.getConfiguration(FRIDAY_WORKSPACE_KEY);
}
