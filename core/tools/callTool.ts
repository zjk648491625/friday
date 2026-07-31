import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { ContextItem, McpUiState, Tool, ToolCall, ToolExtras } from "..";
import { MCPManagerSingleton } from "../context/mcp/MCPManagerSingleton";
import { FridayError, FridayErrorReason } from "../util/errors";
import { canParseUrl } from "../util/url";
import { BuiltInToolNames } from "./builtIn";

import { codebaseToolImpl } from "./implementations/codebaseTool";
import { createNewFileImpl } from "./implementations/createNewFile";
import { createRuleBlockImpl } from "./implementations/createRuleBlock";
import { fetchUrlContentImpl } from "./implementations/fetchUrlContent";
import { fileGlobSearchImpl } from "./implementations/globSearch";
import { grepSearchImpl } from "./implementations/grepSearch";
import { lsToolImpl } from "./implementations/lsTool";
import { readCurrentlyOpenFileImpl } from "./implementations/readCurrentlyOpenFile";
import { readFileImpl } from "./implementations/readFile";

import { readFileRangeImpl } from "./implementations/readFileRange";
import { readSkillImpl } from "./implementations/readSkill";
import { requestRuleImpl } from "./implementations/requestRule";
import { runTerminalCommandImpl } from "./implementations/runTerminalCommand";
import { searchWebImpl } from "./implementations/searchWeb";
import { viewDiffImpl } from "./implementations/viewDiff";
import { viewRepoMapImpl } from "./implementations/viewRepoMap";
import { viewSubdirectoryImpl } from "./implementations/viewSubdirectory";
import { coerceArgsToSchema, safeParseToolCallArgs } from "./parseArgs";

// CLI bridge
import { initCliBridgeExecutor } from "../cliBridge";

async function callHttpTool(
  url: string,
  args: any,
  extras: ToolExtras,
): Promise<ContextItem[]> {
  const response = await extras.fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      arguments: args,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Failed to call tool at ${url}:\n${JSON.stringify(data)}`);
  }

  return data.output;
}

export function encodeMCPToolUri(mcpId: string, toolName: string): string {
  return `mcp://${encodeURIComponent(mcpId)}/${encodeURIComponent(toolName)}`;
}

export function decodeMCPToolUri(uri: string): [string, string] | null {
  const url = new URL(uri);
  if (url.protocol !== "mcp:") {
    return null;
  }
  return [
    decodeURIComponent(url.hostname),
    decodeURIComponent(url.pathname).slice(1), // to remove leading '/'
  ];
}

async function callToolFromUri(
  uri: string,
  args: any,
  extras: ToolExtras,
): Promise<{
  contextItems: ContextItem[];
  mcpUiState?: McpUiState;
}> {
  const parseable = canParseUrl(uri);
  if (!parseable) {
    throw new Error(`Invalid URI: ${uri}`);
  }
  const parsedUri = new URL(uri);

  switch (parsedUri?.protocol) {
    case "http:":
    case "https:":
      return {
        contextItems: await callHttpTool(uri, args, extras),
      };
    case "mcp:":
      const decoded = decodeMCPToolUri(uri);
      if (!decoded) {
        throw new Error(`Invalid MCP tool URI: ${uri}`);
      }
      const [mcpId, toolName] = decoded;
      const client = MCPManagerSingleton.getInstance().getConnection(mcpId);

      if (!client) {
        throw new Error("MCP connection not found");
      }
      const coercedArgs = coerceArgsToSchema(
        args,
        extras.tool?.function?.parameters,
      );
      const response = await client.client.callTool(
        {
          name: toolName,
          arguments: coercedArgs,
        },
        CallToolResultSchema,
        { timeout: client.options.timeout },
      );

      if (response.isError === true) {
        throw new Error(JSON.stringify(response.content));
      }

      let mcpUiState: McpUiState | undefined = undefined;
      const uiResourceUri =
        extras.tool?.mcpMeta?.ui?.resourceUri ||
        extras.tool?.mcpMeta?.["ui/resourceUri"];
      if (uiResourceUri) {
        try {
          const resource = await client.getResource(uiResourceUri);
          // only single content supported for UI for now
          if (resource.contents?.length) {
            for (const c of resource.contents) {
              if ("text" in c && typeof c.text === "string") {
                mcpUiState = {
                  content: c,
                };
              }
            }
          }

          if (!mcpUiState) {
            console.error(
              "Invalid MCP UI resource content",
              JSON.stringify(resource),
            );
          }
        } catch (e) {
          console.error("Error fetching MCP UI resource", e);
        }
      }

      const contextItems: ContextItem[] = [];
      (response.content as any).forEach((item: any) => {
        if (item.type === "text") {
          contextItems.push({
            name: extras.tool.displayTitle,
            description: "Tool output",
            content: item.text,
            icon: extras.tool.faviconUrl,
          });
        } else if (item.type === "resource") {
          // TODO resource change subscribers https://modelcontextprotocol.io/docs/concepts/resources
          if (item.resource?.blob) {
            contextItems.push({
              name: extras.tool.displayTitle,
              description: "MCP Item Error",
              content:
                "Error: tool call received unsupported blob resource item",
              icon: extras.tool.faviconUrl,
            });
          }
          // TODO account for mimetype? // const mimeType = item.resource.mimeType
          // const uri = item.resource.uri;
          contextItems.push({
            name: extras.tool.displayTitle,
            description: "Tool output",
            content: item.resource.text,
            icon: extras.tool.faviconUrl,
          });
        } else {
          contextItems.push({
            name: extras.tool.displayTitle,
            description: "MCP Item Error",
            content: `Error: tool call received unsupported item of type "${item.type}"`,
            icon: extras.tool.faviconUrl,
          });
        }
      });
      return { contextItems, mcpUiState };
    default:
      throw new Error(`Unsupported protocol: ${parsedUri?.protocol}`);
  }
}

