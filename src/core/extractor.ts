/**
 * Content extractor — narrows raw HTML to just the article content.
 * Pure functions: container extraction, footer stripping, truncation.
 */

import limits from "../config/limits.json";
import containerConfig from "../config/content-containers.json";
import footerConfig from "../config/footer-sections.json";

/** Pre-build search patterns at module init (runs once). */
const FOOTER_PATTERNS = footerConfig.ids.map((id) => `id="${id}"`);

/**
 * Extract the main content from raw HTML.
 * Pipeline: find container → strip footer sections → truncate.
 */
export function extractMainContent(html: string): string {
  // Phase 1: Extract content container (<article> or <main>)
  let content = extractContainer(html) || html;

  // Phase 2: Strip footer sections (References, External links, etc.)
  content = stripFooterSections(content);

  // Phase 3: Truncate as safety net (should rarely trigger)
  if (content.length > limits.maxHtmlBytes) {
    const cutPoint = content.lastIndexOf(">", limits.maxHtmlBytes);
    content = content.substring(
      0,
      cutPoint > 0 ? cutPoint + 1 : limits.maxHtmlBytes,
    );
  }

  return content;
}

// ─── Helpers ──────────────────────────────────────────────

/**
 * Extract <article> or <main> from raw HTML using indexOf scanning.
 * Nesting-aware: handles nested same-name tags correctly.
 */
function extractContainer(html: string): string | null {
  const lowerHtml = html.toLowerCase();

  for (const tag of containerConfig.tags) {
    const openTag = `<${tag}`;
    const closeTag = `</${tag}>`;

    const startIdx = lowerHtml.indexOf(openTag);
    if (startIdx === -1) continue;

    let depth = 1;
    let searchFrom = startIdx + openTag.length;

    while (depth > 0 && searchFrom < lowerHtml.length) {
      const nextOpen = lowerHtml.indexOf(openTag, searchFrom);
      const nextClose = lowerHtml.indexOf(closeTag, searchFrom);

      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        searchFrom = nextOpen + openTag.length;
      } else {
        depth--;
        if (depth === 0) {
          return html.substring(startIdx, nextClose + closeTag.length);
        }
        searchFrom = nextClose + closeTag.length;
      }
    }
  }

  return null;
}

/**
 * Strip footer sections by heading ID.
 * Finds the earliest footer heading and cuts everything from that point.
 */
function stripFooterSections(html: string): string {
  const lowerHtml = html.toLowerCase();
  let earliestCut = -1;

  for (const pattern of FOOTER_PATTERNS) {
    const idx = lowerHtml.indexOf(pattern);
    if (idx > 0 && (earliestCut === -1 || idx < earliestCut)) {
      earliestCut = idx;
    }
  }

  if (earliestCut === -1) return html;

  // Walk backwards to find the opening tag of the heading (e.g. <h2)
  const headingStart = lowerHtml.lastIndexOf("<h", earliestCut);
  if (headingStart > 0) {
    return html.substring(0, headingStart);
  }

  return html.substring(0, earliestCut);
}
