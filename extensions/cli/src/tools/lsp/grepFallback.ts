/**
 * Grep-based fallback for LSP tools.
 *
 * When an LSP server (e.g. jdtls for Java) is not installed or fails to start,
 * the code-intelligence tools must still return *something useful* instead of a
 * red "Error initializing LSP" message. These helpers do lightweight source
 * analysis with regex/grep so the user gets an approximate result with zero
 * configuration.
 *
 * This is intentionally a best-effort approximation, NOT a replacement for LSP:
 *  - references are matched by textual symbol name (may include false positives
 *    from substring matches)
 *  - call hierarchy is a single-level approximation
 */

import * as fs from "fs";
import * as path from "path";

const SEARCH_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts",
  ".py", ".go", ".rs", ".java", ".cs", ".cpp", ".cc", ".c", ".h", ".hpp",
  ".rb", ".php", ".kt", ".scala", ".swift",
];

function walkFiles(dir: string, maxFiles: number): string[] {
  const results: string[] = [];
  const stack: string[] = [dir];
  const seen = new Set<string>();

  while (stack.length && results.length < maxFiles) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(current, entry.name);
      if (seen.has(full)) continue;
      seen.add(full);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        if (SEARCH_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
          results.push(full);
        }
      }
    }
  }
  return results;
}

function readLines(file: string): string[] {
  try {
    return fs.readFileSync(file, "utf-8").split("\n");
  } catch {
    return [];
  }
}

export interface ReferenceHit {
  file: string;
  lineNumber: number; // 1-based
  line: string;
}

/**
 * Find textual references to a symbol across the workspace.
 * Returns up to `max` hits. `symbolName` may be "Class.method" — the method
 * part is matched separately so we catch both.
 */
export function grepReferences(
  symbolName: string,
  workspaceDir: string,
  max = 100,
): ReferenceHit[] {
  const parts = symbolName.split(".");
  const primary = parts[parts.length - 1] || symbolName;
  const escaped = primary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match the symbol as a whole word, possibly qualified (Foo.bar / bar()
  const re = new RegExp(`\\b${escaped}\\b`, "g");

  const hits: ReferenceHit[] = [];
  const files = walkFiles(workspaceDir, 800);
  for (const file of files) {
    if (hits.length >= max) break;
    const lines = readLines(file);
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        // reset lastIndex consumed by the test above
        re.lastIndex = 0;
        hits.push({
          file,
          lineNumber: i + 1,
          line: lines[i].trim(),
        });
        if (hits.length >= max) break;
      } else {
        re.lastIndex = 0;
      }
    }
  }
  return hits;
}

export interface CallRelation {
  file: string;
  lineNumber: number;
  line: string;
}

/**
 * Approximate callers: lines that contain `symbolName(` (a call site).
 * Best-effort single-level approximation — not a real call hierarchy.
 */
export function grepCallers(
  symbolName: string,
  workspaceDir: string,
  max = 100,
): CallRelation[] {
  return grepCallPattern(symbolName, workspaceDir, "callers", max);
}

/** Approximate callees: a method body's call sites (lines with `ident(`). */
export function grepCallees(
  symbolName: string,
  filepath: string,
  workspaceDir: string,
  max = 100,
): CallRelation[] {
  return grepCallPattern(symbolName, workspaceDir, "callees", max, filepath);
}

function grepCallPattern(
  symbolName: string,
  workspaceDir: string,
  mode: "callers" | "callees",
  max: number,
  scopeFile?: string,
): CallRelation[] {
  const escaped = symbolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\s*\\(`, "g");
  const hits: CallRelation[] = [];

  const files = scopeFile ? [scopeFile] : walkFiles(workspaceDir, 800);
  for (const file of files) {
    if (hits.length >= max) break;
    const lines = readLines(file);
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      if (re.test(text)) {
        re.lastIndex = 0;
        hits.push({
          file,
          lineNumber: i + 1,
          line: text.trim(),
        });
        if (hits.length >= max) break;
      } else {
        re.lastIndex = 0;
      }
    }
  }
  return hits;
}

/**
 * Read a symbol's definition block from source via regex, when LSP is absent.
 * Finds the declaration (class/interface/function/method) matching `symbolName`
 * and returns the surrounding lines (including preceding comments).
 */
export function grepReadSymbol(
  symbolName: string,
  filepath: string | undefined,
  workspaceDir: string,
  maxLines = 200,
): { file: string; startLine: number; endLine: number; code: string } | null {
  const files = filepath
    ? [filepath]
    : walkFiles(workspaceDir, 500);

  for (const file of files) {
    const lines = readLines(file);
    const escaped = symbolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // declaration patterns: class Foo / interface Foo / function Foo / Foo( / def foo
    const declRe = new RegExp(
      `(class|interface|enum|struct|function|def|method|public|private|protected|static|final|abstract|\\b)\\s+${escaped}\\b|\\b${escaped}\\s*\\(`,
    );
    for (let i = 0; i < lines.length; i++) {
      if (declRe.test(lines[i])) {
        declRe.lastIndex = 0;
        // include preceding comment lines
        let start = i;
        for (let j = i - 1; j >= 0 && j >= i - 30; j--) {
          const t = lines[j].trim();
          if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*") || t === "*/" || t === "") {
            start = j;
          } else break;
        }
        const end = Math.min(lines.length - 1, i + maxLines);
        return {
          file,
          startLine: start + 1,
          endLine: end + 1,
          code: lines.slice(start, end + 1).join("\n"),
        };
      }
      declRe.lastIndex = 0;
    }
  }
  return null;
}

export const GREP_FALLBACK_NOTE =
  "⚠️ LSP server unavailable — results are approximate (textual grep), not semantic. " +
  "Install the language server for your project (e.g. Eclipse JDT.LS for Java support) for precise analysis.";