export async function callBuiltInTool(
  functionName: string,
  args: any,
  extras: ToolExtras,
): Promise<ContextItem[]> {
  switch (functionName) {
    case BuiltInToolNames.ReadFile:
      return await readFileImpl(args, extras);
    case BuiltInToolNames.ReadFileRange:
      return await readFileRangeImpl(args, extras);
    case BuiltInToolNames.CreateNewFile:
      return await createNewFileImpl(args, extras);
    case BuiltInToolNames.GrepSearch:
      return await grepSearchImpl(args, extras);
    case BuiltInToolNames.FileGlobSearch:
      return await fileGlobSearchImpl(args, extras);
    case BuiltInToolNames.RunTerminalCommand:
      return await runTerminalCommandImpl(args, extras);
    case BuiltInToolNames.SearchWeb:
      return await searchWebImpl(args, extras);
    case BuiltInToolNames.FetchUrlContent:
      return await fetchUrlContentImpl(args, extras);
    case BuiltInToolNames.ViewDiff:
      return await viewDiffImpl(args, extras);
    case BuiltInToolNames.LSTool:
      return await lsToolImpl(args, extras);
    case BuiltInToolNames.ReadCurrentlyOpenFile:
      return await readCurrentlyOpenFileImpl(args, extras);
    case BuiltInToolNames.CreateRuleBlock:
      return await createRuleBlockImpl(args, extras);
    case BuiltInToolNames.RequestRule:
      return await requestRuleImpl(args, extras);
    case BuiltInToolNames.CodebaseTool:
      return await codebaseToolImpl(args, extras);
    case BuiltInToolNames.ReadSkill:
      return await readSkillImpl(args, extras);
    case BuiltInToolNames.ViewRepoMap:
      return await viewRepoMapImpl(args, extras);
    case BuiltInToolNames.ViewSubdirectory:
      return await viewSubdirectoryImpl(args, extras);
    case BuiltInToolNames.ListSymbols:
    case BuiltInToolNames.FindReferences:
    case BuiltInToolNames.TraceCallers:
    case BuiltInToolNames.TraceCallees:
    case BuiltInToolNames.FileDeps:
    case BuiltInToolNames.ReadSymbol:
      return await cliBridgeImpl(functionName, args, extras);
    default:
      throw new Error(
        `Tool "${functionName}" not found. Available tools: ${Object.values(BuiltInToolNames).join(", ")}`,
      );
  }
}

// ---------------------------------------------------------------------------
// CLI Bridge Implementation
// ---------------------------------------------------------------------------

/**
 * Execute a tool call via the CLI bridge.
 * If CLI is unavailable, falls back to built-in tool composition.
 */
