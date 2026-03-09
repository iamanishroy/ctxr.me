import * as cheerio from "cheerio";
import { Readability } from "@jsr/paoramen__cheer-reader";
import type { ReadabilityResult } from "@jsr/paoramen__cheer-reader";
import type { CleanedContent } from "./types";
import { stripLayoutTables } from "./table-utils";
import { fixRelativeUrls } from "./url-fixer";

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

  // Primary: Readability extraction
  try {
    const result: ReadabilityResult = new Readability($, {
      charThreshold: 100,
    }).parse();

    if (result?.content) {
      const content$ = cheerio.load(result.content, {
        xml: { xmlMode: false },
      });

      // Clean up Readability artifacts
      const firstDiv = content$("div").first();
      if (firstDiv.attr("id") === "readability-page-1") {
        firstDiv.removeAttr("id");
      }
      stripLayoutTables(content$);

      return {
        cleanedHtml: content$.html() || "",
        title: result.title || undefined,
        excerpt: result.excerpt || undefined,
      };
    }
  } catch (error) {
    console.warn(
      "Readability extraction failed, falling back to manual cleaning:",
      error,
    );
  }

  // Fallback: manual cleaning
  return { cleanedHtml: manualClean($) };
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
