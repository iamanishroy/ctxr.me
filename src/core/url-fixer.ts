import type * as cheerio from "cheerio";

/**
 * Fix relative URLs for images and links so they resolve correctly
 * after content extraction.
 */
export function fixRelativeUrls($: cheerio.CheerioAPI, baseUrl: string): void {
  $("img").each((_, element) => {
    const src = $(element).attr("src");
    if (src && !src.startsWith("http") && !src.startsWith("data:")) {
      try {
        $(element).attr("src", new URL(src, baseUrl).href);
      } catch {
        // Keep original if URL resolution fails
      }
    }
  });

  $("a").each((_, element) => {
    const href = $(element).attr("href");
    if (
      href &&
      !href.startsWith("http") &&
      !href.startsWith("#") &&
      !href.startsWith("javascript:") &&
      !href.startsWith("mailto:")
    ) {
      try {
        $(element).attr("href", new URL(href, baseUrl).href);
      } catch {
        // Keep original if URL resolution fails
      }
    }
  });
}
