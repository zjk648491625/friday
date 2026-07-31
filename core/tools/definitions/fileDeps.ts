import { Tool } from "../..";
import { CLI_BRIDGE_GROUP_NAME, CliBridgeToolNames } from "./cliBridgeDefs";

/**
 * FileDeps tool definition.
 * Execution is delegated to the CLI via the bridge layer.
 */
export const fileDepsTool: Tool = {
  type: "function",
  displayTitle: "File Dependencies",
  wouldLikeTo: 'analyze dependencies of "{{{ filepath }}}"',
  isCurrently: 'analyzing dependencies of "{{{ filepath }}}"',
  hasAlready: 'analyzed dependencies of "{{{ filepath }}}"',
  readonly: true,
  isInstant: true,
  group: CLI_BRIDGE_GROUP_NAME,
  function: {
    name: CliBridgeToolNames.FileDeps,
    description:
      "Analyze file dependency relationships: direct imports (what this file imports), " +
      "dependents (what files import this file), and indirect impact (files affected through dependency chain).",
    parameters: {
      type: "object",
      required: ["filepath"],
      properties: {
        filepath: {
          type: "string",
          description: "The file to analyze dependencies for.",
        },
      },
    },
  },
  defaultToolPolicy: "allowedWithoutPermission",
  systemMessageDescription: {
    prefix: `To analyze file dependencies, call the ${CliBridgeToolNames.FileDeps} tool. For example:`,
    exampleArgs: [["filepath", "src/core.ts"]],
  },
  toolCallIcon: "TreeStructureIcon",
};