async function cliBridgeImpl(
  functionName: string,
  args: any,
  extras: ToolExtras,
): Promise<ContextItem[]> {
  // Always re-init per workspace — prevents stale cache, auto-starts daemon if found
  const workingDir = extras.ide?.getWorkspaceDirs
    ? (await extras.ide.getWorkspaceDirs())[0]
    : undefined;
  const executor = await initCliBridgeExecutor(workingDir);

  // Try CLI first if available
  if (executor) {
    try {
      const result = await executor.execute({
        toolName: functionName,
        args,
        workingDir,
      });

      if (result.success) {
        return [
          {
            name: extras.tool?.displayTitle || functionName,
            description: "Tool output",
            content: result.text,
            icon: extras.tool?.faviconUrl,
          },
        ];
      }

      // CLI failed (e.g. ENOENT or timeout) — fall through to built-in fallback
      return cliFallbackImpl(
        functionName,
        args,
        extras,
        `⚠️ CLI unavailable: ${result.error}. Using built-in fallback.\n\n`,
      );
    } catch (err: any) {
      return cliFallbackImpl(
        functionName,
        args,
        extras,
        `⚠️ CLI error: ${err.message}. Using built-in fallback.\n\n`,
      );
    }
  }

  // CLI not available — use automatic fallback
  return cliFallbackImpl(functionName, args, extras);
}

// ---------------------------------------------------------------------------
// CLI Fallback Implementations
// ---------------------------------------------------------------------------

/**
 * Automatic fallback when CLI is not installed.
 * Each CLI bridge tool degrades to core built-in tool composition.
 */
async function cliFallbackImpl(
  functionName: string,
  args: any,
  extras: ToolExtras,
  customNote?: string, // optional: injected when CLI spawn fails, falling back
): Promise<ContextItem[]> {
  const displayName = extras.tool?.displayTitle || functionName;
  const icon = extras.tool?.faviconUrl;
  const fallbackNote = customNote ||
    `⚠️ Friday CLI not available — using built-in tool fallback (less precise than LSP).\n` +
    `For full LSP-based analysis install the CLI, then restart the IDE: npm install -g @friday-ai/cli\n\n`;

  try {
    switch (functionName) {
      case BuiltInToolNames.ListSymbols:
        return await fallbackListSymbols(args, extras, displayName, icon, fallbackNote);
      case BuiltInToolNames.FindReferences:
        return await fallbackFindReferences(args, extras, displayName, icon, fallbackNote);
      case BuiltInToolNames.TraceCallers:
        return await fallbackTraceCallers(args, extras, displayName, icon, fallbackNote);
      case BuiltInToolNames.TraceCallees:
        return await fallbackTraceCallees(args, extras, displayName, icon, fallbackNote);
      case BuiltInToolNames.FileDeps:
        return await fallbackFileDeps(args, extras, displayName, icon, fallbackNote);
      case BuiltInToolNames.ReadSymbol:
        return await fallbackReadSymbol(args, extras, displayName, icon, fallbackNote);
      default:
        return [
          {
            name: displayName,
            description: "Tool unavailable",
            content: fallbackNote + `No fallback available for "${functionName}".`,
            icon,
          },
        ];
    }
  } catch (err: any) {
    return [
      {
        name: displayName,
        description: "Fallback error",
        content: fallbackNote + `Fallback error: ${err.message}`,
        icon,
      },
    ];
  }
}

/**
 * Fallback list_symbols: use ls + read_file to show directory structure and file contents.
 */
async function fallbackListSymbols(
  args: any,
  extras: ToolExtras,
  displayName: string,
  icon: any,
  note: string,
): Promise<ContextItem[]> {
  const target = args.target as string;

  // Step 1: List the directory/files
  let dirList: string;
  try {
    const lsResult = await lsToolImpl(
      { dirpath: target || "." },
      extras,
    );
    dirList = lsResult.map((c) => c.content).join("\n");
  } catch {
    dirList = `(could not list: ${target})`;
  }

  // Step 2: Read contents of up to 5 of the top-level files
  let fileContents = "";
  try {
    const filesToRead = extractFilesFromLs(dirList).slice(0, 5);
    for (const f of filesToRead) {
      try {
        const readResult = await readFileImpl(
          { filepath: f },
          extras,
        );
        const content = readResult.map((c) => c.content).join("\n");
        // Extract function/class/export-like lines
        const summary = summarizeSymbols(content, f);
        fileContents += summary + "\n\n";
      } catch {
        // skip unreadable files
      }
    }
  } catch {
    // skip
  }

  return [
    {
      name: displayName,
      description: "Tool output (fallback: ls + read_file)",
      content:
        note +
        `Directory listing for "${target}":\n\n${dirList}\n\n` +
        `Symbol summaries from key files:\n\n${fileContents || "(no additional file details)"}`,
      icon,
    },
  ];
}

