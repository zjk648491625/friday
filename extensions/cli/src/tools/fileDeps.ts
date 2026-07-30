/**
 * FileDeps Tool
 *
 * Analyzes file dependency relationships:
 * - Imports: what this file imports
 * - Dependents: what files import this file
 * - Indirect impact: files that depend on dependents (1 level deep)
 */

import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as util from "util";

import { Tool } from "./types.js";

const execPromise = util.promisify(child_process.exec);

/**
 * Check if ripgrep is available.
 */
async function isRipgrepAvailable(): Promise<boolean> {
  try {
    await execPromise("rg --version");
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse import/require statements from a source file.
 */
function parseImports(filePath: string): string[] {
  const imports: string[] = [];
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();

      // ES imports: import ... from '...'
      // import x from 'y'
      // import { x } from 'y'
      // import * as x from 'y'
      // import 'y'
      let match = trimmed.match(
        /import\s+(?:(?:type\s+)?(?:\{[^}]*\}|[^'"]*\s+from\s+)?)?['"]([^'"]+)['"]/,
      );
      if (match) {
        imports.push(match[1]);
        continue;
      }

      // Dynamic import: import('...')
      match = trimmed.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (match) {
        imports.push(match[1]);
        continue;
      }

      // CommonJS require: require('...')
      match = trimmed.match(
        /(?:const|let|var)\s+\w+\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/,
      );
      if (match) {
        imports.push(match[1]);
        continue;
      }

      // require without assignment
      match = trimmed.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (match) {
        imports.push(match[1]);
      }

      // Python imports
      match = trimmed.match(
        /(?:from\s+(\S+)\s+import|import\s+(\S+))/,
      );
      if (match) {
        const pyImport = match[1] || match[2];
        if (pyImport) imports.push(pyImport);
        continue;
      }

      // Go imports (within import block this is harder to parse with regex alone)
      match = trimmed.match(/"([^"]+)"/);
      if (match && trimmed.startsWith("import")) {
        // Single-line go import
        continue; // Handled differently below
      }
    }

    // Go import blocks (multi-line)
    const goImportBlock = content.match(
      /import\s*\(\s*([\s\S]*?)\s*\)/g,
    );
    if (goImportBlock) {
      for (const block of goImportBlock) {
        const pkgMatch = block.matchAll(/"([^"]+)"/g);
        for (const m of pkgMatch) {
          imports.push(m[1]);
        }
      }
    }
  } catch {
    // ignore
  }
  return imports;
}

/**
 * Normalize an import path to a reasonably file-matching pattern.
 */
function normalizeImportToSearchPattern(
  importPath: string,
  currentFile: string,
): string {
  // Skip external packages (no relative path)
  if (
    !importPath.startsWith(".") &&
    !importPath.startsWith("/") &&
    !importPath.match(/^[a-zA-Z]:\\/)
  ) {
    return importPath; // External package, search by name
  }

  // Resolve relative imports
  const currentDir = path.dirname(currentFile);
  const resolved = path.resolve(currentDir, importPath);

  // Try to convert to a search pattern
  return path.basename(resolved).replace(/\./g, "\\.");
}

/**
 * Generate a glob pattern for the file's module name.
 */
