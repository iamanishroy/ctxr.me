/**
 * Extract content from Next.js RSC flight data.
 * Works directly on raw HTML string — no cheerio needed.
 * Preserves document order by extracting headings and body text in a single pass.
 */
export function extractRscContent(rawHtml: string): string {
  // Fast bail: not a Next.js RSC page
  if (!rawHtml.includes("__next_f")) return "";

  // Extract payloads from self.__next_f.push([1,"..."]) in script tags
  const payloads: string[] = [];
  const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch;

  while ((scriptMatch = scriptRe.exec(rawHtml)) !== null) {
    const raw = scriptMatch[1];
    if (!raw.includes("__next_f")) continue;

    const pushRe = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
    let m;
    while ((m = pushRe.exec(raw)) !== null) {
      payloads.push(m[1]);
    }
  }

  if (payloads.length === 0) return "";

  // Unescape the flight data
  const text = payloads
    .join("\n")
    .replace(/\\\\n/g, "\n")
    .replace(/\\\\"/g, '"')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");

  // Single pass: find all headings and long body text in order of appearance.
  // Each match stores its index so we can sort by position.
  const elements: { index: number; html: string }[] = [];
  const seen = new Set<string>();

  // Headings: "as":"h1" ... "children":"text"
  const headingRe = /"as"\s*:\s*"(h[1-6])"[^}]*?"children"\s*:\s*"([^"]{3,})"/g;
  let match;
  while ((match = headingRe.exec(text)) !== null) {
    const clean = unescape(match[2]);
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      elements.push({
        index: match.index,
        html: `<${match[1]}>${clean}</${match[1]}>`,
      });
    }
  }

  // Body text: long "children":"..." strings
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
      elements.push({ index: match.index, html: `<p>${clean}</p>` });
    }
  }

  // Sort by position in the RSC payload to preserve document order
  elements.sort((a, b) => a.index - b.index);

  return elements.map((e) => e.html).join("\n");
}

function unescape(s: string): string {
  return s
    .replace(/\\n/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .trim();
}