/**
 * Fallback find_references: use grep_search for the symbol name.
 */
async function fallbackFindReferences(
  args: any,
  extras: ToolExtras,
  displayName: string,
  icon: any,
  note: string,
): Promise<ContextItem[]> {
  const symbolName = args.symbolName as string;
  if (!symbolName) {
    return [{ name: displayName, description: "Error", content: note + "symbolName is required.", icon }];
  }

  // Escape regex special chars but keep the name searchable
  const escaped = symbolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  try {
    const grepResult = await grepSearchImpl(
      { query: `\\b${escaped}\\b` },
      extras,
    );
    const content = grepResult.map((c) => c.content).join("\n");

    // Deduplicate and limit
    const lines = content.split("\n");
    const unique = [...new Set(lines)].slice(0, 100);

    return [
      {
        name: displayName,
        description: "Tool output (fallback: grep_search)",
        content:
          note +
          `Text search for "${symbolName}" (⚠️ includes comments, strings, and partial matches):\n\n` +
          unique.join("\n") +
          (unique.length >= 100 ? "\n\n[Results truncated at 100 lines]" : ""),
        icon,
      },
    ];
  } catch {
    return [
      {
        name: displayName,
        description: "No results",
        content: note + `No text matches found for "${symbolName}".`,
        icon,
      },
    ];
  }
}

/**
 * Fallback trace_callers: grep for function call patterns (caller -> callee).
 */
async function fallbackTraceCallers(
  args: any,
  extras: ToolExtras,
  displayName: string,
  icon: any,
  note: string,
): Promise<ContextItem[]> {
  return fallbackTraceCallHierarchy(args, extras, displayName, icon, note, "callers");
}

/**
 * Fallback trace_callees: grep for function definitions called by this function.
 */
async function fallbackTraceCallees(
  args: any,
  extras: ToolExtras,
  displayName: string,
  icon: any,
  note: string,
): Promise<ContextItem[]> {
  return fallbackTraceCallHierarchy(args, extras, displayName, icon, note, "callees");
}

