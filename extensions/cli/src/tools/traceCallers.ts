/**
 * TraceCallers Tool
 *
 * Traces "who calls this function" using LSP callHierarchy/incomingCalls.
 * Builds a call hierarchy tree up to depth 3.
 */

import * as fs from "fs";
import * as path from "path";

import {
  CallHierarchyItem,
  CallHierarchyIncomingCall,
  LspClient,
} from "./lsp/LspClient.js";
import { Tool } from "./types.js";

const MAX_DEPTH = 3;

interface CallTreeNode {
  name: string;
  kind: number;
  file: string;
  line: number;
  children: CallTreeNode[];
}

function buildTreeString(
  node: CallTreeNode,
  prefix: string,
  isLast: boolean,
  depth: number,
): string[] {
  if (depth > MAX_DEPTH) return [];

  const connector = isLast ? "└── " : "├── ";
  const childPrefix = isLast ? "    " : "│   ";

  const kindNames: Record<number, string> = {
    5: "Class",
    6: "Method",
    9: "Constructor",
    11: "Interface",
    12: "Function",
  };

  const kindName = kindNames[node.kind] || `Kind(${node.kind})`;
  const relPath = path.relative(process.cwd(), node.file) || node.file;
  const lines: string[] = [
    `${prefix}${connector}${node.name} (${kindName}) [${relPath}:${node.line}]`,
  ];

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const childIsLast = i === node.children.length - 1;
    lines.push(
      ...buildTreeString(child, prefix + childPrefix, childIsLast, depth + 1),
    );
  }

  return lines;
}

async function traceCallersRecursive(
  client: LspClient,
  item: CallHierarchyItem,
  depth: number,
  visited: Set<string>,
): Promise<CallTreeNode> {
  let filePath: string;
  try {
    filePath = client.uriToFilePath(item.uri);
  } catch {
    filePath = item.uri.replace(/^file:\/\/\//, "").replace(/^file:\/\//, "");
  }

  const node: CallTreeNode = {
    name: item.name,
    kind: item.kind,
    file: filePath,
    line: item.selectionRange.start.line + 1,
    children: [],
  };

  if (depth >= MAX_DEPTH) return node;

  // Unique key to prevent cycles
  const key = `${item.uri}:${item.selectionRange.start.line}:${item.selectionRange.start.character}`;
  if (visited.has(key)) return node;
  visited.add(key);

  try {
    const incoming = await client.getIncomingCalls(item);
    for (const call of incoming) {
      const childNode = await traceCallersRecursive(
        client,
        call.from,
        depth + 1,
        visited,
      );
      node.children.push(childNode);
    }
  } catch {
    // Call hierarchy not supported by this LSP server
  }

  return node;
}

export const traceCallersTool: Tool = {
  name: "TraceCallers",
  displayName: "TraceCallers",
  description: `Trace "who calls this function" using LSP call hierarchy.
Builds a call hierarchy tree showing all callers, their callers, etc.
Maximum depth: 3 levels.`,
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
  readonly: true,
  isBuiltIn: true,
  preprocess: async (args) => {
    const symbolName = args.symbolName;
    if (!symbolName || typeof symbolName !== "string") {
      throw new Error("symbolName arg is required");
    }
    const filepath = args.filepath
      ? path.resolve(process.cwd(), args.filepath)
      : path.resolve(process.cwd(), args.filepath || "");

    return {
      args: { ...args, filepath },
      preview: [
        {
          type: "text",
          content: `Will trace callers of "${symbolName}" in ${filepath}`,
        },
      ],
    };
  },
  run: async (args: {
    symbolName: string;
    filepath: string;
    line?: number;
  }): Promise<string> => {
    const { symbolName, filepath, line } = args;

    if (!fs.existsSync(filepath)) {
      return `File does not exist: ${filepath}`;
    }

    let client: LspClient;
    try {
      client = LspClient.getInstance(path.dirname(filepath));
      await client.initialize();
    } catch (err: any) {
      return `Error initializing LSP: ${err.message}\n\nCall hierarchy requires an LSP server like typescript-language-server, rust-analyzer, or gopls.`;
    }

    try {
      // Find the symbol position
      let pos = await client.findSymbolPosition(filepath, symbolName);
      if (!pos && line !== undefined) {
        pos = { line: line - 1, character: 0 };
      }

      if (!pos) {
        return `Symbol "${symbolName}" not found in ${filepath}.`;
      }

      // Prepare call hierarchy
      const items = await client.prepareCallHierarchy(
        filepath,
        pos.line,
        pos.character,
      );

      if (items.length === 0) {
        return `Call hierarchy not available for "${symbolName}". The LSP server may not support call hierarchy for this language.`;
      }

      const rootItem = items[0];
      const root: CallTreeNode = {
        name: rootItem.name,
        kind: rootItem.kind,
        file: filepath,
        line: rootItem.selectionRange.start.line + 1,
        children: [],
      };

      // Trace callers recursively
      try {
        const incoming = await client.getIncomingCalls(rootItem);
        const visited = new Set<string>();
        visited.add(
          `${rootItem.uri}:${rootItem.selectionRange.start.line}:${rootItem.selectionRange.start.character}`,
        );

        for (const call of incoming) {
          const childNode = await traceCallersRecursive(
            client,
            call.from,
            1,
            visited,
          );
          root.children.push(childNode);
        }
      } catch {
        // Call hierarchy not supported
      }

      // Build output
      if (root.children.length === 0) {
        return `No callers found for "${symbolName}". The function may not be called anywhere, or the LSP server doesn't support call hierarchy for this language.`;
      }

      const lines: string[] = [
        `Call hierarchy for "${symbolName}" (who calls this function):`,
        `  ${root.name} (root) [${path.relative(process.cwd(), filepath)}:${root.line}]`,
        "",
      ];

      for (let i = 0; i < root.children.length; i++) {
        const child = root.children[i];
        const isLast = i === root.children.length - 1;
        lines.push(...buildTreeString(child, "  ", isLast, 1));
      }

      return lines.join("\n");
    } catch (err: any) {
      return `Error tracing callers: ${err.message}`;
    }
  },
};
