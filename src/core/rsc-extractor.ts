import type * as cheerio from "cheerio";

/**
 * Extract content from Next.js RSC flight data.
 * Fallback for pages where content is in <script>self.__next_f.push()</script>
 * instead of the DOM.
 */
export function extractRscContent($: cheerio.CheerioAPI): string {
  const payloads: string[] = [];

  $("script").each((_, el) => {
    const raw = $(el).html() || "";
    if (!raw.includes("__next_f")) return;

    const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
      payloads.push(m[1]);
    }
  });

  if (payloads.length === 0) return "";

  // Unescape the flight data
  const text = payloads
    .join("\n")
    .replace(/\\\\n/g, "\n")
    .replace(/\\\\"/g, '"')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");

  const elements: string[] = [];
  const seen = new Set<string>();

  // 1. Headings
  const headingRe = /"as"\s*:\s*"(h[1-6])"[^}]*?"children"\s*:\s*"([^"]{3,})"/g;
  let match;
  while ((match = headingRe.exec(text)) !== null) {
    const clean = unescape(match[2]);
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      elements.push(`<${match[1]}>${clean}</${match[1]}>`);
    }
  }

  // 2. Body text — long children strings (the primary extraction method)
  const bodyRe = /"children"\s*:\s*"([^"]{40,})"/g;
  while ((match = bodyRe.exec(text)) !== null) {
    const clean = unescape(match[1]);
    if (
      clean &&
      !seen.has(clean) &&
      !clean.includes("{") &&
      !clean.includes("function") &&
      !clean.includes("/_next/") &&
      !clean.startsWith("$")
    ) {
      seen.add(clean);
      elements.push(`<p>${clean}</p>`);
    }
  }

  return elements.join("\n");
}

function unescape(s: string): string {
  return s
    .replace(/\\n/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .trim();
}
