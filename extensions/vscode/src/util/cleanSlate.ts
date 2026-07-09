import fs from "fs";

import { getFridayGlobalPath } from "core/util/paths";
import { ExtensionContext } from "vscode";

/**
 * Clear all Friday-related artifacts to simulate a brand new user
 */
export function cleanSlate(context: ExtensionContext) {
  // Commented just to be safe
  // // Remove ~/.friday
  // const fridayPath = getFridayGlobalPath();
  // if (fs.existsSync(fridayPath)) {
  //   fs.rmSync(fridayPath, { recursive: true, force: true });
  // }
  // // Clear extension's globalState
  // context.globalState.keys().forEach((key) => {
  //   context.globalState.update(key, undefined);
  // });
}
