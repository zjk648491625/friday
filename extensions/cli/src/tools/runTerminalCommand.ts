import { ChildProcess, execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";

import {
  evaluateTerminalCommandSecurity,
  type ToolPolicy,
} from "@friday-ai/terminal-security";

import { backgroundJobService } from "../services/BackgroundJobService.js";
import { services } from "../services/index.js";
import { telemetryService } from "../telemetry/telemetryService.js";
import {
  isGitCommitCommand,
  isPullRequestCommand,
} from "../telemetry/utils.js";
import { backgroundSignalManager } from "../util/backgroundSignalManager.js";
import { emitBashToolEnded, emitBashToolStarted } from "../util/cli.js";
import {
  parseEnvNumber,
  truncateOutputFromStart,
} from "../util/truncateOutput.js";

import { Tool, ToolRunContext } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard timeout: absolute maximum runtime (default 180s) */
const DEFAULT_HARD_TIMEOUT_MS = 180_000;

/** Idle timeout: maximum time without output before considered stuck (90s) */
const DEFAULT_IDLE_TIMEOUT_MS = 90_000;

/** Max hard timeout cap (10 minutes) */
const MAX_HARD_TIMEOUT_S = 600;

// Output truncation defaults
const DEFAULT_BASH_MAX_CHARS = 50000; // ~12.5k tokens
const DEFAULT_BASH_MAX_LINES = 1000;

// ---------------------------------------------------------------------------
// Destructive command patterns
// ---------------------------------------------------------------------------

/**
 * Destructive command patterns that ALWAYS require user confirmation.
 * Session grants cannot bypass these checks.
 */
const DESTRUCTIVE_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  {
    pattern: /\brm\s+(-[rRf]+\s+)*[~/]/,
    description: "rm -rf (recursive force delete on root/home)",
  },
  {
    pattern: /\brm\s+(-[rRf]+\s+)*\/etc\b/,
    description: "rm on /etc directory",
  },
  {
    pattern: /\brm\s+(-[rRf]+\s+)*\/usr\b/,
    description: "rm on /usr directory",
  },
  {
    pattern: /\brm\s+(-[rRf]+\s+)*\/var\b/,
    description: "rm on /var directory",
  },
  {
    pattern: /\brm\s+-[rRf]+\s+--no-preserve-root\b/,
    description: "rm with --no-preserve-root",
  },
  {
    pattern: /\bdd\s+if=/,
    description: "dd (disk destroyer)",
  },
  {
    pattern: /\bmkfs\./,
    description: "mkfs (format filesystem)",
  },
  {
    pattern: /\bgit\s+push\s+--force\b/,
    description: "git push --force",
  },
  {
    pattern: /\bgit\s+push\s+.*-f\b/,
    description: "git push -f (force push)",
  },
  {
    pattern: /\bDROP\s+TABLE\b/i,
    description: "DROP TABLE (SQL)",
  },
  {
    pattern: /\bDROP\s+DATABASE\b/i,
    description: "DROP DATABASE (SQL)",
  },
  {
    pattern: /\bTRUNCATE\s+(TABLE\s+)?/i,
    description: "TRUNCATE TABLE (SQL)",
  },
  {
    pattern: /\bchmod\s+(-R\s+)?777\b/,
    description: "chmod 777 (world-writable permissions)",
  },
  {
    pattern: /\bchown\s+(-R\s+)?root/,
    description: "chown to root",
  },
  {
    pattern: /\b>:>\s*\/dev\/sd[a-z]/,
    description: "write directly to disk device",
  },
  {
    pattern: /\bfork\s+bomb\b/i,
    description: "fork bomb pattern",
  },
  {
    pattern: /:\s*\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    description: "fork bomb (shell function)",
  },
  {
    pattern: /\bshutdown\s+/,
    description: "shutdown command",
  },
  {
    pattern: /\breboot\b/,
    description: "reboot command",
  },
  {
    pattern: /\bdel\s+\/F\s+\/S\s+\/Q\s+C:\\/i,
    description: "Windows recursive delete on C: drive",
  },
  {
    pattern: /\bformat\s+[A-Z]:/i,
    description: "Windows format drive",
  },
];

/**
 * Check if a command is destructive and requires additional confirmation.
 */
function detectDestructiveCommand(command: string): string[] {
  const detected: string[] = [];
  for (const { pattern, description } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(command)) {
      detected.push(description);
    }
  }
  return detected;
}

