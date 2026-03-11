import { describe, it, expect } from "vitest";
import {
  processMultiLineLinks,
  removeNavigationAidLinks,
  removeEmptyLinks,
  cleanBrokenTables,
  truncateLongAltText,
  collapseRedundantHeadings,
  fixCodeBlockFormatting,
  removeExcessiveNewlines,
} from "../src/core/md-cleaners";

describe("processMultiLineLinks", () => {
  it("escapes newlines inside link text", () => {
    const input = "[Line 1\nLine 2](https://example.com)";
    const result = processMultiLineLinks(input);
    expect(result).not.toContain("[Line 1\nLine 2]");
  });
});

describe("removeNavigationAidLinks", () => {
  it("removes skip to content links", () => {
    const input = "[Skip to content](#main)\nReal content here.";
    const result = removeNavigationAidLinks(input);
    expect(result).not.toContain("Skip to content");
    expect(result).toContain("Real content here");
  });

  it("removes back to top links", () => {
    const input = "Content here.\n[Back to top](#top)";
    const result = removeNavigationAidLinks(input);
    expect(result).not.toContain("Back to top");
  });
});

describe("removeEmptyLinks", () => {
  it("removes links with no text", () => {
    const input = "Before [](https://example.com) after";
    const result = removeEmptyLinks(input);
    expect(result).toContain("Before");
    expect(result).toContain("after");
    expect(result).not.toContain("[](");
  });
});

describe("cleanBrokenTables", () => {
  it("removes pipe-only rows", () => {
    const input = "| Header |\n| --- |\n|  |\n| Content |";
    const result = cleanBrokenTables(input);
    expect(result).toContain("Content");
  });
});

describe("truncateLongAltText", () => {
  it("truncates alt text over 120 chars", () => {
    const longAlt = "a".repeat(200);
    const input = `![${longAlt}](image.png)`;
    const result = truncateLongAltText(input);
    const altMatch = result.match(/!\[([^\]]*)\]/);
    expect(altMatch).toBeTruthy();
    expect(altMatch![1].length).toBeLessThanOrEqual(123); // 120 + "..."
  });

  it("leaves short alt text unchanged", () => {
    const input = "![Short alt](image.png)";
    const result = truncateLongAltText(input);
    expect(result).toBe(input);
  });
});

describe("collapseRedundantHeadings", () => {
  it("removes consecutive duplicate headings", () => {
    const input = "## Title\n\n## Title\n\nContent";
    const result = collapseRedundantHeadings(input);
    const matches = result.match(/## Title/g);
    expect(matches?.length).toBe(1);
  });
});

describe("fixCodeBlockFormatting", () => {
  it("handles code blocks with language hints", () => {
    const input = "```javascript\nconsole.log('hello');\n```";
    const result = fixCodeBlockFormatting(input);
    expect(result).toContain("javascript");
  });
});

describe("removeExcessiveNewlines", () => {
  it("collapses 3+ newlines to 2", () => {
    const input = "Line 1\n\n\n\n\nLine 2";
    const result = removeExcessiveNewlines(input);
    expect(result).toBe("Line 1\n\nLine 2");
  });

  it("preserves double newlines", () => {
    const input = "Line 1\n\nLine 2";
    const result = removeExcessiveNewlines(input);
    expect(result).toBe("Line 1\n\nLine 2");
  });
});
