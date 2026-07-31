/**
 * CLI Bridge Protocol Definitions
 *
 * Defines the communication contract between the core (GUI) and the CLI process.
 * The CLI is invoked as: node friday.js -p --format json --silent "<prompt>"
 */

export const CLI_BRIDGE_TOOL_NAMES = [
  "list_symbols",
  "find_references",
  "trace_callers",
  "trace_callees",
  "file_deps",
  "read_symbol",
] as const;

export type CliBridgeToolName = (typeof CLI_BRIDGE_TOOL_NAMES)[number];

/**
 * Map from core tool names (snake_case) to CLI tool names (PascalCase).
 */
export const CORE_TO_CLI_TOOL_NAME: Record<string, string> = {
  list_symbols: "ListSymbols",
  find_references: "FindReferences",
  trace_callers: "TraceCallers",
  trace_callees: "TraceCallees",
  file_deps: "FileDeps",
  read_symbol: "ReadSymbol",
};

/**
 * Check if a tool name is a CLI bridge tool.
 */
export function isCliBridgeTool(functionName: string): functionName is CliBridgeToolName {
  return (CLI_BRIDGE_TOOL_NAMES as readonly string[]).includes(functionName);
}

/**
 * Arguments describing a CLI bridge tool call.
 */
export interface CliBridgeToolCall {
  /** Core tool name (snake_case) */
  toolName: string;
  /** Raw arguments from the tool call */
  args: Record<string, unknown>;
  /** Working directory for the call */
  workingDir?: string;
}

/**
 * Build the prompt string to send to the CLI for a tool call.
 */
export function buildCliPrompt(call: CliBridgeToolCall): string {
  const cliToolName = CORE_TO_CLI_TOOL_NAME[call.toolName] || call.toolName;
  const argsDesc = Object.entries(call.args)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => {
      // For filepath/target: quote the value
      if (k === "target" || k === "filepath" || k === "symbolName") {
        return `${k}=${JSON.stringify(String(v))}`;
      }
      return `${k}=${v}`;
    })
    .join(", ");

  return `Use the ${cliToolName} tool with parameters: ${argsDesc}. Return the result directly without additional explanation.`;
}

/**
 * Response from the CLI process.
 */
export interface CliBridgeResponse {
  success: boolean;
  data?: {
    text: string;
    toolCalls?: Array<{
      name: string;
      args: Record<string, unknown>;
      result: string;
    }>;
  };
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}