async function fallbackTraceCallHierarchy(
  args: any,
  extras: ToolExtras,
  displayName: string,
  icon: any,
  note: string,
  direction: "callers" | "callees",
): Promise<ContextItem[]> {
  const symbolName = args.symbolName as string;
  const filepath = args.filepath as string;

  if (!symbolName) {
    return [{ name: displayName, description: "Error", content: note + "symbolName is required.", icon }];
  }

  const results: string[] = [];

  // Step 1: Find the symbol definition
  const escaped = symbolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  try {
    if (direction === "callers") {
      // Search for calls to this function: symbolName(
      const grepResult1 = await grepSearchImpl(
        { query: `\\b${escaped}\\s*\\(` },
        extras,
      );
      const content1 = grepResult1.map((c) => c.content).join("\n");
      const lines1 = [...new Set(content1.split("\n"))].slice(0, 50);

      results.push(`=== Who calls "${symbolName}"? (text search fallback) ===`);
      results.push("(⚠️ Includes the definition itself and comments — not precise)");
      results.push("");
      results.push(...lines1);

      // Step 2: For each caller found, also search for what calls them (depth 2)
      if (filepath) {
        results.push("");
        results.push("=== Second-level callers (calls to top callers) ===");
        try {
          const grepResult2 = await grepSearchImpl(
            { query: `\\b(?:${extractTopCallerNames(lines1, symbolName)})\\s*\\(` },
            extras,
          );
          const content2 = grepResult2.map((c) => c.content).join("\n");
          const lines2 = [...new Set(content2.split("\n"))].slice(0, 30);
          results.push(...lines2);
        } catch {
          results.push("(second-level search skipped)");
        }
      }

      results.push("");
      results.push("💡 For precise call hierarchy, install the CLI: npm install -g @friday-ai/cli");
    } else {
      // Callees: read the file containing the symbol, extract function calls from it
      if (filepath) {
        try {
          const readResult = await readFileImpl({ filepath }, extras);
          const fileContent = readResult.map((c) => c.content).join("\n");

          // Find the function definition and extract calls from it
          const symbolSection = extractSymbolSection(fileContent, symbolName);
          const calls = extractFunctionCalls(symbolSection);

          results.push(`=== What "${symbolName}" calls? (text analysis fallback) ===`);
          results.push("(⚠️ Based on text extraction, not AST — may be imprecise)");
          results.push("");
          results.push(`Function section:\n\`\`\`\n${symbolSection.slice(0, 2000)}\n\`\`\``);
          results.push("");
          results.push(`Detected calls (${calls.length}):`);
          results.push(...calls.map((c) => `  → ${c}`));
          results.push("");
          results.push("💡 For precise call hierarchy, install the CLI: npm install -g @friday-ai/cli");
        } catch {
          results.push(`Could not read file: ${filepath}`);
        }
      } else {
        // No filepath: search for the function definition, then extract calls
        try {
          const grepResult = await grepSearchImpl(
            { query: `\\b${escaped}\\b` },
            extras,
          );
          const content = grepResult.map((c) => c.content).join("\n");
          results.push(`=== What "${symbolName}" calls? (text search) ===`);
          results.push("(⚠️ Cannot perform precise callee analysis without a filepath)");
          results.push("");
          results.push("Occurrences:");
          results.push(...content.split("\n").slice(0, 30));
          results.push("");
          results.push("💡 For precise call hierarchy, install the CLI: npm install -g @friday-ai/cli");
        } catch {
          results.push(`No occurrences found for "${symbolName}".`);
        }
      }
    }
  } catch {
    results.push(`Error searching for "${symbolName}".`);
  }

  return [
    {
      name: displayName,
      description: `Tool output (fallback: grep_search)`,
      content: note + results.join("\n"),
      icon,
    },
  ];
}

/**
 * Fallback file_deps: grep for import/require statements.
 */
async function fallbackFileDeps(
  args: any,
  extras: ToolExtras,
  displayName: string,
  icon: any,
  note: string,
): Promise<ContextItem[]> {
  const filepath = args.filepath as string;
  if (!filepath) {
    return [{ name: displayName, description: "Error", content: note + "filepath is required.", icon }];
  }

  const results: string[] = [];

  // Step 1: Extract imports from the file
  let imports = "";
  try {
    const readResult = await readFileImpl({ filepath }, extras);
    const fileContent = readResult.map((c) => c.content).join("\n");
    imports = extractImportLines(fileContent);
  } catch {
    imports = "(could not read file)";
  }

  results.push("📥 Direct Imports:");
  results.push(imports || "(none detected)");
  results.push("");

  // Step 2: Find dependents (files that import this file)
  const basename = filepath.replace(/^.*[/\\]/, "").replace(/\.[^.]+$/, "");
  const escaped = basename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  try {
    const grepResult = await grepSearchImpl(
      { query: `(?:from|require)\\s*['\"].*${escaped}['\"]|import.*${escaped}` },
      extras,
    );
    const dependents = grepResult.map((c) => c.content).join("\n");
    const depLines = [...new Set(dependents.split("\n"))].slice(0, 30);
    results.push(`📤 Dependents (files importing "${basename}"):`);
    results.push(...depLines.slice(0, 20));
    if (depLines.length === 0) results.push("(none detected)");
  } catch {
    results.push("📤 Dependents: (search failed)");
  }

  results.push("");
  results.push("💡 For precise dependency analysis (including indirect impact), install the CLI: npm install -g @friday-ai/cli");

  return [
    {
      name: displayName,
      description: "Tool output (fallback: read_file + grep_search)",
      content: note + results.join("\n"),
      icon,
    },
  ];
}

/**
 * Fallback read_symbol: use read_file with line/pattern-based extraction.
 */
