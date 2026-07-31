/**
 * CLI Bridge Executor
 *
 * Mode A: Daemon HTTP — connects to running daemon, auto-starts if needed
 * Mode B: Global spawn — spawns friday command directly
 *
 * If all fail, callTool.ts falls back to built-in grep/read_file.
 */

import { ChildProcess, spawn } from "child_process";
import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import { fileURLToPath } from "node:url";

import {
  CliBinaryInfo,
  locateCliBinary,
  resetFridayPathCache,
} from "./binaryLocator";
import { getPowerShellPath } from "./powershellPath";
import {
  CliBridgeToolCall,
  CORE_TO_CLI_TOOL_NAME,
} from "./protocol";

const DEFAULT_TIMEOUT_MS = 120_000;

export interface ExecutorOptions {
  binaryInfo: CliBinaryInfo;
  timeoutMs?: number;
  workingDir?: string;
}

export interface ExecutorResult {
  success: boolean;
  text: string;
  error?: string;
}

export class CliBridgeExecutor {
  private binaryInfo: CliBinaryInfo;
  private readonly timeoutMs: number;
  private readonly workingDir: string;
  private activeProcesses = new Set<ChildProcess>();
  private daemonProcess: ChildProcess | null = null;

  constructor(options: ExecutorOptions) {
    this.binaryInfo = options.binaryInfo;
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.workingDir = options.workingDir || process.cwd();
  }

  async execute(call: CliBridgeToolCall): Promise<ExecutorResult> {
    if (this.binaryInfo.mode === "daemon") {
      return this.executeViaHttp(call);
    }
    return this.executeViaSpawn(call);
  }

  // -----------------------------------------------------------------------
  // Daemon HTTP
  // -----------------------------------------------------------------------

