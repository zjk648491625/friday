import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FRIDAY_ASCII_ART, getDisplayableAsciiArt } from "./asciiArt.js";

describe("asciiArt", () => {
  let originalColumns: number | undefined;

  beforeEach(() => {
    originalColumns = process.stdout.columns;
  });

  afterEach(() => {
    if (originalColumns === undefined) {
      delete (process.stdout as any).columns;
    } else {
      process.stdout.columns = originalColumns;
    }
  });

  describe("getDisplayableAsciiArt", () => {
    it("should return full ASCII art when terminal is wide enough", () => {
      process.stdout.columns = 80;
      const result = getDisplayableAsciiArt();
      expect(result).toBe(FRIDAY_ASCII_ART);
    });

    it("should return compact ASCII art when terminal is too narrow", () => {
      process.stdout.columns = 40;
      const result = getDisplayableAsciiArt();
      expect(result).toContain("██████╗");
      expect(result).not.toBe(FRIDAY_ASCII_ART);
    });

    it("should return compact art when terminal is below threshold", () => {
      // threshold is 50, so 49 should fall back
      process.stdout.columns = 49;
      const result = getDisplayableAsciiArt();
      expect(result).not.toBe(FRIDAY_ASCII_ART);
    });

    it("should return full ASCII art when terminal is exactly at threshold", () => {
      process.stdout.columns = 50;
      const result = getDisplayableAsciiArt();
      expect(result).toBe(FRIDAY_ASCII_ART);
    });

    it("should default to full ASCII art when columns is undefined", () => {
      delete (process.stdout as any).columns;
      const result = getDisplayableAsciiArt();
      expect(result).toBe(FRIDAY_ASCII_ART);
    });
  });
});
