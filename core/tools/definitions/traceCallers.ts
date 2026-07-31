import { Tool } from "../..";
import { CLI_BRIDGE_GROUP_NAME, CliBridgeToolNames } from "./cliBridgeDefs";

/**
 * TraceCallers tool definition.
 * Execution is delegated to the CLI via the bridge layer.
 */
export const traceCallersTool: Tool = {
  type: "function",
  displayTitle: "Trace Callers",
  wouldLikeTo: 'trace callers of "{{{ symbolName }}}"',
  isCurrently: 'tracing callers of "{{{ symbolName }}}"',
  hasAlready: 'traced callers of "{{{ symbolName }}}"',
  readonly: true,
  isInstant: true,
  group: CLI_BRIDGE_GROUP_NAME,
  function: {
    name: CliBridgeToolNames.TraceCallers,
    description:
      'Trace "who calls this function" using LSP call hierarchy. ' +
      "Builds a call hierarchy tree showing all callers, their callers, etc. Maximum depth: 3 levels.",
    parameters: {
      type: "object",
      required: ["symbolName", "filepath"],
      properties: {
        symbolName: {
          type: "string",
          description: "Name of the function/method to trace callers for.",
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
    prefix: `To trace who calls a function, call the ${CliBridgeToolNames.TraceCallers} tool. For example:`,
    exampleArgs: [
      ["symbolName", "authenticate"],
      ["filepath", "src/auth.ts"],
    ],
  },
  toolCallIcon: "ArrowUpIcon",
};
