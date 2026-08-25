import type { IIdeMessenger } from "../../context/IdeMessenger";

/**
 * Real machine/environment information fetched from the core process
 * (which runs in the extension host with full Node access).
 */
export interface EnvironmentInfo {
  platform: string;
  osRelease: string;
  arch: string;
  defaultShell: string;
  homeDir: string;
  ideType: string | null;
  nodeVersion: string;
}

let cachedInfo: EnvironmentInfo | null | undefined = undefined;

/** Fetch once per webview session; never blocks chat if core is unavailable. */
export async function fetchEnvironmentInfo(
  ideMessenger: IIdeMessenger,
): Promise<EnvironmentInfo | null> {
  if (cachedInfo !== undefined) {
    return cachedInfo;
  }
  try {
    const result = await ideMessenger.request("system/getEnvironmentInfo", undefined);
    if (result.status === "success") {
      cachedInfo = result.content as EnvironmentInfo;
      return cachedInfo;
    }
  } catch (e) {
    console.warn("[environmentInfo] failed to fetch:", e);
  }
  cachedInfo = null;
  return null;
}

function friendlyOsName(platform: string, release: string): string {
  if (platform === "win32") {
    const build = parseInt(release.split(".")[2] ?? "0", 10);
    return build >= 22000 ? `Windows 11 (release ${release})` : `Windows (release ${release})`;
  }
  if (platform === "darwin") {
    const major = parseInt(release.split(".")[0] ?? "0", 10);
    const names: Record<number, string> = {
      15: "macOS Sequoia",
      14: "macOS Sonoma",
      13: "macOS Ventura",
      12: "macOS Monterey",
      11: "macOS Big Sur",
    };
    const name = names[major] ?? "macOS";
    return `${name} (${release})`;
  }
  if (platform === "linux") {
    return `Linux (${release})`;
  }
  return `${platform} (${release})`;
}

function friendlyIdeName(ideType: string | null): string {
  if (!ideType) return "Unknown";
  if (ideType === "vscode") return "VS Code";
  if (ideType === "jetbrains") return "JetBrains IDE";
  return ideType;
}

function modeLabel(mode: string): string {
  switch (mode) {
    case "agent":
      return "agent (autonomous multi-step tool use)";
    case "plan":
      return "plan (read-only planning, no edits)";
    default:
      return "chat (answering questions)";
  }
}

/**
 * Builds the "# Current Environment" section appended to the system message,
 * so the model knows which OS/shell/IDE it is operating in (correct paths,
 * correct command syntax, correct assumptions).
 */
export function formatEnvironmentSection(
  info: EnvironmentInfo,
  mode: string,
): string {
  const lines = [
    "# Current Environment",
    "",
    `- Operating system: ${friendlyOsName(info.platform, info.osRelease)} (${info.arch})`,
    `- Default shell/terminal: ${info.defaultShell}`,
    `- Home directory: ${info.homeDir}`,
    `- IDE: ${friendlyIdeName(info.ideType)}`,
    `- Interface mode: ${modeLabel(mode)}`,
    "",
    "When executing terminal commands or referencing paths, assume this environment. Use the correct command syntax and path separators for this OS and shell.",
  ];
  return lines.join("\n");
}

/** Convenience: fetch (cached) + format in one call. Returns null on failure. */
export async function getEnvironmentSection(
  ideMessenger: IIdeMessenger,
  mode: string,
): Promise<string | null> {
  const info = await fetchEnvironmentInfo(ideMessenger);
  if (!info) return null;
  return formatEnvironmentSection(info, mode);
}
