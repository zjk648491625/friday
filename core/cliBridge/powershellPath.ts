/**
 * Resolve the full path to powershell.exe.
 *
 * The core process is started by the IntelliJ plugin via ProcessBuilder and
 * inherits IntelliJ's environment, whose PATH may NOT contain
 * System32/WindowsPowerShell. Spawning "powershell.exe" by name then fails with
 * ENOENT even though powershell.exe exists on the machine. Resolve the absolute
 * path instead so we never depend on PATH for powershell.exe itself.
 */

import * as fs from "fs";
import * as path from "path";

let _cached: string | null = null;

export function getPowerShellPath(): string {
  if (process.platform !== "win32") return "powershell.exe";
  if (_cached) return _cached;

  const roots = [
    process.env.SystemRoot,
    process.env.windir,
    "C:\\Windows",
  ];

  const candidates: string[] = [];
  for (const r of roots) {
    if (!r) continue;
    // System32 for native arch; Sysnative for a 32-bit process on 64-bit Windows.
    candidates.push(path.join(r, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"));
    candidates.push(path.join(r, "Sysnative", "WindowsPowerShell", "v1.0", "powershell.exe"));
  }

  // PowerShell 7+ (pwsh). Some trimmed installs (Server Core, minimal Win11
  // images) ship only this one. Same CLI flags as Windows PowerShell.
  for (const pf of [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.ProgramW6432,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Microsoft"),
  ]) {
    if (!pf) continue;
    for (const major of ["7", "8", "6"]) {
      candidates.push(path.join(pf, "PowerShell", major, "pwsh.exe"));
    }
  }

  // Anything on PATH, as a further fallback before giving up.
  for (const dir of (process.env.PATH || process.env.Path || "").split(path.delimiter)) {
    if (!dir.trim()) continue;
    candidates.push(path.join(dir, "powershell.exe"));
    candidates.push(path.join(dir, "pwsh.exe"));
  }

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) {
        _cached = c;
        return c;
      }
    } catch { /* ignore */ }
  }

  // Last resort: rely on PATH (may still ENOENT, but best effort).
  _cached = "powershell.exe";
  return _cached;
}
