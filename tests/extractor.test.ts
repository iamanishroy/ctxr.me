import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractMainContent } from "../src/core/extractor";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "fixtures");
const wikipedia = readFileSync(join(fixturesDir, "wikipedia.html"), "utf-8");
const github = readFileSync(join(fixturesDir, "github.html"), "utf-8");

describe("extractMainContent", () => {
  describe("container extraction", () => {
    it("extracts <article> content from Wikipedia fixture", () => {
      const result = extractMainContent(wikipedia);
      expect(result).toContain("Shah Rukh Khan");
      expect(result).toContain("Early life and family");
      expect(result).toContain("Acting career");
    });

    it("extracts <article> from GitHub fixture", () => {
      const result = extractMainContent(github);
      expect(result).toContain("user/repo");
      expect(result).toContain("Installation");
    });

    it("excludes header and footer", () => {
      const result = extractMainContent(wikipedia);
      expect(result).not.toContain("Main navigation");
      expect(result).not.toContain("Site footer");
    });
  });

  describe("footer stripping", () => {
    it("strips References section", () => {
      const result = extractMainContent(wikipedia);
      expect(result).not.toContain("Reference 1 citation text");
      expect(result).not.toContain("ISBN 978-0-123456-78-9");
    });

    it("strips External links section", () => {
      const result = extractMainContent(wikipedia);
      expect(result).not.toContain("Shah Rukh Khan at IMDb");
    });

    it("strips See also section", () => {
      const result = extractMainContent(wikipedia);
      expect(result).not.toContain("List of awards received by SRK");
    });

    it("preserves article content before footer sections", () => {
      const result = extractMainContent(wikipedia);
      expect(result).toContain("Baadshah of Bollywood");
      expect(result).toContain("2 November 1965");
    });
  });

  describe("pages without containers", () => {
    it("returns full HTML when no article/main found", () => {
      const noContainer = "<html><body><p>Plain content</p></body></html>";
      const result = extractMainContent(noContainer);
      expect(result).toContain("Plain content");
    });
  });

  describe("truncation", () => {
    it("truncates oversized HTML at tag boundary", () => {
      const huge = "<div>" + "<p>word </p>".repeat(50000) + "</div>";
      const result = extractMainContent(huge);
      expect(result.length).toBeLessThanOrEqual(256_001);
      expect(result).toMatch(/>$/); // ends at a tag boundary
    });
  });
});