async function fallbackReadSymbol(
  args: any,
  extras: ToolExtras,
  displayName: string,
  icon: any,
  note: string,
): Promise<ContextItem[]> {
  const symbolName = args.symbolName as string;
  const filepath = args.filepath as string;

  if (!symbolName || !filepath) {
    return [
      {
        name: displayName,
        description: "Error",
        content: note + "Both symbolName and filepath are required.",
        icon,
      },
    ];
  }

  try {
    const readResult = await readFileImpl({ filepath }, extras);
    const fileContent = readResult.map((c) => c.content).join("\n");

    // Extract the symbol section (definition + surrounding context)
    const section = extractSymbolSection(fileContent, symbolName);

    if (!section.trim()) {
      // Try grep-based fallback
      const escaped = symbolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      try {
        const grepResult = await grepSearchImpl(
          { query: `\\b${escaped}\\b` },
          extras,
        );
        const grepContent = grepResult.map((c) => c.content).join("\n");
        return [
          {
            name: displayName,
            description: "Tool output (fallback: grep_search)",
            content:
              note +
              `Symbol "${symbolName}" not precisely located via text extraction. ` +
              `Showing grep matches:\n\n${grepContent.slice(0, 3000)}`,
            icon,
          },
        ];
      } catch {
        return [
          {
            name: displayName,
            description: "Not found",
            content:
              note +
              `Symbol "${symbolName}" not found in ${filepath}.`,
            icon,
          },
        ];
      }
    }

    return [
      {
        name: displayName,
        description: "Tool output (fallback: read_file + text extraction)",
        content:
          note +
          `Definition of "${symbolName}" from ${filepath} (⚠️ text-based extraction, may include extra lines):\n\n` +
          `\`\`\`\n${section}\n\`\`\``,
        icon,
      },
    ];
  } catch (err: any) {
    return [
      {
        name: displayName,
        description: "Error",
        content: note + `Could not read ${filepath}: ${err.message}`,
        icon,
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Fallback Helper Utilities
// ---------------------------------------------------------------------------

/** Extract file paths from ls output. */
function extractFilesFromLs(lsOutput: string): string[] {
  const files: string[] = [];
  const lines = lsOutput.split("\n");
  for (const line of lines) {
    // Match patterns like "filename.ts (file, 1234 bytes)"
    const match = line.match(/^(\S+)\s+\(file/);
    if (match) files.push(match[1]);
  }
  return files;
}

/** Summarize function/class/export declarations from file content. */
function summarizeSymbols(content: string, filename: string): string {
  const lines = content.split("\n");
  const symbols: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Match common declaration patterns
    if (
      /^(export\s+)?(async\s+)?function\s+\w+/.test(line) ||
      /^(export\s+)?(abstract\s+)?class\s+\w+/.test(line) ||
      /^(export\s+)?interface\s+\w+/.test(line) ||
      /^(export\s+)?(const|let|var)\s+\w+/.test(line) ||
      /^(export\s+)?enum\s+\w+/.test(line) ||
      /^(export\s+)?type\s+\w+/.test(line) ||
      /^(export\s+)?default\s+(function|class)/.test(line)
    ) {
      symbols.push(`  L${i + 1}: ${line.slice(0, 120)}`);
    }
  }

  return `[${filename}] ${symbols.length} declarations:\n${symbols.join("\n")}`;
}

/** Extract import/require lines from file content. */
function extractImportLines(content: string): string {
  const lines = content.split("\n");
  const imports: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith("import ") ||
      trimmed.startsWith("export ") && trimmed.includes(" from ") ||
      /\brequire\s*\(/.test(trimmed) ||
      trimmed.startsWith("from ") ||
      (trimmed.startsWith("//") && trimmed.includes("import")) // commented imports
    ) {
      if (!trimmed.startsWith("//")) {
        imports.push(`  ${trimmed.slice(0, 150)}`);
      }
    }
  }

  return imports.join("\n") || "(no import/require lines detected)";
}

/** Extract the section of code containing a symbol definition. */
function extractSymbolSection(content: string, symbolName: string): string {
  const lines = content.split("\n");
  const namePatterns = [
    new RegExp(`\\b(function|class|interface|enum|type|const|let|var)\\s+${escapeRegex(symbolName)}\\b`),
    new RegExp(`\\b${escapeRegex(symbolName)}\\s*[=:(<{]`),
    new RegExp(`\\b${escapeRegex(symbolName)}\\s*\\(`),
    new RegExp(`\\b${escapeRegex(symbolName)}\\b`), // fallback: any occurrence
  ];

  let startLine = -1;
  let matchedPattern = -1;

  // Find the best match
  for (let pi = 0; pi < namePatterns.length; pi++) {
    for (let i = 0; i < lines.length; i++) {
      if (namePatterns[pi].test(lines[i])) {
        startLine = i;
        matchedPattern = pi;
        break;
      }
    }
    if (startLine >= 0) break;
  }

  if (startLine < 0) return "";

  // Backtrack to include JSDoc/comments
  let commentStart = startLine;
  for (let i = startLine - 1; i >= 0 && i >= startLine - 20; i--) {
    const trimmed = lines[i].trim();
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/**") ||
      trimmed === "*/" ||
      trimmed === ""
    ) {
      commentStart = i;
    } else {
      break;
    }
  }

  // Forward to find the end of the definition (matching braces roughly)
  let endLine = startLine;
  let braceDepth = 0;
  let started = false;

  for (let i = commentStart; i < lines.length && i < commentStart + 100; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === "{") { braceDepth++; started = true; }
      if (ch === "}") { braceDepth--; }
    }
    endLine = i;
    if (started && braceDepth <= 0) break;
  }

  // If no braces found, take a reasonable chunk
  if (!started) {
    endLine = Math.min(startLine + 20, lines.length - 1);
  }

  const actualStart = Math.max(0, commentStart);
  return lines.slice(actualStart, endLine + 1).join("\n");
}

