import { Tool } from "../..";
import { CLI_BRIDGE_GROUP_NAME, CliBridgeToolNames } from "./cliBridgeDefs";

/**
 * FindReferences tool definition.
 * Execution is delegated to the CLI via the bridge layer.
 */
export const findReferencesTool: Tool = {
  type: "function",
  displayTitle: "Find References",
  wouldLikeTo: 'find references to "{{{ symbolName }}}"',
  isCurrently: 'finding references to "{{{ symbolName }}}"',
  hasAlready: 'found references to "{{{ symbolName }}}"',
  readonly: true,
  isInstant: true,
  group: CLI_BRIDGE_GROUP_NAME,
  function: {
    name: CliBridgeToolNames.FindReferences,
    description:
      "Find all references to a code symbol across the codebase using LSP. " +
      "Returns file path, line number, and context lines (1 before, 1 after). Maximum 100 results.",
    parameters: {
      type: "object",
      required: ["symbolName"],
      properties: {
        symbolName: {
          type: "string",
          description:
            'The name of the symbol to find references for. Use "ClassName.methodName" for methods.',
        },
        filepath: {
          type: "string",
          description:
            "Optional: file containing the symbol. If not specified, searches all files in the workspace.",
        },
        line: {
          type: "number",
          description:
            "Optional: specific line number (1-based) to help locate the symbol.",
        },
      },
    },
  },
  defaultToolPolicy: "allowedWithoutPermission",
  systemMessageDescription: {
    prefix: `To find all references to a symbol, call the ${CliBridgeToolNames.FindReferences} tool. For example:`,
    exampleArgs: [
      ["symbolName", "UserService.findById"],
      ["filepath", "src/services/UserService.ts"],
    ],
  },
  toolCallIcon: "SearchIcon",
};