// ---------------------------------------------------------------------------
// Error fingerprinting
// ---------------------------------------------------------------------------

/**
 * Extract error fingerprint from command output.
 * Returns the top-N unique error-looking lines.
 */
function extractErrorFingerprint(
  stdout: string,
  stderr: string,
  exitCode: number | null,
  maxLines = 5,
): string[] {
  const combined = stderr
    ? `${stdout}\n${stderr}`
    : stdout;

  if (!combined.trim()) return [];

  const lines = combined.split("\n");
  const errorLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Heuristic: error lines typically contain certain keywords
    const isErrorLike =
      /error/i.test(trimmed) ||
      /fail/i.test(trimmed) ||
      /exception/i.test(trimmed) ||
      /fatal/i.test(trimmed) ||
      /panic/i.test(trimmed) ||
      /traceback/i.test(trimmed) ||
      /cannot/i.test(trimmed) ||
      /not found/i.test(trimmed) ||
      /denied/i.test(trimmed) ||
      /ENOENT/i.test(trimmed) ||
      /EACCES/i.test(trimmed) ||
      /ENOTDIR/i.test(trimmed) ||
      /syntax\s*error/i.test(trimmed) ||
      /type\s*error/i.test(trimmed) ||
      /reference\s*error/i.test(trimmed) ||
      /undefined/i.test(trimmed) ||
      /^\s*at\s+/i.test(trimmed) ||
      /^\s*File\s+".*",\s*line\s+\d+/i.test(trimmed) || // Python traceback
      /^Traceback\s/i.test(trimmed);

    if (isErrorLike) {
      // Truncate long lines
      errorLines.push(trimmed.length > 200 ? trimmed.substring(0, 200) + "..." : trimmed);
    }
  }

  // Deduplicate and take top N
  const unique = [...new Set(errorLines)];
  return unique.slice(0, maxLines);
}

// ---------------------------------------------------------------------------
// Git change detection
// ---------------------------------------------------------------------------

/**
 * Check if the current directory is a git repo.
 */
