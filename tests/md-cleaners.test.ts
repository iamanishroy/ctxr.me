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
  stripInlineLinks,
  removeEditMarkers,
  fixBackslashEscapes,
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

describe("stripInlineLinks", () => {
  it("strips links, keeping display text", () => {
    const input = "[Shah Rukh Khan](https://en.wikipedia.org/wiki/SRK) is an actor.";
    const result = stripInlineLinks(input);
    expect(result).toBe("Shah Rukh Khan is an actor.");
  });

  it("preserves image links", () => {
    const input = "![Alt text](image.png)";
    const result = stripInlineLinks(input);
    // Image reference character ! should remain
    expect(result).toContain("!");
  });

  it("handles multiple links in one line", () => {
    const input = "[A](url1) and [B](url2) are friends.";
    const result = stripInlineLinks(input);
    expect(result).toBe("A and B are friends.");
  });
});

describe("removeEditMarkers", () => {
  it("removes [edit] markers", () => {
    const input = "## Early life [edit]\nContent here.";
    const result = removeEditMarkers(input);
    expect(result).not.toContain("[edit]");
    expect(result).toContain("Early life");
  });

  it("removes citation numbers [1], [2]", () => {
    const input = "He won 14 awards[1] and appeared in 100 films[2].";
    const result = removeEditMarkers(input);
    expect(result).toBe("He won 14 awards and appeared in 100 films.");
  });

  it("removes [citation needed]", () => {
    const input = "He is the richest actor[citation needed] in India.";
    const result = removeEditMarkers(input);
    expect(result).not.toContain("[citation needed]");
  });
});

describe("fixBackslashEscapes", () => {
  it("fixes escaped periods", () => {
    const input = "In 1959\\.";
    const result = fixBackslashEscapes(input);
    expect(result).toBe("In 1959.");
  });

  it("fixes escaped punctuation", () => {
    const input = "Khan\\'s family\\, including his wife\\.";
    const result = fixBackslashEscapes(input);
    expect(result).toBe("Khan's family, including his wife.");
  });

  it("preserves non-escaped text", () => {
    const input = "Normal text without escapes.";
    const result = fixBackslashEscapes(input);
    expect(result).toBe(input);
  });
});
