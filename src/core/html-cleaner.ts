import * as cheerio from "cheerio";
import { Readability } from "@jsr/paoramen__cheer-reader";
import type { ReadabilityResult } from "@jsr/paoramen__cheer-reader";
import type { CleanedContent } from "./types";
import { stripLayoutTables } from "./table-utils";
import { fixRelativeUrls } from "./url-fixer";
import { extractRscContent } from "./rsc-extractor";

const MIN_WORD_COUNT = 50;

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
): CleanedContent {
  fixRelativeUrls($, baseUrl);

  // Grab RSC content NOW — before Readability or manualClean strip script tags
  const rscContent = extractRscContent($);

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

      const wordCount = bestHtml
        .replace(/<[^>]*>/g, "")
        .split(/\s+/)
        .filter(Boolean).length;

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
  const manualWords = manualResult
    .replace(/<[^>]*>/g, "")
    .split(/\s+/)
    .filter(Boolean).length;

  if (
    manualWords >
    bestHtml
      .replace(/<[^>]*>/g, "")
      .split(/\s+/)
      .filter(Boolean).length
  ) {
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
    let mainContent: string | null = null;
    for (const selector of CONTENT_SELECTORS) {
      mainContent = $(selector).first().html();
      if (mainContent?.trim()) break;
    }

    const html = mainContent?.trim() || $("body").html()?.trim() || "";
    if (!html) return html;

    // Strip empty elements
    const content$ = cheerio.load(html, { xml: { xmlMode: false } });
    content$("p, div, span").each((_, el) => {
      const text = content$(el).text().trim();
      if (!text && !content$(el).children().length) {
        content$(el).remove();
      }
    });

    return content$.html()?.trim() || html;
  } catch (error) {
    console.warn("Manual cleaning also failed:", error);
    try {
      return $("body").html()?.trim() || "";
    } catch {
      return "";
    }
  }
}
