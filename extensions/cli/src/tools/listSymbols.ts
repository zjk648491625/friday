/**
 * ListSymbols Tool
 *
 * Lists all code symbols (functions, classes, interfaces, etc.) in a file or directory
 * using LSP document symbols. Supports filtering by kind and name pattern.
 * Maximum 200 results.
 */

import * as fs from "fs";
import * as path from "path";

import {
  DocumentSymbol,
  LspClient,
  SymbolKindNames,
} from "./lsp/LspClient.js";
import { Tool } from "./types.js";

const MAX_SYMBOLS = 200;

function flattenSymbols(
  symbols: DocumentSymbol[],
): DocumentSymbol[] {
  const result: DocumentSymbol[] = [];
  for (const sym of symbols) {
    result.push(sym);
    if (sym.children) {
      result.push(...flattenSymbols(sym.children));
    }
  }
  return result;
}

function matchKindFilter(
  symbol: DocumentSymbol,
  kindFilter?: string[],
): boolean {
  if (!kindFilter || kindFilter.length === 0) return true;
  const kindName = SymbolKindNames[symbol.kind] || String(symbol.kind);
  return kindFilter.some(
    (k) => kindName.toLowerCase() === k.toLowerCase(),
  );
}

function matchNamePattern(name: string, pattern?: string): boolean {
  if (!pattern) return true;
  try {
    const regex = new RegExp(pattern, "i");
    return regex.test(name);
  } catch {
    // If regex is invalid, treat as substring match
    return name.toLowerCase().includes(pattern.toLowerCase());
  }
}

async function collectFiles(
  targetPath: string,
): Promise<string[]> {
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    return [targetPath];
  }

  // Directory: collect all supported source files
  const supportedExtensions = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts",
    ".py", ".pyi",
    ".rs",
    ".go",
    ".java",
    ".cpp", ".cc", ".cxx", ".c", ".h", ".hpp", ".hxx",
    ".cs",
    ".rb",
    ".php",
    ".lua",
  ]);

  const files: string[] = [];
  const walk = (dir: string) => {
    if (files.length >= 100) return; // Limit number of files scanned
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase())) {
          files.push(fullPath);
        }
      }
    } catch {
      // Skip directories we can't read
    }
  };

  walk(targetPath);
  return files;
}

export const listSymbolsTool: Tool = {
  name: "ListSymbols",
  displayName: "ListSymbols",
  description: `List code symbols (functions, classes, interfaces, etc.) in a file or directory using LSP.
Returns symbol name, kind, and location (file, line, column).
Supports filtering by kind (e.g., "Function", "Class") and name pattern (regex).
Maximum 200 results.`,
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
          'Filter by symbol kind. Examples: "Function", "Class", "Interface", "Method", "Variable". Multiple kinds separated by comma: "Function,Class".',
      },
      namePattern: {
        type: "string",
        description:
          "Filter by symbol name using regex pattern or substring. Case-insensitive.",
      },
    },
  },
  readonly: true,
  isBuiltIn: true,
  preprocess: async (args) => {
    const target = args.target;
    if (!target || typeof target !== "string") {
      throw new Error("target arg is required and must be a non-empty string");
    }
    const resolved = path.resolve(process.cwd(), target);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Path does not exist: ${resolved}`);
    }
    return {
      args: { ...args, target: resolved },
      preview: [
        {
          type: "text",
          content: `Will list symbols in: ${resolved}`,
        },
      ],
    };
  },
  run: async (args: {
    target: string;
    kind?: string;
    namePattern?: string;
  }): Promise<string> => {
    const { target, kind, namePattern } = args;
    const kindFilter = kind
      ? kind.split(",").map((k) => k.trim())
      : undefined;

    let client: LspClient | null = null;
    try {
      client = LspClient.getInstance(target);
      await client.initialize();
    } catch (err: any) {
      return `Error initializing LSP: ${err.message}\n\nMake sure an LSP server is installed for your project language.`;
    }

    try {
      const files = await collectFiles(target);
      if (files.length === 0) {
        return `No supported source files found in: ${target}`;
      }

      const allSymbols: Array<{
        symbol: DocumentSymbol;
        file: string;
      }> = [];

      for (const filePath of files) {
        if (allSymbols.length >= MAX_SYMBOLS) break;

        try {
          const symbols = await client.getDocumentSymbols(filePath);
          const flat = flattenSymbols(symbols);

          for (const sym of flat) {
            if (allSymbols.length >= MAX_SYMBOLS) break;
            if (!matchKindFilter(sym, kindFilter)) continue;
            if (!matchNamePattern(sym.name, namePattern)) continue;
            allSymbols.push({ symbol: sym, file: filePath });
          }
        } catch {
          // Skip files that fail to parse
        }
      }

      if (allSymbols.length === 0) {
        let msg = `No symbols found in: ${target}`;
        if (kindFilter) msg += ` with kind filter: ${kindFilter.join(", ")}`;
        if (namePattern) msg += ` matching pattern: "${namePattern}"`;
        return msg;
      }

      const lines: string[] = [
        `Symbols in ${target} (${allSymbols.length} results):`,
        "",
      ];

      for (const { symbol, file } of allSymbols) {
        const kindName = SymbolKindNames[symbol.kind] || `Kind(${symbol.kind})`;
        const relPath = path.relative(process.cwd(), file);
        const line = symbol.range.start.line + 1; // LSP uses 0-based lines
        const col = symbol.range.start.character;
        const indent = symbol.name.startsWith("  ") ? "" : "";
        lines.push(
          `  ${kindName.padEnd(12)} ${indent}${symbol.name}  [${relPath}:${line}:${col}]`,
        );

        // Show children inline with indentation
        if (symbol.children && symbol.children.length > 0) {
          for (const child of symbol.children) {
            const childKind = SymbolKindNames[child.kind] || `Kind(${child.kind})`;
            lines.push(
              `    ${childKind.padEnd(10)} ${child.name}  [${relPath}:${child.range.start.line + 1}:${child.range.start.character}]`,
            );
          }
        }
      }

      if (allSymbols.length >= MAX_SYMBOLS) {
        lines.push(`\n[Results truncated at ${MAX_SYMBOLS} symbols]`);
      }

      return lines.join("\n");
    } catch (err: any) {
      return `Error listing symbols: ${err.message}`;
    }
  },
};
