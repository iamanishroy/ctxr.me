import { describe, it, expect } from "vitest";
import {
  buildMetadataHeader,
  truncateMarkdown,
  formatResponse,
} from "../src/core/formatter";

describe("buildMetadataHeader", () => {
  it("includes title and URL", () => {
    const header = buildMetadataHeader(
      "https://example.com",
      "Test Page",
      "",
    );
    expect(header).toContain("Title: Test Page");
    expect(header).toContain("URL Source: https://example.com");
  });

  it("includes description when present", () => {
    const header = buildMetadataHeader(
      "https://example.com",
      "Title",
      "A description",
    );
    expect(header).toContain("Description: A description");
  });

  it("includes JSON-LD fields when present", () => {
    const header = buildMetadataHeader(
      "https://example.com",
      "Title",
      "",
      {
        language: "en",
        author: "John Doe",
        datePublished: "2024-01-15T00:00:00Z",
        dateModified: "2024-06-20T12:00:00Z",
        publisher: "Example Inc.",
        ogSiteName: "Example",
      },
    );
    expect(header).toContain("Language: en");
    expect(header).toContain("Author: John Doe");
    expect(header).toContain("Published: 2024-01-15T00:00:00Z");
    expect(header).toContain("Modified: 2024-06-20T12:00:00Z");
    expect(header).toContain("Publisher: Example Inc.");
    expect(header).toContain("Site Name: Example");
  });

  it("omits empty fields", () => {
    const header = buildMetadataHeader(
      "https://example.com",
      "",
      "",
    );
    expect(header).not.toContain("Title:");
    expect(header).not.toContain("Description:");
    expect(header).toContain("URL Source:");
  });
});

describe("truncateMarkdown", () => {
  it("does not truncate short content", () => {
    const md = "Hello world. This is short.";
    expect(truncateMarkdown(md)).toBe(md);
  });

  it("truncates content exceeding word limit", () => {
    const words = Array(15000).fill("word").join(" ");
    const result = truncateMarkdown(words);
    expect(result).toContain("Content truncated at 10,000 words");
    // Should be around 10K words, not 15K
    const wordCount = result.split(/\s+/).length;
    expect(wordCount).toBeLessThan(11000);
  });

  it("tries to break at paragraph boundary", () => {
    // Create content with paragraphs, last paragraph near the limit
    const para1 = Array(9500).fill("word").join(" ");
    const para2 = Array(1000).fill("extra").join(" ");
    const md = para1 + "\n\n" + para2;
    const result = truncateMarkdown(md);
    expect(result).toContain("Content truncated");
  });
});

describe("formatResponse", () => {
  it("combines header, word count, and body", () => {
    const result = formatResponse(
      "https://example.com",
      "Test",
      "Desc",
      "Hello world content.",
    );
    expect(result).toContain("Title: Test");
    expect(result).toContain("Word Count:");
    expect(result).toContain("Hello world content.");
    expect(result).toContain("---");
  });

  it("shows fallback message when no markdown", () => {
    const result = formatResponse(
      "https://example.com",
      "Test",
      "",
      "",
    );
    expect(result).toContain("No content could be extracted");
  });
});