function isGitRepo(): boolean {
  try {
    execSync("git rev-parse --is-inside-work-tree", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get git status porcelain output.
 */
function getGitStatusPorcelain(): string {
  try {
    return execSync("git status --porcelain", {
      encoding: "utf-8",
      cwd: process.cwd(),
      timeout: 5000,
    }).trim();
  } catch {
    return "";
  }
}

/**
 * Compute the diff between two git status snapshots.
 */
function computeGitChanges(
  before: string,
  after: string,
): { added: string[]; modified: string[]; deleted: string[] } {
  const parse = (status: string): Map<string, string> => {
    const map = new Map<string, string>();
    for (const line of status.split("\n")) {
      if (line.length < 3) continue;
      const code = line.substring(0, 2).trim();
      const file = line.substring(3).trim();
      if (code || file) {
        map.set(file, code);
      }
    }
    return map;
  };

  const beforeMap = parse(before);
  const afterMap = parse(after);

  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  for (const [file, code] of afterMap) {
    if (!beforeMap.has(file)) {
      added.push(file);
    } else if (beforeMap.get(file) !== code) {
      modified.push(file);
    }
  }

  for (const [file] of beforeMap) {
    if (!afterMap.has(file)) {
      deleted.push(file);
    }
  }

  return { added, modified, deleted };
}

// ---------------------------------------------------------------------------
// Shell selection
// ---------------------------------------------------------------------------

/**
 * When running on Windows, but inside WSL, shell commands need to run using the WSL environment.
 */
export function isRunningInWsl(): boolean {
  // WSL only applies when platform reports as Linux
  if (process.platform !== "linux") {
    return false;
  }

  if (process.env.WSL_DISTRO_NAME) {
    return true;
  }

  // Check /proc/version for Microsoft/WSL indicators
  try {
    const procVersion = fs.readFileSync("/proc/version", "utf8").toLowerCase();
    return procVersion.includes("microsoft") || procVersion.includes("wsl");
  } catch {
    return false;
  }
}

function getBashMaxChars(): number {
  return parseEnvNumber(
    process.env.FRIDAY_CLI_BASH_MAX_OUTPUT_CHARS,
    DEFAULT_BASH_MAX_CHARS,
  );
}

function getBashMaxLines(): number {
  return parseEnvNumber(
    process.env.FRIDAY_CLI_BASH_MAX_OUTPUT_LINES,
    DEFAULT_BASH_MAX_LINES,
  );
}

/**
 * Get the configured hard timeout in ms.
 */
function getHardTimeoutMs(userTimeout?: number): number {
  if (userTimeout !== undefined) {
    return Math.min(userTimeout, MAX_HARD_TIMEOUT_S) * 1000;
  }
  if (
    process.env.NODE_ENV === "test" &&
    process.env.TEST_TERMINAL_TIMEOUT
  ) {
    return parseInt(process.env.TEST_TERMINAL_TIMEOUT, 10);
  }
  return DEFAULT_HARD_TIMEOUT_MS;
}

/**
 * Get the idle timeout in ms.
 */
function getIdleTimeoutMs(): number {
  return parseEnvNumber(
    process.env.FRIDAY_CLI_BASH_IDLE_TIMEOUT,
    DEFAULT_IDLE_TIMEOUT_MS,
  );
}

/**
 * Helper function to use login shell on Unix/macOS and PowerShell on Windows and available shell in WSL
 */
function getShellCommand(command: string): { shell: string; args: string[] } {
  if (process.platform === "win32") {
    // Windows: Use PowerShell
    return {
      shell: "powershell.exe",
      args: ["-NoLogo", "-ExecutionPolicy", "Bypass", "-Command", command],
    };
  }

  if (isRunningInWsl()) {
    // in WSL, bash is always available
    const wslShell = process.env.SHELL || "/bin/bash";
    return {
      shell: wslShell,
      args: ["-l", "-c", command],
    };
  }

  // Unix/macOS: Use login shell to source .bashrc/.zshrc etc.
  const userShell = process.env.SHELL || "/bin/bash";
  return { shell: userShell, args: ["-l", "-c", command] };
}

// ---------------------------------------------------------------------------
// Process group management
// ---------------------------------------------------------------------------

/**
 * Kill a process and all its children.
 * Unix: uses process group kill (negative PID kills entire group)
 * Windows: uses taskkill /T /F /PID
 */
function killProcessTree(pid: number): void {
  try {
    if (process.platform === "win32") {
      // Windows: taskkill with /T kills the entire process tree
      execSync(`taskkill /T /F /PID ${pid}`, {
        stdio: "ignore",
        timeout: 5000,
      });
    } else {
      // Unix: kill the process group (negative PID)
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        // If process group kill fails, try direct kill
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          // Process already dead
        }
      }

      // Force kill after 3 seconds if still alive
      setTimeout(() => {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          try {
            process.kill(pid, "SIGKILL");
          } catch {
            // already dead
          }
        }
      }, 3000);
    }
  } catch {
    // Ignore errors - process might already be dead
  }
}

// ---------------------------------------------------------------------------
// Background jobs
// ---------------------------------------------------------------------------

export function runCommandInBackground(command: string): {
  success: boolean;
  jobId?: string;
  error?: string;
} {
  const job = backgroundJobService.createJob(command);
  if (!job) {
    return {
      success: false,
      error: "Cannot create background job: limit of 5 concurrent jobs reached",
    };
  }

  const { shell, args } = getShellCommand(command);
  const child = backgroundJobService.startJob(job.id, shell, args);

  if (!child) {
    return {
      success: false,
      error: `Failed to start background job ${job.id}`,
    };
  }

  return {
    success: true,
    jobId: job.id,
  };
}

// ---------------------------------------------------------------------------
// Helper: detect read-only commands
// ---------------------------------------------------------------------------

/**
 * Commands that are safe to consider read-only.
 * These don't modify filesystem state.
 */
const READONLY_COMMANDS = new Set([
  "ls", "dir", "cat", "head", "tail", "less", "more",
  "grep", "find", "wc", "sort", "uniq", "cut", "awk", "sed",
  "echo", "printf", "date", "whoami", "hostname", "pwd",
  "which", "type", "command", "env", "printenv", "uname",
  "id", "groups", "stat", "file", "du", "df", "free",
  "ps", "top", "htop", "uptime", "dmesg", "netstat", "ss",
  "ifconfig", "ip", "ping", "nslookup", "dig", "curl -I",
  "git status", "git log", "git diff", "git show",
  "git branch", "git tag", "git remote",
  "npm list", "npm view", "npm outdated",
  "pip list", "pip show", "pip freeze",
  "Get-ChildItem", "Get-Content", "Select-String",
  "rg", "fd", "bat", "exa", "eza",
]);