  private async executeViaHttp(call: CliBridgeToolCall): Promise<ExecutorResult> {
    const cliToolName = CORE_TO_CLI_TOOL_NAME[call.toolName] || call.toolName;
    const url = this.binaryInfo.daemonUrl || `http://127.0.0.1:65432`;

    return new Promise((resolve) => {
      const body = JSON.stringify({ toolName: cliToolName, args: call.args });
      const req = http.request(
        `${url}/tools/call`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
          timeout: this.timeoutMs,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data);
              if (parsed.success && parsed.data?.text) {
                resolve({ success: true, text: parsed.data.text });
              } else {
                resolve({ success: false, text: parsed.data?.text || "", error: parsed.error || "Daemon error" });
              }
            } catch {
              resolve({ success: true, text: data });
            }
          });
        },
      );
      req.on("error", (err) => resolve({ success: false, text: "", error: `Daemon connect failed: ${err.message}` }));
      req.on("timeout", () => { req.destroy(); resolve({ success: false, text: "", error: "Daemon timeout" }); });
      req.write(body);
      req.end();
    });
  }

  // -----------------------------------------------------------------------
  // Spawn via PowerShell (Windows) / shell (Unix) — same as Bash tool
  // -----------------------------------------------------------------------

  private executeViaSpawn(call: CliBridgeToolCall): Promise<ExecutorResult> {
    const prompt = buildSpawnPrompt(call);
    const cwd = call.workingDir || this.workingDir;

    // Absolute path when the locator found the file; null means "hope it's on
    // PATH" (only happens if the CLI is reachable but its file wasn't found).
    const fridayPath = this.binaryInfo.resolvedPath;

    if (process.platform === "win32") {
      // A .cmd shim cannot be started by CreateProcess directly, so route
      // through PowerShell. PowerShell itself is resolved by absolute path so
      // we never depend on PATH containing System32.
      const escapedPrompt = prompt.replace(/'/g, "''");
      const target = fridayPath
        ? `& '${fridayPath.replace(/'/g, "''")}'` // & = call operator, needed for quoted paths
        : "friday";
      const psCommand = `${target} -p --format json --silent '${escapedPrompt}'`;
      return this.doExecSpawn(
        getPowerShellPath(),
        ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psCommand],
        cwd,
      );
    }

    // Unix: the CLI is a real executable — spawn it directly, by absolute path
    // when known so a stripped PATH (GUI-launched IDE) doesn't break it.
    return this.doExecSpawn(
      fridayPath || "friday",
      ["-p", "--format", "json", "--silent", prompt],
      cwd,
    );
  }

  // -----------------------------------------------------------------------
  // Shared spawn
  // -----------------------------------------------------------------------

  /**
   * Normalize a requested cwd into a real, existing directory.
   *
   * The workspace dir from the IDE can be:
   *  - a `file://` URI (IntelliJ/VSCode) — CreateProcess rejects URIs as cwd → ENOENT
   *  - a file path instead of a directory — also rejected → ENOENT
   *  - a nonexistent path
   * Resolve all of these to a valid directory before spawning, otherwise
   * `spawn` fails with ENOENT even though the executable itself is fine.
   */
  private resolveSafeCwd(requested?: string): string {
    let cwd = requested && requested.trim() ? requested : process.cwd();

    // 1. Convert file:// URIs to real paths
    if (cwd.startsWith("file:")) {
      try {
        cwd = fileURLToPath(cwd);
      } catch {
        // Fallback for malformed URIs: strip the scheme prefix manually
        cwd = cwd.replace(/^file:\/\//, "").replace(/^file:\//, "");
        if (/^[A-Za-z]:/.test(cwd) === false && cwd.startsWith("/")) {
          cwd = cwd.replace(/^\//, "");
        }
      }
    }

    // 2. If it's a file (not a dir), use its parent directory
    try {
      const stat = fs.statSync(cwd);
      if (stat.isFile()) cwd = path.dirname(cwd);
    } catch {
      /* path may not exist — handled below */
    }

    // 3. If it still isn't an existing directory, fall back to process.cwd()
    try {
      if (!fs.statSync(cwd).isDirectory()) cwd = process.cwd();
    } catch {
      cwd = process.cwd();
    }

    return cwd;
  }

  /**
   * Build the child environment.
   *
   * A GUI-launched IDE hands its child processes a stripped PATH that often
   * lacks the Node/npm bin directory. The CLI itself starts language servers
   * via `npx`, so those directories must be present or the LSP layer dies with
   * ENOENT. Prepend (never replace) the directories we can derive at runtime:
   *  - the directory holding the CLI executable
   *  - the directory holding the Node runtime of this process
   * Both are computed, never hard-coded.
   */
  private buildChildEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };

    const prepend: string[] = [];
    if (this.binaryInfo.resolvedPath) {
      prepend.push(path.dirname(this.binaryInfo.resolvedPath));
    }
    try {
      prepend.push(path.dirname(process.execPath));
    } catch { /* ignore */ }

    // Windows env vars are case-insensitive but a plain object is not, so
    // collapse every PATH spelling into one canonical key.
    let current = "";
    for (const key of Object.keys(env)) {
      if (key.toLowerCase() === "path") {
        if (env[key]) current = env[key] as string;
        delete env[key];
      }
    }

    const seen = new Set<string>();
    const merged = [...prepend, ...current.split(path.delimiter)]
      .map((p) => p.trim())
      .filter((p) => {
        if (!p) return false;
        const k = process.platform === "win32" ? p.toLowerCase() : p;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .join(path.delimiter);

    env.PATH = merged;
    if (process.platform === "win32") env.Path = merged;

    return env;
  }

  private doExecSpawn = (
    command: string, args: string[], workingDir?: string,
  ): Promise<ExecutorResult> =>
    new Promise((resolve) => {
      let stdout = "", stderr = "", timedOut = false;

    let child: ChildProcess;
    try {
      child = spawn(command, args, {
        cwd: this.resolveSafeCwd(workingDir),
        stdio: ["pipe", "pipe", "pipe"],
        env: this.buildChildEnv(),
        shell: false,
        windowsHide: true,
      });
    } catch (e: any) {
        resolve({ success: false, text: "", error: `spawn failed: ${e.code || e.message}` });
        return;
      }

      this.activeProcesses.add(child);

      const timeout = setTimeout(() => {
        timedOut = true;
        this.killProcess(child);
        resolve({ success: false, text: stdout || "", error: `Timeout (${this.timeoutMs / 1000}s)` });
      }, this.timeoutMs);

      child.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
      child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });

      child.on("close", (code) => {
        clearTimeout(timeout);
        this.activeProcesses.delete(child);
        if (timedOut) return;

        const output = stdout.trim();
        if (output) {
          try {
            const parsed = JSON.parse(output);

            // Daemon / structured envelope
            if (parsed.success && parsed.data?.text) {
              resolve({ success: true, text: parsed.data.text });
              return;
            }
            if (parsed.error) {
              resolve({ success: false, text: parsed.data?.text || "", error: parsed.error });
              return;
            }
            // `friday -p --format json` envelope:
            //   { response: "<text>", status: "success" | "error" }
            // Unwrap it, otherwise the IDE shows raw escaped JSON to the user.
            if (typeof parsed.response === "string") {
              const failed = parsed.status === "error";
              resolve({
                success: !failed && parsed.response.trim().length > 0,
                text: parsed.response,
                error: failed ? parsed.response.slice(0, 300) : undefined,
              });
              return;
            }
          } catch { /* not JSON — treat as raw text below */ }
        }

        if (code === 0 && output) {
          resolve({ success: true, text: output });
        } else {
          resolve({
            success: false,
            text: stdout || "",
            error: stderr ? `exit ${code}: ${stderr.trim().slice(0, 200)}` : `exit ${code}`,
          });
        }
      });

      child.on("error", (err) => {
        clearTimeout(timeout);
        this.activeProcesses.delete(child);
        resolve({ success: false, text: "", error: `spawn ${command} ENOENT: ${err.message}` });
      });
    });

  // -----------------------------------------------------------------------
  // Daemon lifecycle
  // -----------------------------------------------------------------------

  /** Start the daemon as a background child process. */
  startDaemon(port: number = 65432): boolean {
    if (this.daemonProcess) return true; // already running

    const fridayPath = this.binaryInfo.resolvedPath;
    const serveArgs = ["serve", "--port", String(port), "--timeout", "3600"];
    try {
      if (process.platform === "win32") {
        // Same reason as executeViaSpawn: a .cmd shim needs a shell, and
        // PowerShell must be addressed by absolute path.
        const target = fridayPath
          ? `& '${fridayPath.replace(/'/g, "''")}'`
          : "friday";
        this.daemonProcess = spawn(
          getPowerShellPath(),
          [
            "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass",
            "-Command", `${target} ${serveArgs.join(" ")}`,
          ],
          { stdio: "ignore", detached: true, shell: false, env: this.buildChildEnv(), windowsHide: true },
        );
      } else {
        this.daemonProcess = spawn(fridayPath || "friday", serveArgs, {
          stdio: "ignore",
          detached: true,
          shell: false,
          env: this.buildChildEnv(),
        });
      }
      this.daemonProcess.unref();
      // Upgrade mode to daemon
      (this.binaryInfo as any).mode = "daemon";
      (this.binaryInfo as any).daemonUrl = `http://127.0.0.1:${port}`;

      this.daemonProcess.on("error", () => {
        this.daemonProcess = null;
        (this.binaryInfo as any).mode = "global";
      });

      return true;
    } catch {
      return false;
    }
  }

  isDaemonRunning(): boolean {
    return !!this.daemonProcess;
  }

  cancelAll(): void {
    for (const child of this.activeProcesses) this.killProcess(child);
    this.activeProcesses.clear();
  }

  dispose(): void {
    this.cancelAll();
    if (this.daemonProcess) {
      try { this.daemonProcess.kill(); } catch { /* gone */ }
      this.daemonProcess = null;
    }
  }

  get mode(): string { return this.binaryInfo.mode; }
  get daemonUrl(): string | undefined { return this.binaryInfo.daemonUrl; }

  private killProcess(child: ChildProcess): void {
    try {
      if (child.pid) {
        if (process.platform === "win32") {
          spawn("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
        } else {
          try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
        }
      }
    } catch { /* gone */ }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _executor: CliBridgeExecutor | null = null;
let _binaryNotFound = false;
let _lastWorkingDir: string | null = null;

export async function initCliBridgeExecutor(workingDir?: string): Promise<CliBridgeExecutor | null> {
  const dir = workingDir || process.cwd();

  // Reset on workspace change
  if (_executor && _lastWorkingDir && dir !== _lastWorkingDir) {
    _executor.dispose();
    _executor = null;
    _binaryNotFound = false;
  }

  if (_executor) return _executor;

  // Try async (daemon + spawn test)
  const binaryInfo = await locateCliBinary();
  if (!binaryInfo) {
    _binaryNotFound = true;
    _lastWorkingDir = dir;
    return null;
  }

  _executor = new CliBridgeExecutor({ binaryInfo, workingDir: dir });
  _lastWorkingDir = dir;

  // Only try daemon upgrade — don't auto-start. Local spawn works fine.
  if (binaryInfo.mode !== "daemon") {
    locateCliBinary().then((info) => {
      if (info && info.mode === "daemon" && _executor) {
        (_executor as any).binaryInfo = info;
      }
    }).catch(() => {});
  }

  return _executor;
}

export function getCliBridgeExecutor(): CliBridgeExecutor | null {
  return _executor;
}

export function isCliBinaryNotFound(): boolean {
  return _binaryNotFound;
}

export function resetCliBridgeState(): void {
  if (_executor) {
    _executor.dispose();
    _executor = null;
  }
  _binaryNotFound = false;
  // Forget the cached lookup too, so a CLI installed after startup is picked up.
  resetFridayPathCache();
}

// ---------------------------------------------------------------------------
// Prompt builder (shared with spawn mode)
// ---------------------------------------------------------------------------

function buildSpawnPrompt(call: CliBridgeToolCall): string {
  const cliToolName = CORE_TO_CLI_TOOL_NAME[call.toolName] || call.toolName;
  const argsDesc = Object.entries(call.args)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => {
      if (k === "target" || k === "filepath" || k === "symbolName") {
        return `${k}=${JSON.stringify(String(v))}`;
      }
      return `${k}=${v}`;
    })
    .join(", ");
  return `Use the ${cliToolName} tool with parameters: ${argsDesc}. Return the result directly without additional explanation.`;
}
