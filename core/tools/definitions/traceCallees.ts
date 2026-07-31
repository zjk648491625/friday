import { Tool } from "../..";
import { CLI_BRIDGE_GROUP_NAME, CliBridgeToolNames } from "./cliBridgeDefs";

/**
 * TraceCallees tool definition.
 * Execution is delegated to the CLI via the bridge layer.
 */
export const traceCalleesTool: Tool = {
  type: "function",
  displayTitle: "Trace Callees",
  wouldLikeTo: 'trace callees of "{{{ symbolName }}}"',
  isCurrently: 'tracing callees of "{{{ symbolName }}}"',
  hasAlready: 'traced callees of "{{{ symbolName }}}"',
  readonly: true,
  isInstant: true,
  group: CLI_BRIDGE_GROUP_NAME,
  function: {
    name: CliBridgeToolNames.TraceCallees,
    description:
      'Trace "what this function calls" using LSP call hierarchy. ' +
      "Builds a call hierarchy tree showing all callees (functions called by this one), their callees, etc. Maximum depth: 3 levels.",
    parameters: {
      type: "object",
      required: ["symbolName", "filepath"],
      properties: {
        symbolName: {
          type: "string",
          description: "Name of the function/method to trace callees for.",
        },
        filepath: {
          type: "string",
          description: "File containing the symbol.",
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
    prefix: `To trace what a function calls, call the ${CliBridgeToolNames.TraceCallees} tool. For example:`,
    exampleArgs: [
      ["symbolName", "streamChatResponse"],
      ["filepath", "src/stream/streamChatResponse.ts"],
    ],
  },
  toolCallIcon: "ArrowDownIcon",
};
