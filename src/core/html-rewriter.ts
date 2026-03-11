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
 * Clean HTML using Cloudflare's streaming HTMLRewriter.
 * Content container extraction happens upstream in scrape.ts.
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

  return await rewriter.transform(response).text();
}
