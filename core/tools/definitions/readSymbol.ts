import { Tool } from "../..";
import { CLI_BRIDGE_GROUP_NAME, CliBridgeToolNames } from "./cliBridgeDefs";

/**
 * ReadSymbol tool definition.
 * Reads the complete definition of a code symbol (function, class, etc.)
 * including JSDoc/comments. Execution is delegated to the CLI via the bridge layer.
 * When CLI is unavailable, falls back to read_file with line-based extraction.
 */
export const readSymbolTool: Tool = {
  type: "function",
  displayTitle: "Read Symbol",
  wouldLikeTo: 'read symbol "{{{ symbolName }}}"',
  isCurrently: 'reading symbol "{{{ symbolName }}}"',
  hasAlready: 'read symbol "{{{ symbolName }}}"',
  readonly: true,
  isInstant: true,
  group: CLI_BRIDGE_GROUP_NAME,
  function: {
    name: CliBridgeToolNames.ReadSymbol,
    description:
      "Read the full definition of a code symbol (function, class, interface, method, etc.) " +
      "including JSDoc and comments. Uses LSP to locate the symbol precisely and extracts " +
      "the complete source code range. Much more precise than read_file for reading specific definitions.",
    parameters: {
      type: "object",
      required: ["symbolName", "filepath"],
      properties: {
        symbolName: {
          type: "string",
          description:
            "The name of the symbol to read (e.g., 'findUser', 'UserService', 'handleToolCall').",
        },
        filepath: {
          type: "string",
          description: "The file containing the symbol.",
        },
        line: {
          type: "number",
          description:
            "Optional: specific line number (1-based) to help locate the symbol when multiple share the name.",
        },
      },
    },
  },
  defaultToolPolicy: "allowedWithoutPermission",
  systemMessageDescription: {
    prefix: `To read the full definition of a code symbol including comments, call the ${CliBridgeToolNames.ReadSymbol} tool. For example:`,
    exampleArgs: [
      ["symbolName", "authenticate"],
      ["filepath", "src/auth.ts"],
    ],
  },
  toolCallIcon: "CodeIcon",
};
