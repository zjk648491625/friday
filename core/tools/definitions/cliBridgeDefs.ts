/**
 * Shared definitions for CLI bridge tools.
 * Contains the tool name enum and group name used by all bridge tool definitions.
 */

/** Group name for CLI bridge tools in the UI (rendered as separate group) */
export const CLI_BRIDGE_GROUP_NAME = "LSP Code Graph";

/** Tool names for CLI bridge tools (must match core builtIn enum) */
export enum CliBridgeToolNames {
  ListSymbols = "list_symbols",
  FindReferences = "find_references",
  TraceCallers = "trace_callers",
  TraceCallees = "trace_callees",
  FileDeps = "file_deps",
  ReadSymbol = "read_symbol",
}
