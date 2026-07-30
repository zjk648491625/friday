/**
 * ReadSymbol Tool
 *
 * Reads the complete definition of a specified symbol (function, class, etc.)
 * including JSDoc/comments, using LSP document symbols to locate the symbol
 * and then reading the source range from the file.
 */

import * as fs from "fs";
import * as path from "path";

import { LspClient } from "./lsp/LspClient.js";
import { Tool } from "./types.js";

export const readSymbolTool: Tool = {
  name: "ReadSymbol",
  displayName: "ReadSymbol",
  description: `Read the full definition of a code symbol (function, class, interface, etc.)
including JSDoc and comments. Uses LSP to locate the symbol and extracts
the complete source code range.`,
  parameters: {
    type: "object",
    required: ["symbolName", "filepath"],
    properties: {
      symbolName: {
        type: "string",
        description: "The name of the symbol to read (e.g., 'findUser', 'UserService').",
      },
      filepath: {
        type: "string",
        description:
          "The file containing the symbol. If not specified, searches all files in the workspace directory.",
      },
      line: {
        type: "number",
        description:
          "Optional: specific line number (1-based) to help locate the symbol when multiple symbols share the name.",
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
          content: `Will read symbol: "${symbolName}"${
            filepath ? ` in ${filepath}` : ""
          }`,
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
      return `Error initializing LSP: ${err.message}`;
    }

    try {
      let targetFile = filepath;
      let symbolPos: { line: number; character: number } | null = null;

      // If filepath is specified, search in that file
      if (targetFile) {
        if (!fs.existsSync(targetFile)) {
          return `File does not exist: ${targetFile}`;
        }
        symbolPos = await client.findSymbolPosition(targetFile, symbolName);

        // If line is specified, also try direct position lookup
        if (!symbolPos && line !== undefined) {
          symbolPos = { line: line - 1, character: 0 };
        }
      } else {
        // Search for the symbol across workspace
        const ext = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java"];

        const searchFiles = (
          dir: string,
          maxFiles: number,
        ): string[] => {
          const results: string[] = [];
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (results.length >= maxFiles) break;
              if (entry.name.startsWith(".") || entry.name === "node_modules")
                continue;
              const fullPath = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                results.push(...searchFiles(fullPath, maxFiles - results.length));
              } else if (entry.isFile() && ext.includes(path.extname(entry.name).toLowerCase())) {
                results.push(fullPath);
              }
            }
          } catch {
            // ignore
          }
          return results;
        };

        const files = searchFiles(process.cwd(), 200);
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
        return `Symbol "${symbolName}" not found${
          filepath ? ` in ${filepath}` : " in workspace"
        }.`;
      }

      // Now get the definition via LSP
      const uriDef = await client.getDefinition(
        targetFile,
        symbolPos.line,
        symbolPos.character,
      );

      // Read the symbol's source code from the file
      let sourceFile = targetFile;
      let startLine = 0;
      let endLine = 0;

      if (uriDef && !Array.isArray(uriDef) && uriDef.range) {
        let defPath: string;
        try {
          defPath = client.uriToFilePath(uriDef.uri);
        } catch {
          defPath = uriDef.uri.replace(/^file:\/\/\//, "").replace(/^file:\/\//, "");
        }
        if (fs.existsSync(defPath)) {
          sourceFile = defPath;
        }
        startLine = (uriDef as any).range.start.line;
        endLine = (uriDef as any).range.end.line;
      } else {
        // Fall back to reading from the document symbols
        const symbols = await client.getDocumentSymbols(targetFile);
        const searchSymbols = (syms: any[]): any => {
          for (const sym of syms) {
            if (sym.name === symbolName) return sym;
            if (sym.children) {
              const found = searchSymbols(sym.children);
              if (found) return found;
            }
          }
          return null;
        };

        const found = searchSymbols(symbols);
        if (found && found.range) {
          startLine = found.range.start.line;
          endLine = found.range.end.line;
        } else {
          startLine = symbolPos.line;
          endLine = symbolPos.line + 5; // Read a few lines as fallback
        }
      }

      // Read the source with context (include comments before the symbol)
      const fileContent = fs.readFileSync(sourceFile, "utf-8");
      const allLines = fileContent.split("\n");

      // Try to include preceding JSDoc/comments
      let commentStart = startLine;
      for (let i = startLine - 1; i >= 0 && i >= startLine - 30; i--) {
        const trimmed = allLines[i].trim();
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

      const actualStart = Math.max(0, commentStart);
      const actualEnd = Math.min(allLines.length - 1, endLine + 2);
      const codeLines = allLines.slice(actualStart, actualEnd + 1);

      const relPath = path.relative(process.cwd(), sourceFile);
      let output = `Symbol: "${symbolName}" in ${relPath} (lines ${actualStart + 1}-${actualEnd + 1})\n`;
      output += `${"=".repeat(60)}\n`;
      output += codeLines.join("\n");

      return output;
    } catch (err: any) {
      return `Error reading symbol: ${err.message}`;
    }
  },
};
