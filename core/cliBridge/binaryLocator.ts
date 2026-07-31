/**
 * CLI Binary Locator
 *
 * Finds the Friday CLI executable in a platform- and installer-agnostic way,
 * then verifies it actually runs.
 *
 * Design rules (must hold on ANY user machine):
 *  - Never hard-code a user-specific directory.
 *  - Never rely on PATH alone: a GUI-launched process (IntelliJ/VSCode) often
 *    inherits a stripped PATH that lacks the Node/npm global bin directory.
 *  - Always return an absolute `resolvedPath` when the file can be located, so
 *    the executor can spawn it without depending on PATH.
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as http from "http";
import * as os from "os";
import * as path from "path";

import { getPowerShellPath } from "./powershellPath";

export type CliExecMode = "daemon" | "global";

export interface CliBinaryInfo {
  mode: CliExecMode;
  /** Absolute path to the CLI executable, or null if only reachable via PATH. */
  resolvedPath: string | null;
  nodeScript: string;
  nodePath: string;
  daemonUrl?: string;
  valid: boolean;
  source: string;
  version?: string;
}

const DAEMON_PORT = parseInt(process.env.FRIDAY_DAEMON_PORT || "65432", 10);

// ---------------------------------------------------------------------------
// Daemon HTTP check
// ---------------------------------------------------------------------------

function tryConnectToDaemon(): Promise<CliBinaryInfo | null> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${DAEMON_PORT}/state`, { timeout: 2000 }, (res) => {
      if (res.statusCode !== 200) { resolve(null); return; }
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () =>
        resolve({
          mode: "daemon",
          resolvedPath: null,
          nodeScript: "",
          nodePath: "",
          daemonUrl: `http://127.0.0.1:${DAEMON_PORT}`,
          valid: true,
          source: "Daemon",
          version: extractVersion(d),
        }),
      );
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

// ---------------------------------------------------------------------------
// Locate the CLI file — generic across installers and platforms
// ---------------------------------------------------------------------------

/** Executable file names to look for, in priority order, per platform. */
function executableNames(): string[] {
  if (process.platform === "win32") {
    // npm creates `friday` (sh shim), `friday.cmd` and `friday.ps1`.
    // Only .cmd/.exe are directly usable by CreateProcess / PowerShell.
    return ["friday.cmd", "friday.exe", "friday.bat"];
  }
  return ["friday"];
}

/**
 * Candidate directories that may contain the global CLI binary.
 * Ordered from most reliable to least. No user-specific paths.
 */
function candidateDirs(): string[] {
  const dirs: string[] = [];
  const add = (d?: string | null) => {
    if (d && d.trim() && !dirs.includes(d)) dirs.push(d);
  };

  // 1. Directory of the Node runtime running this process.
  //    On Windows the npm global prefix defaults to the Node install dir, so
  //    global shims sit next to node.exe. This one entry covers system Node,
  //    nvm-windows, nvs, fnm, volta, Scoop, Chocolatey and portable installs
  //    without naming any of them.
  try {
    const nodeDir = path.dirname(process.execPath);
    add(nodeDir);
    // Unix layout: <prefix>/bin/node  ->  <prefix>/bin already covered;
    // some distros put global shims in <prefix>/lib/node_modules/.bin
    add(path.join(path.dirname(nodeDir), "bin"));
  } catch { /* ignore */ }

  // 2. Explicit npm prefix from the environment (respects .npmrc / user config)
  const envPrefix = process.env.npm_config_prefix || process.env.NPM_CONFIG_PREFIX;
  if (envPrefix) {
    add(envPrefix);
    add(path.join(envPrefix, "bin"));
  }

  // 3. Platform defaults for npm global installs
  if (process.platform === "win32") {
    if (process.env.APPDATA) add(path.join(process.env.APPDATA, "npm"));
    if (process.env.LOCALAPPDATA) {
      add(path.join(process.env.LOCALAPPDATA, "npm"));
      // Volta / fnm style shim dirs
      add(path.join(process.env.LOCALAPPDATA, "Volta", "bin"));
    }
    if (process.env.ProgramFiles) add(path.join(process.env.ProgramFiles, "nodejs"));
  } else {
    const home = os.homedir();
    add(path.join(home, ".npm-global", "bin"));
    add(path.join(home, ".local", "bin"));
    add(path.join(home, ".volta", "bin"));
    add(path.join(home, ".bun", "bin"));
    add("/usr/local/bin");
    add("/usr/bin");
    add("/opt/homebrew/bin");
  }

  // 4. Everything on PATH (works when the process inherited a full env)
  for (const d of (process.env.PATH || process.env.Path || "").split(path.delimiter)) {
    add(d);
  }

  return dirs;
}

/**
 * Read `prefix=` from npm config files without executing npm.
 *
 * Users who ran `npm config set prefix <dir>` have their global bin somewhere
 * completely custom, recorded only in an .npmrc. `npm_config_prefix` is NOT in
 * the environment in that case, and `npm` itself may be unreachable from a
 * stripped-PATH GUI process — so parse the files directly.
 */
