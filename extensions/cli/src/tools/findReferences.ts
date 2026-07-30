/**
 * FindReferences Tool
 *
 * Finds all references to a symbol across the codebase using LSP.
 * Shows file path, line number, and context (1 line before and after).
 * Maximum 100 results.
 */

import * as fs from "fs";
import * as path from "path";

import { LspClient } from "./lsp/LspClient.js";
import { Tool } from "./types.js";

const MAX_REFERENCES = 100;

export const findReferencesTool: Tool = {
  name: "FindReferences",
  displayName: "FindReferences",
  description: `Find all references to a code symbol across the codebase using LSP.
Returns file path, line number, and context lines (1 before, 1 after).
Maximum 100 results.`,
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
  readonly: true,
  isBuiltIn: true,
  preprocess: async (args) => {
    const symbolName = args.symbolName;
    if (!symbolName || typeof symbolName !== "string") {
      throw new Error("symbolName arg is required");
    }
    const filepath = args.filepath
      ? path.resolve(process.cwd(), args.filepath)
      : undefined;

    return {
      args: { ...args, filepath },
      preview: [
        {
          type: "text",
          content: `Will find references to: "${symbolName}"`,
        },
      ],
    };
  },
  run: async (args: {
    symbolName: string;
    filepath?: string;
    line?: number;
  }): Promise<string> => {
    const { symbolName, filepath, line } = args;

    let client: LspClient | null = null;
    const searchDir = filepath
      ? path.dirname(filepath)
      : process.cwd();

    try {
      client = LspClient.getInstance(searchDir);
      await client.initialize();
    } catch (err: any) {
      return `Error initializing LSP: ${err.message}\n\nMake sure an LSP server is installed for your project language.`;
    }

    try {
      let targetFile = filepath;
      let symbolPos: { line: number; character: number } | null = null;

      // Locate the symbol
      if (targetFile && fs.existsSync(targetFile)) {
        symbolPos = await client.findSymbolPosition(targetFile, symbolName);
        if (!symbolPos && line !== undefined) {
          symbolPos = { line: line - 1, character: 0 };
        }
      } else {
        // Search workspace for the symbol
        const searchExtensions = [
          ".ts", ".tsx", ".js", ".jsx", ".mjs",
          ".py", ".go", ".rs", ".java", ".cs",
        ];
        const searchDir = process.cwd();

        const findFiles = (dir: string, depth: number): string[] => {
          if (depth > 3) return [];
          const results: string[] = [];
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.name.startsWith(".") || entry.name === "node_modules")
                continue;
              const full = path.join(dir, entry.name);
              if (entry.isFile() && searchExtensions.includes(path.extname(entry.name).toLowerCase())) {
                results.push(full);
              } else if (entry.isDirectory()) {
                results.push(...findFiles(full, depth + 1));
              }
            }
          } catch {
            // ignore
          }
          return results;
        };

        const files = findFiles(searchDir, 0).slice(0, 500);
        for (const f of files) {
          try {
            symbolPos = await client.findSymbolPosition(f, symbolName);
            if (symbolPos) {
              targetFile = f;
              break;
            }
          } catch {
            // continue
          }
        }
      }

      if (!targetFile || !symbolPos) {
        return `Symbol "${symbolName}" not found. Make sure the symbol name is correct and the file is part of a supported project.`;
      }

      // Find references
      const refs = await client.findReferences(
        targetFile,
        symbolPos.line,
        symbolPos.character,
      );

      if (refs.length === 0) {
        return `No references found for "${symbolName}" in ${targetFile}.`;
      }

      // Limit results
      const limitedRefs = refs.slice(0, MAX_REFERENCES);

      // Group by file
      const byFile = new Map<string, typeof limitedRefs>();
      for (const ref of limitedRefs) {
        const filePath = ref.uri.replace(/^file:\/\/\//, "").replace(/^file:\/\//, "");
        // Fix Windows paths
        const decoded = decodeURIComponent(filePath);
        const normalized = process.platform === "win32" && decoded.startsWith("/")
          ? decoded.slice(1)
          : decoded;
        if (!byFile.has(normalized)) {
          byFile.set(normalized, []);
        }
        byFile.get(normalized)!.push(ref);
      }

      // Build output with context
      const lines: string[] = [
        `References to "${symbolName}" (${limitedRefs.length} results${refs.length > MAX_REFERENCES ? `, showing first ${MAX_REFERENCES} of ${refs.length}` : ""}):`,
        "",
      ];

      for (const [filePath, fileRefs] of byFile) {
        const relPath = path.relative(process.cwd(), filePath) || filePath;
        const exists = fs.existsSync(filePath);

        if (!exists) {
          lines.push(`  ${relPath}:`);
          for (const ref of fileRefs) {
            lines.push(`    Line ${ref.range.start.line + 1}`);
          }
          lines.push("");
          continue;
        }

        const content = fs.readFileSync(filePath, "utf-8");
        const contentLines = content.split("\n");

        lines.push(`  ${relPath}:`);
        for (const ref of fileRefs) {
          const l = ref.range.start.line;
          const contextBefore = l > 0 ? contentLines[l - 1] : null;
          const contextLine = contentLines[l] || "";
          const contextAfter =
            l + 1 < contentLines.length ? contentLines[l + 1] : null;

          lines.push(`    Line ${l + 1}:`);
          if (contextBefore) {
            const trimmed = contextBefore.trim()
              ? contextBefore.substring(0, 120)
              : "(empty)";
            lines.push(`      - | ${trimmed}`);
          }
          const highlighted = contextLine.trim()
            ? contextLine.substring(0, 120)
            : "(empty)";
          lines.push(`      > | ${highlighted}`);
          if (contextAfter) {
            const trimmed = contextAfter.trim()
              ? contextAfter.substring(0, 120)
              : "(empty)";
            lines.push(`      + | ${trimmed}`);
          }
        }
        lines.push("");
      }

      if (refs.length > MAX_REFERENCES) {
        lines.push(
          `[Results truncated: showing ${MAX_REFERENCES} of ${refs.length} references]`,
        );
      }

      return lines.join("\n");
    } catch (err: any) {
      return `Error finding references: ${err.message}`;
    }
  },
};
