import * as cheerio from "cheerio";
import { Readability } from "@jsr/paoramen__cheer-reader";
import type { ReadabilityResult } from "@jsr/paoramen__cheer-reader";
import type { CleanedContent } from "./types";
import { stripLayoutTables } from "./table-utils";
import { fixRelativeUrls } from "./url-fixer";
import { extractRscContent } from "./rsc-extractor";

const MIN_WORD_COUNT = 50;

/** Count words in an HTML string (strips tags first). */
function countWords(html: string): number {
  return html
    .replace(/<[^>]*>/g, "")
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Non-content selectors to remove during manual cleaning. */
const REMOVE_SELECTORS = [
  "script, style, noscript, iframe, svg",
  "nav, header, footer, aside",
  '[role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"]',
  '[aria-hidden="true"], [hidden]',
  ".ad, .ads, .advertisement, .advertising",
  ".sidebar, .side-bar",
  ".menu, .nav, .navigation",
  ".comments, .comment-section",
  ".social, .share, .sharing",
  ".cookie, .cookie-banner",
  ".popup, .modal",
] as const;

/** Content selectors tried in order during manual fallback. */
const CONTENT_SELECTORS = [
  "main",
  "article",
  '[role="main"]',
  ".content, .post-content, .article-content, .entry-content, .page-content",
  "#content, #main-content, #main",
  "#app, #root, #__next, #__nuxt",
] as const;

/**
 * Clean HTML using Readability, falling back to manual extraction.
 * Accepts a pre-parsed cheerio instance to avoid redundant parsing.
 */
export function cleanHtml(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  rawHtml?: string,
): CleanedContent {
  fixRelativeUrls($, baseUrl);

  // Only scan for RSC payloads on Next.js pages (fast string check)
  const rscContent = rawHtml?.includes("__next_f") ? extractRscContent($) : "";

  // Track the best result we have so far
  let bestHtml = "";
  let bestTitle: string | undefined;
  let bestExcerpt: string | undefined;

  // Primary: Readability extraction
  try {
    const result: ReadabilityResult = new Readability($, {
      charThreshold: 100,
    }).parse();

    if (result?.content) {
      const content$ = cheerio.load(result.content, {
        xml: { xmlMode: false },
      });

      const firstDiv = content$("div").first();
      if (firstDiv.attr("id") === "readability-page-1") {
        firstDiv.removeAttr("id");
      }
      stripLayoutTables(content$);

      bestHtml = content$.html() || "";
      bestTitle = result.title || undefined;
      bestExcerpt = result.excerpt || undefined;

      const wordCount = countWords(bestHtml);

      // If we got enough content, return immediately
      if (wordCount >= MIN_WORD_COUNT) {
        return {
          cleanedHtml: bestHtml,
          title: bestTitle,
          excerpt: bestExcerpt,
        };
      }
    }
  } catch (error) {
    console.warn("Readability extraction failed:", error);
  }

  // Try RSC content if Readability didn't get enough
  if (rscContent) {
    return { cleanedHtml: rscContent, title: bestTitle, excerpt: bestExcerpt };
  }

  // Fallback: manual cleaning
  const manualResult = manualClean($);
  const manualWords = countWords(manualResult);

  if (manualWords > countWords(bestHtml)) {
    bestHtml = manualResult;
  }

  return {
    cleanedHtml: bestHtml || manualResult,
    title: bestTitle,
    excerpt: bestExcerpt,
  };
}

/**
 * Manual HTML cleaning fallback — guaranteed to never throw.
 */
function manualClean($: cheerio.CheerioAPI): string {
  try {
    for (const selector of REMOVE_SELECTORS) {
      $(selector).remove();
    }

    // Try content selectors in priority order
    let contentEl = null;
    for (const selector of CONTENT_SELECTORS) {
      const found = $(selector).first();
      if (found.length && found.html()?.trim()) {
        contentEl = found;
        break;
      }
    }

    const target = contentEl || $("body");

    // Strip empty elements in-place (no extra cheerio.load)
    target.find("p, div, span").each((_, el) => {
      const $el = $(el);
      if (!$el.text().trim() && !$el.children().length) {
        $el.remove();
      }
    });

    return target.html()?.trim() || "";
  } catch (error) {
    console.warn("Manual cleaning failed:", error);
    try {
      return $("body").html()?.trim() || "";
    } catch {
      return "";
    }
  }
}
