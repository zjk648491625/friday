import chalk from "chalk";
import { mind } from "gradient-string";

import { getVersion } from "./version.js";

const d = chalk.dim;

export const FRIDAY_ASCII_ART = `
${mind.multiline(`███████╗██████╗ ██╗██████╗  █████╗ ██╗   ██╗
██╔════╝██╔══██╗██║██╔══██╗██╔══██╗╚██╗ ██╔╝
█████╗  ██████╔╝██║██║  ██║███████║ ╚████╔╝
██╔══╝  ██╔══██╗██║██║  ██║██╔══██║  ╚██╔╝
██║     ██║  ██║██║██████╔╝██║  ██║   ██║
╚═╝     ╚═╝  ╚═╝╚═╝╚═════╝ ╚═╝  ╚═╝   ╚═╝`)}
                                      ${d("v" + getVersion())}`;

// Compact ASCII art for narrow terminals — same FRIDAY wording, adjusted spacing
const COMPACT_ASCII_ART = `
${mind.multiline(`███████╗██████╗ ██╗██████╗  █████╗ ██╗   ██╗
██╔════╝██╔══██╗██║██╔══██╗██╔══██╗╚██╗ ██╔╝
█████╗  ██████╔╝██║██║  ██║███████║ ╚████╔╝
██╔══╝  ██╔══██╗██║██║  ██║██╔══██║  ╚██╔╝
██║     ██║  ██║██║██████╔╝██║  ██║   ██║
╚═╝     ╚═╝  ╚═╝╚═╝╚═════╝ ╚═╝  ╚═╝   ╚═╝`)}
                                      ${d("v" + getVersion())}`;

// Minimum terminal width — FRIDAY is ~48 cols wide, 50 gives comfortable margin
const MIN_WIDTH_FOR_ASCII_ART = 50;

/**
 * Returns the ASCII art. If terminal is too narrow, falls back to compact version.
 */
export function getDisplayableAsciiArt(): string {
  const terminalWidth = process.stdout.columns || 80;

  if (terminalWidth >= MIN_WIDTH_FOR_ASCII_ART) {
    return FRIDAY_ASCII_ART;
  }

  return COMPACT_ASCII_ART;
}

// Simple text logo — clean "FRIDAY" without the old @ symbol art
export const FRIDAY_LOGO_ASCII_ART = `
███████╗██████╗  ██╗██████╗   █████╗ ██╗   ██╗
██╔════╝██╔══██╗ ██║██╔══██╗ ██╔══██╗╚██╗ ██╔╝
█████╗  ██████╔╝ ██║██║  ██║ ███████║ ╚████╔╝
██╔══╝  ██╔══██╗ ██║██║  ██║ ██╔══██║  ╚██╔╝
██║     ██║  ██║ ██║██████╔╝ ██║  ██║   ██║
╚═╝     ╚═╝  ╚═╝ ╚═╝╚═════╝  ╚═╝  ╚═╝   ╚═╝`;
