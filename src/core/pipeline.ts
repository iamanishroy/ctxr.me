/**
 * Extraction pipeline — the single entry point for content extraction.
 * Orchestrates: fetch → extract → clean → markdown → format.
 */

import limits from "../config/limits.json";
import { fetchPage } from "./fetcher";
import { extractMainContent } from "./extractor";
import { cleanWithRewriter } from "./html-rewriter";
import { extractRscContent } from "./rsc-extractor";
import { htmlToMarkdown } from "./markdown";
import { truncateMarkdown } from "./formatter";
import type { ExtractionResult } from "./types";

/**
 * Extract clean, LLM-ready markdown from a URL.
 *
 * Pipeline:
 * 1. Fetch page + extract metadata from <head>
 * 2. Extract content container (<article>/<main>) + strip footers
 * 3. Clean with HTMLRewriter (streaming, near-zero CPU)
 * 4. Convert to markdown + post-process
 * 5. RSC fallback for Next.js pages if result is sparse
 * 6. Enforce word limit
 */
export async function extractContent(url: string): Promise<ExtractionResult> {
  // 1. Fetch
  const { html, title, description, metadata } = await fetchPage(url);

  // 2. Extract main content
  const content = extractMainContent(html);

  // 3. Clean with HTMLRewriter
  const cleaned = await cleanWithRewriter(content, url);

  // 4. Convert to markdown
  let markdown = htmlToMarkdown(cleaned);

  // 5. RSC fallback if content is too sparse
  const wordCount = markdown.split(/\s+/).filter(Boolean).length;
  if (wordCount < limits.minWordCount) {
    const rscContent = extractRscContent(html);
    if (rscContent) {
      markdown = htmlToMarkdown(rscContent);
    }
  }

  // 6. Enforce word limit
  markdown = truncateMarkdown(markdown);

  return { markdown, title, description, metadata };
}
