/**
 * Response formatter — builds the final LLM-friendly output.
 * Metadata header, word truncation, and response assembly.
 */

import limits from "../config/limits.json";
import type { PageMetadata } from "./types";

/**
 * Build a metadata header block for LLM consumption.
 */
export function buildMetadataHeader(
  url: string,
  title: string,
  description: string,
  metadata?: PageMetadata,
): string {
  const lines: string[] = [];

  if (title) lines.push(`Title: ${title}`);
  if (description) lines.push(`Description: ${description}`);
  lines.push(`URL Source: ${url}`);
  if (metadata?.language) lines.push(`Language: ${metadata.language}`);
  if (metadata?.author) lines.push(`Author: ${metadata.author}`);
  if (metadata?.ogSiteName) lines.push(`Site Name: ${metadata.ogSiteName}`);
  if (metadata?.canonical && metadata.canonical !== url) {
    lines.push(`Canonical URL: ${metadata.canonical}`);
  }
  if (metadata?.ogType) lines.push(`Content Type: ${metadata.ogType}`);
  if (metadata?.keywords?.length) {
    lines.push(`Keywords: ${metadata.keywords.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * Truncate markdown to the configured word limit.
 * Tries to break at a paragraph boundary for clean output.
 */
export function truncateMarkdown(md: string): string {
  const words = md.split(/\s+/);
  if (words.length <= limits.maxResponseWords) return md;

  const truncated = words.slice(0, limits.maxResponseWords).join(" ");
  const lastParagraph = truncated.lastIndexOf("\n\n");
  const cutpoint =
    lastParagraph > truncated.length * 0.8
      ? lastParagraph
      : truncated.length;

  return (
    truncated.substring(0, cutpoint) +
    "\n\n---\n*Content truncated at " +
    limits.maxResponseWords.toLocaleString() +
    " words.*"
  );
}

/**
 * Assemble the full response: header + word count + body.
 */
export function formatResponse(
  url: string,
  title: string,
  description: string,
  markdown: string,
  metadata?: PageMetadata,
): string {
  const header = buildMetadataHeader(url, title, description, metadata);
  const body = markdown || "No content could be extracted from this URL.";
  const wordCount = body.split(/\s+/).filter(Boolean).length;

  return `${header}\nWord Count: ${wordCount}\n\n---\n\n${body}`;
}