function getFileModulePattern(filePath: string): string[] {
  const basename = path.basename(filePath);
  const nameWithoutExt = basename.replace(/\.[^.]+$/, "");

  // Generate patterns that other files might use to import this file
  const patterns: string[] = [];

  // Extension patterns
  const extMap: Record<string, string[]> = {
    ".ts": [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.js"],
    ".tsx": [".tsx", ".ts", ".js", ".jsx", "/index.tsx", "/index.ts"],
    ".js": [".js", ".jsx", ".ts", ".tsx", "/index.js", "/index.ts"],
    ".jsx": [".jsx", ".js", ".tsx", ".ts", "/index.jsx", "/index.js"],
    ".py": [".py", "/__init__.py"],
    ".go": [""], // Go uses package names
    ".rs": [".rs", "/mod.rs"],
  };

  const ext = path.extname(filePath).toLowerCase();
  const variants = extMap[ext] || [ext];

  for (const variant of variants) {
    if (variant.startsWith("/")) {
      patterns.push(`${nameWithoutExt}${variant}`);
    } else {
      patterns.push(`${nameWithoutExt}${variant}`);
    }
  }

  return patterns;
}

/**
 * Search for files that reference this module.
 */
async function findDependents(
  filePath: string,
): Promise<Array<{ file: string; line: number }>> {
  const basename = path.basename(filePath);
  const nameWithoutExt = basename.replace(/\.[^.]+$/, "");
  const workspaceDir = process.cwd();

  const dependents: Array<{ file: string; line: number }> = [];

  // Search for the filename and module name patterns in import statements
  const patterns = getFileModulePattern(filePath);

  const hasRipgrep = await isRipgrepAvailable();

  for (const pattern of patterns) {
    try {
      let stdout = "";

      if (hasRipgrep) {
        // Search for import/require statements containing this pattern
        const { stdout: out } = await execPromise(
          `rg --line-number --no-heading "${pattern.replace(/\\/g, "\\\\")}" "${workspaceDir}" --glob "!node_modules" --glob "!.git" --max-count 200`,
          { timeout: 10000 },
        );
        stdout = out;
      } else {
        // Fallback to grep
        const isWindows = process.platform === "win32";
        if (isWindows) {
          try {
            const { stdout: out } = await execPromise(
              `findstr /S /N /P "${pattern.replace(/\\/g, "\\\\")}" *.ts *.tsx *.js *.jsx *.py *.go *.rs`,
              { cwd: workspaceDir, timeout: 10000 },
            );
            stdout = out;
          } catch {
            // findstr returns error when no matches
          }
        } else {
          try {
            const { stdout: out } = await execPromise(
              `grep -r --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.py" --include="*.go" --include="*.rs" -l "${pattern.replace(/\\/g, "\\\\")}" . --exclude-dir=node_modules --exclude-dir=.git | head -200`,
              { cwd: workspaceDir, timeout: 10000 },
            );
            stdout = out;
          } catch {
            // grep returns non-zero when no matches
          }
        }
      }

      if (stdout) {
        for (const line of stdout.trim().split("\n")) {
          const parts = line.split(":");
          if (parts.length >= 2) {
            const file = parts[0];
            const lineNum = parseInt(parts[1], 10);
            if (file !== path.relative(workspaceDir, filePath) && !isNaN(lineNum)) {
              // Filter for lines that look like import statements
              const fullPath = path.resolve(workspaceDir, file);
              if (
                fs.existsSync(fullPath) &&
                !dependents.some((d) => d.file === fullPath)
              ) {
                dependents.push({ file: fullPath, line: lineNum });
              }
            }
          }
        }
      }
    } catch {
      // ignore errors from individual searches
    }
  }

  return dependents;
}

export const fileDepsTool: Tool = {
  name: "FileDeps",
  displayName: "FileDeps",
  description: `Analyze file dependency relationships:
1. Direct imports - what this file imports
2. Dependents - what files import this file
3. Indirect impact - files affected by changes through dependency chain`,
  parameters: {
    type: "object",
    required: ["filepath"],
    properties: {
      filepath: {
        type: "string",
        description: "The file to analyze dependencies for.",
      },
    },
  },
  readonly: true,
  isBuiltIn: true,
  preprocess: async (args) => {
    const filepath = args.filepath;
    if (!filepath || typeof filepath !== "string") {
      throw new Error("filepath arg is required");
    }
    const resolved = path.resolve(process.cwd(), filepath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`File does not exist: ${resolved}`);
    }
    return {
      args: { ...args, filepath: resolved },
      preview: [
        {
          type: "text",
          content: `Will analyze dependencies of: ${resolved}`,
        },
      ],
    };
  },
  run: async (args: { filepath: string }): Promise<string> => {
    const { filepath } = args;
    const relPath = path.relative(process.cwd(), filepath);

    try {
      // 1. Parse direct imports
      const imports = parseImports(filepath);

      // 2. Find dependents (files that import this file)
      const dependents = await findDependents(filepath);

      // 3. Calculate indirect impact (dependents of dependents, 1 level)
      const indirectImpact: string[] = [];
      const seen = new Set<string>();
      seen.add(path.resolve(filepath));

      for (const dep of dependents.slice(0, 20)) {
        if (seen.has(dep.file)) continue;
        seen.add(dep.file);
        try {
          const subdeps = await findDependents(dep.file);
          for (const sub of subdeps.slice(0, 5)) {
            if (!seen.has(sub.file)) {
              indirectImpact.push(sub.file);
              seen.add(sub.file);
            }
          }
        } catch {
          // ignore
        }
      }

      // Build output
      const lines: string[] = [
        `Dependency analysis for: ${relPath}`,
        "=".repeat(60),
        "",
      ];

      // Imports section
      lines.push("📥 Direct Imports:");
      if (imports.length === 0) {
        lines.push("  (no imports detected)");
      } else {
        // Categorize imports
        const external: string[] = [];
        const internal: string[] = [];
        for (const imp of imports) {
          if (imp.startsWith(".") || imp.startsWith("/")) {
            internal.push(imp);
          } else {
            external.push(imp);
          }
        }

        if (internal.length > 0) {
          lines.push("  [Internal]:");
          for (const imp of internal) {
            const resolved = path.resolve(path.dirname(filepath), imp);
            const rel = path.relative(process.cwd(), resolved);
            lines.push(`    ${imp} → ${rel}`);
          }
        }
        if (external.length > 0) {
          lines.push("  [External]:");
          for (const imp of external) {
            lines.push(`    ${imp}`);
          }
        }
      }

      lines.push("");

      // Dependents section
      lines.push("📤 Dependents (files that import this file):");
      if (dependents.length === 0) {
        lines.push("  (no dependents found)");
      } else {
        for (const dep of dependents) {
          const rel = path.relative(process.cwd(), dep.file);
          lines.push(`  ${rel} (line ${dep.line})`);
        }
      }

      lines.push("");

      // Indirect impact section
      lines.push("🔄 Indirect Impact (2nd-degree dependents):");
      if (indirectImpact.length === 0) {
        lines.push("  (no indirect impact detected)");
      } else {
        for (const impact of indirectImpact) {
          const rel = path.relative(process.cwd(), impact);
          lines.push(`  ${rel}`);
        }
      }

      lines.push("");
      lines.push("-".repeat(60));
      lines.push(
        `Summary: ${imports.length} imports, ${dependents.length} dependents, ${indirectImpact.length} indirect impacts`,
      );

      return lines.join("\n");
    } catch (err: any) {
      return `Error analyzing file dependencies: ${err.message}`;
    }
  },
};