/** Extract function calls from code text (basic regex-based). */
function extractFunctionCalls(code: string): string[] {
  const calls = new Set<string>();
  const regex = /\b([a-zA-Z_]\w*)\s*\(/g;
  let match;
  while ((match = regex.exec(code)) !== null) {
    const name = match[1];
    // Skip common keywords
    if (
      !["if", "for", "while", "switch", "catch", "return", "throw", "new",
        "typeof", "instanceof", "void", "delete", "import", "export",
        "function", "class", "const", "let", "var", "async", "await",
        "try", "else", "case", "default", "break", "continue", "yield",
        "require", "console", "Object", "Array", "String", "Number",
        "Boolean", "Map", "Set", "Promise", "JSON", "Math", "Error",
      ].includes(name)
    ) {
      calls.add(name);
    }
  }
  return [...calls].sort();
}

/** Escape regex special characters in a string. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extract top caller function names from grep results (for 2nd-level search). */
function extractTopCallerNames(
  grepLines: string[],
  excludeName: string,
): string {
  const names = new Set<string>();
  const funcRegex = /(?:function|class|const|let|var)\s+(\w+)/g;

  for (const line of grepLines.slice(0, 10)) {
    let match;
    while ((match = funcRegex.exec(line)) !== null) {
      const name = match[1];
      if (name !== excludeName && name.length > 2) {
        names.add(name);
      }
    }
  }

  return [...names].slice(0, 5).map(escapeRegex).join("|") || ".";
}

// Handles calls for core/non-client tools
// Returns an error context item if the tool call fails
// Note: Edit tool is handled on client
export async function callTool(
  tool: Tool,
  toolCall: ToolCall,
  extras: ToolExtras,
): Promise<{
  contextItems: ContextItem[];
  errorMessage: string | undefined;
  errorReason?: FridayErrorReason;
  mcpUiState?: McpUiState;
}> {
  try {
    const args = safeParseToolCallArgs(toolCall);
    const { contextItems, mcpUiState } = tool.uri
      ? await callToolFromUri(tool.uri, args, extras)
      : {
          contextItems: await callBuiltInTool(tool.function.name, args, extras),
        };
    if (tool.faviconUrl) {
      contextItems.forEach((item) => {
        item.icon = tool.faviconUrl;
      });
    }

    return {
      contextItems,
      errorMessage: undefined,
      mcpUiState,
    };
  } catch (e) {
    let errorMessage = `${e}`;
    let errorReason: FridayErrorReason | undefined;

    if (e instanceof FridayError) {
      errorMessage = e.message;
      errorReason = e.reason;
    } else if (e instanceof Error) {
      errorMessage = e.message;
    }

    return {
      contextItems: [],
      errorMessage,
      errorReason,
    };
  }
}