function npmrcPrefixDirs(): string[] {
  const files: string[] = [];
  try {
    files.push(path.join(os.homedir(), ".npmrc")); // per-user config
  } catch { /* ignore */ }
  if (process.env.NPM_CONFIG_USERCONFIG) files.push(process.env.NPM_CONFIG_USERCONFIG);
  if (process.env.NPM_CONFIG_GLOBALCONFIG) files.push(process.env.NPM_CONFIG_GLOBALCONFIG);
  try {
    // Builtin/global config shipped next to the npm installation
    const nodeDir = path.dirname(process.execPath);
    files.push(path.join(nodeDir, "node_modules", "npm", "npmrc"));
    files.push(path.join(nodeDir, "etc", "npmrc"));
    files.push(path.join(nodeDir, "..", "etc", "npmrc"));
  } catch { /* ignore */ }

  const dirs: string[] = [];
  for (const file of files) {
    let text: string;
    try {
      if (!fs.existsSync(file)) continue;
      text = fs.readFileSync(file, "utf-8");
    } catch { continue; }

    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*prefix\s*=\s*(.+?)\s*$/);
      if (!m) continue;
      let value = m[1].replace(/^["']|["']$/g, "");
      // npm supports ${VAR} interpolation in .npmrc
      value = value.replace(/\$\{([^}]+)\}/g, (_, v) => process.env[v] || "");
      if (!value) continue;
      if (value.startsWith("~")) {
        try { value = path.join(os.homedir(), value.slice(1)); } catch { continue; }
      }
      dirs.push(value);
      dirs.push(path.join(value, "bin")); // Unix layout
    }
  }
  return dirs;
}

/** Ask npm where its global prefix is. Slow + may fail, so it runs last. */
function npmGlobalPrefixDirs(): string[] {
  try {
    const prefix = execSync("npm prefix -g", {
      encoding: "utf-8",
      timeout: 5000,
      stdio: "pipe",
    }).trim();
    if (!prefix) return [];
    return process.platform === "win32" ? [prefix] : [prefix, path.join(prefix, "bin")];
  } catch {
    return []; // npm itself not reachable — expected in stripped-PATH GUI processes
  }
}

let _cachedPath: string | null | undefined;

/** Absolute path to the CLI executable, or null if not found anywhere. */
export function findFridayPath(): string | null {
  if (_cachedPath !== undefined) return _cachedPath;

  const names = executableNames();
  const search = (dirs: string[]): string | null => {
    for (const dir of dirs) {
      for (const name of names) {
        const f = path.join(dir, name);
        try {
          if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
        } catch { /* unreadable dir */ }
      }
    }
    return null;
  };

  _cachedPath =
    search(candidateDirs()) ??      // cheap: derived from this process
    search(npmrcPrefixDirs()) ??    // cheap: reads config files
    search(npmGlobalPrefixDirs());  // expensive: shells out to npm
  return _cachedPath;
}

/** Test hook / workspace switch: forget the cached lookup. */
export function resetFridayPathCache(): void {
  _cachedPath = undefined;
}

// ---------------------------------------------------------------------------
// Verify the CLI actually runs
// ---------------------------------------------------------------------------

function runVersionCheck(resolvedPath: string | null): Promise<boolean> {
  return new Promise((ok) => {
    const { spawn } = require("child_process");
    let child;
    try {
      if (process.platform === "win32") {
        // .cmd files cannot be spawned by CreateProcess directly; go through
        // PowerShell (resolved by absolute path so PATH is irrelevant).
        // `&` is the PowerShell call operator, required for quoted paths.
        const cmd = resolvedPath ? `& '${resolvedPath.replace(/'/g, "''")}'` : "friday";
        child = spawn(
          getPowerShellPath(),
          ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `${cmd} --version`],
          { stdio: "pipe", shell: false, timeout: 10000, windowsHide: true },
        );
      } else {
        child = spawn(resolvedPath || "friday", ["--version"], {
          stdio: "pipe",
          shell: false,
          timeout: 10000,
        });
      }
    } catch {
      ok(false);
      return;
    }
    let out = "";
    child.stdout?.on("data", (d: Buffer) => (out += d.toString()));
    child.on("close", (code: number) => ok(code === 0 && out.trim().length > 0));
    child.on("error", () => ok(false));
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function locateCliBinary(): Promise<CliBinaryInfo | null> {
  // 1. A running daemon is the cheapest and most reliable route.
  const daemon = await tryConnectToDaemon();
  if (daemon) return daemon;

  // 2. Locate the executable by absolute path (never depends on PATH).
  const resolvedPath = findFridayPath();

  // 3. Verify it runs. If we have an absolute path, test that exact file;
  //    otherwise fall back to testing the bare command via PATH.
  if (await runVersionCheck(resolvedPath)) {
    return {
      mode: "global",
      resolvedPath,
      nodeScript: resolvedPath || "friday",
      nodePath: "",
      valid: true,
      source: resolvedPath ? `Resolved: ${resolvedPath}` : "PATH: friday",
    };
  }

  // 4. The file exists but the version check failed (slow disk, AV, transient).
  //    Still return it — the executor may succeed with a longer timeout.
  if (resolvedPath) {
    return {
      mode: "global",
      resolvedPath,
      nodeScript: resolvedPath,
      nodePath: "",
      valid: true,
      source: `Found (unverified): ${resolvedPath}`,
    };
  }

  return null;
}

export function locateCliBinarySync(): CliBinaryInfo | null {
  const resolvedPath = findFridayPath();
  if (resolvedPath) {
    return {
      mode: "global",
      resolvedPath,
      nodeScript: resolvedPath,
      nodePath: "",
      valid: true,
      source: `Resolved: ${resolvedPath}`,
    };
  }
  return null;
}

function extractVersion(data: string): string | undefined {
  try { return JSON.parse(data).version; } catch { return undefined; }
}

export function getCliNotFoundMessage(): string {
  return (
    "Friday CLI not found.\n\n" +
    "Install it globally, then restart the IDE:\n" +
    "  npm install -g @friday-ai/cli\n"
  );
}
