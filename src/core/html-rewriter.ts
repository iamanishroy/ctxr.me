import { EXCLUDE_SELECTORS } from "./selectors";

/**
 * Parsed pattern from a CSS selector string.
 * Pre-parsed at module init so element() does zero string parsing.
 */
interface ExcludePattern {
  tag?: string;
  className?: string;
  id?: string;
  attr?: { name: string; value?: string };
}

/** Pre-parse selector strings into structured patterns (runs once at import). */
const EXCLUDE_PATTERNS: ExcludePattern[] = EXCLUDE_SELECTORS.map(
  (selector) => {
    if (selector.startsWith(".")) {
      return { className: selector.slice(1) };
    }
    if (selector.startsWith("#")) {
      return { id: selector.slice(1) };
    }
    if (selector.startsWith("[")) {
      const match = selector.match(/\[([^\]=]+)(?:="([^"]*)")?\]/);
      if (match) {
        return { attr: { name: match[1], value: match[2] } };
      }
    }
    return { tag: selector };
  },
);

const MIN_EXTRACT_WORDS = 50;

/**
 * Streaming content cleaner — removes non-content elements.
 * Matches elements against pre-parsed exclude patterns.
 */
class MainContentHandler implements HTMLRewriterElementContentHandlers {
  element(element: Element) {
    const tagName = element.tagName.toLowerCase();
    const classNames = element.getAttribute("class")?.split(/\s+/) || [];
    const id = element.getAttribute("id");

    for (const pattern of EXCLUDE_PATTERNS) {
      if (pattern.tag && pattern.tag === tagName) {
        element.remove();
        return;
      }
      if (pattern.className && classNames.includes(pattern.className)) {
        element.remove();
        return;
      }
      if (pattern.id && id === pattern.id) {
        element.remove();
        return;
      }
      if (pattern.attr) {
        const attrValue = element.getAttribute(pattern.attr.name);
        if (pattern.attr.value) {
          if (attrValue === pattern.attr.value) {
            element.remove();
            return;
          }
        } else if (attrValue !== null) {
          element.remove();
          return;
        }
      }
    }
  }
}

/**
 * Normalizes relative URLs to absolute.
 */
class LinkNormalizeHandler implements HTMLRewriterElementContentHandlers {
  private readonly baseUrl: URL;

  constructor(baseUrl: string) {
    this.baseUrl = new URL(baseUrl);
  }

  element(element: Element) {
    // Handle href attributes (a, link, area)
    const href = element.getAttribute("href");
    if (href && !href.startsWith("#") && !href.startsWith("mailto:")) {
      const normalized = this.normalize(href);
      if (normalized) element.setAttribute("href", normalized);
    }

    // Handle src attributes (img)
    const src = element.getAttribute("src");
    if (src && !src.startsWith("data:")) {
      const normalized = this.normalize(src);
      if (normalized) element.setAttribute("src", normalized);
    }
  }

  private normalize(url: string): string | null {
    try {
      return new URL(url, this.baseUrl).toString();
    } catch {
      return null;
    }
  }
}

/**
 * Extract content from <article> or <main> containers.
 * Uses indexOf-based scanning with nesting awareness — no DOM, no regex.
 * Returns the first container with ≥50 words, or null if none found.
 */
function extractContentContainer(html: string): string | null {
  const lowerHtml = html.toLowerCase();
  const CONTENT_TAGS = ["article", "main"];

  for (const tag of CONTENT_TAGS) {
    const openTag = `<${tag}`;
    const closeTag = `</${tag}>`;

    const startIdx = lowerHtml.indexOf(openTag);
    if (startIdx === -1) continue;

    // Find the matching closing tag, handling nested same-name tags
    let depth = 1;
    let searchFrom = startIdx + openTag.length;

    while (depth > 0 && searchFrom < lowerHtml.length) {
      const nextOpen = lowerHtml.indexOf(openTag, searchFrom);
      const nextClose = lowerHtml.indexOf(closeTag, searchFrom);

      if (nextClose === -1) break; // Unclosed tag

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        searchFrom = nextOpen + openTag.length;
      } else {
        depth--;
        if (depth === 0) {
          const endIdx = nextClose + closeTag.length;
          const extracted = html.substring(startIdx, endIdx);

          // Only use if it has substantial content
          const wordCount = extracted
            .replace(/<[^>]*>/g, "")
            .split(/\s+/)
            .filter(Boolean).length;

          if (wordCount >= MIN_EXTRACT_WORDS) {
            return extracted;
          }
        }
        searchFrom = nextClose + closeTag.length;
      }
    }
  }

  return null;
}

/**
 * Clean HTML using Cloudflare's streaming HTMLRewriter.
 *
 * Two-phase approach:
 * 1. HTMLRewriter strips known non-content elements (streaming, near-zero CPU)
 * 2. Extract <article> or <main> container if present (string scanning, no DOM)
 */
export async function cleanWithRewriter(
  rawHtml: string,
  baseUrl: string,
): Promise<string> {
  const rewriter = new HTMLRewriter()
    .on("*", new MainContentHandler())
    .on("a[href]", new LinkNormalizeHandler(baseUrl))
    .on("img[src]", new LinkNormalizeHandler(baseUrl))
    .on("link[href]", new LinkNormalizeHandler(baseUrl));

  const response = new Response(rawHtml, {
    headers: { "content-type": "text/html" },
  });

  const cleaned = await rewriter.transform(response).text();

  // Phase 2: try to extract just the main content container
  return extractContentContainer(cleaned) || cleaned;
}