/**
 * Check if a command appears to be read-only.
 */
function isReadOnlyCommand(command: string): boolean {
  const trimmedCmd = command.trim().toLowerCase();
  for (const roCmd of READONLY_COMMANDS) {
    if (trimmedCmd.startsWith(roCmd.toLowerCase())) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export const runTerminalCommandTool: Tool = {
  name: "Bash",
  displayName: "Bash",
  description: `Executes a terminal command and returns the output

Commands are automatically executed from the current working directory (${process.cwd()}), so there's no need to change directories with 'cd' commands.

IMPORTANT: To edit files, use Edit/MultiEdit tools instead of bash commands (sed, awk, etc).

Destructive commands (rm -rf, dd, mkfs, git push --force, DROP TABLE, chmod 777, etc.) will ALWAYS require user confirmation, even in session-granted mode.

The tool uses dual timeouts:
- Hard timeout: ${DEFAULT_HARD_TIMEOUT_MS / 1000}s default (configurable via timeout parameter, max ${MAX_HARD_TIMEOUT_S}s)
- Idle timeout: ${DEFAULT_IDLE_TIMEOUT_MS / 1000}s without output (command considered stuck)
`,
  parameters: {
    type: "object",
    required: ["command"],
    properties: {
      command: {
        type: "string",
        description: "The command to execute in the terminal.",
      },
      timeout: {
        type: "number",
        description:
          `Optional timeout in seconds (max ${MAX_HARD_TIMEOUT_S}). Use this parameter for commands that take longer than the default ${DEFAULT_HARD_TIMEOUT_MS / 1000} second timeout.`,
      },
    },
  },
  readonly: false,
  isBuiltIn: true,
  evaluateToolCallPolicy: (
    basePolicy: ToolPolicy,
    parsedArgs: Record<string, unknown>,
  ): ToolPolicy => {
    // First run standard terminal security evaluation
    const policy = evaluateTerminalCommandSecurity(
      basePolicy,
      parsedArgs.command as string,
    );

    // Check for destructive commands - always require user approval
    const command = (parsedArgs.command as string) || "";
    const destructive = detectDestructiveCommand(command);

    if (destructive.length > 0) {
      // Override: ALWAYS require user confirmation for destructive commands
      return {
        ...policy,
        requireUserConfirmation: true,
        requireConfirmationReason: [
          policy.requireConfirmationReason,
          ...destructive.map((d) => `⚠️ Destructive command detected: ${d}`),
        ]
          .filter(Boolean)
          .join("; "),
      };
    }

    return policy;
  },
  preprocess: async (args) => {
    const command = args.command;
    if (!command || typeof command !== "string") {
      throw new Error("command arg is required and must be a non-empty string");
    }

    // Check for destructive commands at preprocess time too
    const destructive = detectDestructiveCommand(command);
    const truncatedCmd =
      command.length > 60 ? command.substring(0, 60) + "..." : command;

    const previews: Array<{ type: "text"; content: string }> = [
      {
        type: "text",
        content: `Will run: ${truncatedCmd}`,
      },
    ];

    if (destructive.length > 0) {
      previews.push({
        type: "text",
        content: `⚠️ WARNING: Destructive command detected: ${destructive.join(", ")}. This will require explicit user confirmation.`,
      });
    }

    return {
      args,
      preview: previews,
    };
  },
  run: async (
    {
      command,
      timeout: userTimeout,
    }: {
      command: string;
      timeout?: number;
    },
    context?: ToolRunContext,
  ): Promise<string> => {
    // Divide limits by parallel tool call count to avoid context overflow
    const parallelCount = context?.parallelToolCallCount ?? 1;
    const baseMaxChars = getBashMaxChars();
    const baseMaxLines = getBashMaxLines();
    const maxChars = Math.floor(baseMaxChars / parallelCount);
    const maxLines = Math.floor(baseMaxLines / parallelCount);

    const hardTimeoutMs = getHardTimeoutMs(userTimeout);
    const idleTimeoutMs = getIdleTimeoutMs();

    // --- Git change detection: snapshot before ---
    let gitStatusBefore = "";
    const skipGitSnapshot = isReadOnlyCommand(command);
    if (!skipGitSnapshot && isGitRepo()) {
      gitStatusBefore = getGitStatusPorcelain();
    }

    emitBashToolStarted();

    const terminalOutput: string = await new Promise((resolve, reject) => {
      const { shell, args } = getShellCommand(command);

      // Spawn with process group management
      // Unix: detached + setsid creates a new process group
      // Windows: detached is sufficient
      const spawnOptions: any = {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      };

      if (process.platform !== "win32") {
        spawnOptions.detached = true;
      }

      const child: ChildProcess = spawn(shell, args, spawnOptions);
      const childPid = child.pid!;

      let stdout = "";
      let stderr = "";
      let hardTimeoutId: NodeJS.Timeout | null = null;
      let idleTimeoutId: NodeJS.Timeout | null = null;
      let isResolved = false;

      // --- Dual timeout system ---

      // Hard timeout: absolute time limit from start
      const startHardTimeout = () => {
        hardTimeoutId = setTimeout(() => {
          if (isResolved) return;
          isResolved = true;

          killProcessTree(childPid);

          let output = stdout + (stderr ? `\nStderr: ${stderr}` : "");
          output += `\n\n[Command timed out after ${hardTimeoutMs / 1000} seconds (hard timeout)]`;

          // Extract error fingerprint on timeout
          if (stderr || stdout) {
            const fingerprint = extractErrorFingerprint(stdout, stderr, null);
            if (fingerprint.length > 0) {
              output += `\n\nError fingerprint:\n  ${fingerprint.join("\n  ")}`;
            }
          }

          cleanup();
          resolve(truncateAndFormat(output, maxChars, maxLines, parallelCount, baseMaxChars, baseMaxLines));
        }, hardTimeoutMs);
      };

      // Idle timeout: resets on every output chunk
      let resetIdleTimeout: () => void;

      const startIdleTimeout = () => {
        resetIdleTimeout = () => {
          if (idleTimeoutId) clearTimeout(idleTimeoutId);
          idleTimeoutId = setTimeout(() => {
            if (isResolved) return;
            isResolved = true;

            killProcessTree(childPid);

            let output = stdout + (stderr ? `\nStderr: ${stderr}` : "");
            output += `\n\n[Command appears stuck - terminated after ${idleTimeoutMs / 1000}s of no output (idle timeout)]`;

            const fingerprint = extractErrorFingerprint(stdout, stderr, null);
            if (fingerprint.length > 0) {
              output += `\n\nError fingerprint:\n  ${fingerprint.join("\n  ")}`;
            }

            cleanup();
            resolve(truncateAndFormat(output, maxChars, maxLines, parallelCount, baseMaxChars, baseMaxLines));
          }, idleTimeoutMs);
        };
        resetIdleTimeout();
      };

      // --- Cleanup ---

      const cleanup = () => {
        if (hardTimeoutId) clearTimeout(hardTimeoutId);
        if (idleTimeoutId) clearTimeout(idleTimeoutId);
        backgroundSignalManager.removeListener(
          "backgroundRequested",
          moveToBackground,
        );
      };

      // --- Output helpers ---

      const appendParallelLimitNote = (output: string): string => {
        if (parallelCount > 1) {
          return (
            output +
            `\n\n(Note: output limit reduced due to ${parallelCount} parallel tool calls. ` +
            `Single-tool limit: ${baseMaxChars.toLocaleString()} characters or ${baseMaxLines.toLocaleString()} lines.)`
          );
        }
        return output;
      };

      const truncateAndFormat = (
        output: string,
        maxC: number,
        maxL: number,
        pCount: number,
        baseMaxC: number,
        baseMaxL: number,
      ): string => {
        const truncationResult = truncateOutputFromStart(output, {
          maxChars: maxC,
          maxLines: maxL,
        });
        return truncationResult.wasTruncated
          ? appendParallelLimitNote(truncationResult.output)
          : truncationResult.output;
      };

      // --- Move to background ---

      const moveToBackground = () => {
        if (isResolved) return;
        isResolved = true;

        cleanup();

        // Detach stdout/stderr listeners
        child.stdout.removeListener("data", onStdout);
        child.stderr.removeListener("data", onStderr);

        const job = backgroundJobService.createJobWithProcess(
          command,
          child as ChildProcess,
          stdout,
        );

        if (job) {
          const outputSoFar = truncateAndFormat(
            stdout,
            maxChars,
            maxLines,
            parallelCount,
            baseMaxChars,
            baseMaxLines,
          );
          resolve(
            `Command moved to background. Job ID: ${job.id}\nOutput so far:\n${outputSoFar}\nUse CheckBackgroundJob("${job.id}") to check status.`,
          );
        } else {
          resolve(
            `Failed to move to background (job limit reached). Command continues in foreground.\nOutput so far: ${stdout}`,
          );
        }
      };

      backgroundSignalManager.on("backgroundRequested", moveToBackground);

      // --- Streaming output ---

      const showCurrentOutput = () => {
        if (!context?.toolCallId) return;
        try {
          const currentOutput =
            stdout + (stderr ? `\nStderr: ${stderr}` : "");
          services.chatHistory.addToolResult(
            context.toolCallId,
            currentOutput,
            "calling",
          );
        } catch {
          // Ignore errors during streaming updates
        }
      };

      // Start both timeouts
      startHardTimeout();
      startIdleTimeout();

      // --- Data handlers ---

      const onStdout = (data: Buffer) => {
        stdout += data.toString();
        resetIdleTimeout(); // Reset idle timeout on output
        showCurrentOutput();
      };

      const onStderr = (data: Buffer) => {
        stderr += data.toString();
        resetIdleTimeout(); // Reset idle timeout on output
        showCurrentOutput();
      };

      child.stdout.on("data", onStdout);
      child.stderr.on("data", onStderr);

      // --- Close handler ---

      child.on("close", (code) => {
        if (isResolved) return;
        isResolved = true;
        cleanup();

        // Git change detection: snapshot after
        let gitChangesNote = "";
        if (!skipGitSnapshot && isGitRepo() && gitStatusBefore) {
          try {
            const gitStatusAfter = getGitStatusPorcelain();
            if (gitStatusAfter !== gitStatusBefore) {
              const changes = computeGitChanges(
                gitStatusBefore,
                gitStatusAfter,
              );
              const allChanges = [
                ...changes.added.map((f) => `  + ${f} (new)`),
                ...changes.modified.map((f) => `  ~ ${f} (modified)`),
                ...changes.deleted.map((f) => `  - ${f} (deleted)`),
              ];
              if (allChanges.length > 0) {
                gitChangesNote =
                  `\n\n⚠️ Git Changes Detected:\n${allChanges.join("\n")}` +
                  `\n(Note: These files were modified outside of the Edit/MultiEdit/Write tools. Consider using those tools for future file modifications.)`;
              }
            }
          } catch {
            // ignore git status errors
          }
        }

        // Track specific git operations only after successful execution
        if (code === 0) {
          if (isGitCommitCommand(command)) {
            telemetryService.recordCommitCreated();
          } else if (isPullRequestCommand(command)) {
            telemetryService.recordPullRequestCreated();
          }
        }

        // Handle error case
        if (code !== 0 || stderr) {
          let output = stdout;
          if (stderr) {
            output = stdout + `\nStderr: ${stderr}`;
          }

          // Extract error fingerprint for non-zero exit
          let fingerprintNote = "";
          if (code !== 0 && code !== null) {
            const fingerprint = extractErrorFingerprint(
              stdout,
              stderr,
              code,
            );
            if (fingerprint.length > 0) {
              fingerprintNote =
                `\n\n🔍 Error Fingerprint (top ${fingerprint.length}):\n  ` +
                fingerprint.join("\n  ");
            }
          }

          const truncated = truncateAndFormat(
            output,
            maxChars,
            maxLines,
            parallelCount,
            baseMaxChars,
            baseMaxLines,
          );

          resolve(
            `${truncated}${fingerprintNote}` +
              `\n\n[Exit code: ${code}]` +
              gitChangesNote,
          );
          return;
        }

        // Success case
        let output = stdout;
        if (stderr) {
          output = stdout + `\nStderr: ${stderr}`;
        }

        const finalOutput =
          truncateAndFormat(
            output,
            maxChars,
            maxLines,
            parallelCount,
            baseMaxChars,
            baseMaxLines,
          ) + gitChangesNote;

        resolve(finalOutput);
      });

      // --- Error handler ---

      child.on("error", (error) => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        killProcessTree(childPid);
        reject(`Error: ${error.message}`);
      });
    });

    emitBashToolEnded();

    return terminalOutput;
  },
};
