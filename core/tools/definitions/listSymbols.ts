import { Tool } from "../..";
import { CLI_BRIDGE_GROUP_NAME, CliBridgeToolNames } from "./cliBridgeDefs";

/**
 * ListSymbols tool definition.
 * Execution is delegated to the CLI via the bridge layer.
 */
export const listSymbolsTool: Tool = {
  type: "function",
  displayTitle: "List Symbols",
  wouldLikeTo: 'list symbols in "{{{ target }}}"',
  isCurrently: 'listing symbols in "{{{ target }}}"',
  hasAlready: 'listed symbols in "{{{ target }}}"',
  readonly: true,
  isInstant: true,
  group: CLI_BRIDGE_GROUP_NAME,
  function: {
    name: CliBridgeToolNames.ListSymbols,
    description:
      "List code symbols (functions, classes, interfaces, etc.) in a file or directory using LSP. " +
      "Supports filtering by kind (e.g., 'Function', 'Class') and name pattern (regex). Maximum 200 results.",
    parameters: {
      type: "object",
      required: ["target"],
      properties: {
        target: {
          type: "string",
          description: "File or directory path to list symbols from.",
        },
        kind: {
          type: "string",
          description:
            'Filter by symbol kind. Examples: "Function", "Class", "Interface", "Method", "Variable". Multiple kinds separated by comma.',
        },
        namePattern: {
          type: "string",
          description: "Filter by symbol name using regex pattern. Case-insensitive.",
        },
      },
    },
  },
  defaultToolPolicy: "allowedWithoutPermission",
  systemMessageDescription: {
    prefix: `To list code symbols in a file or directory, call the ${CliBridgeToolNames.ListSymbols} tool with the target path. For example:`,
    exampleArgs: [["target", "src/"]],
  },
  toolCallIcon: "FolderIcon",
};
