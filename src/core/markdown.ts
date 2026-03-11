import { nhm } from "./md-translators";
import {
  processMultiLineLinks,
  removeNavigationAidLinks,
  removeEmptyLinks,
  cleanBrokenTables,
  truncateLongAltText,
  collapseRedundantHeadings,
  fixCodeBlockFormatting,
  removeExcessiveNewlines,
  stripInlineLinks,
  removeEditMarkers,
  fixBackslashEscapes,
} from "./md-cleaners";

/**
 * Convert cleaned HTML to LLM-friendly Markdown.
 * Runs the HTML through node-html-markdown, then applies
 * a pipeline of post-processing cleaners.
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return "";

  let md = nhm.translate(html);

  // Post-processing pipeline — order matters
  md = processMultiLineLinks(md);
  md = removeNavigationAidLinks(md);
  md = removeEmptyLinks(md);
  md = stripInlineLinks(md);       // [text](url) → text
  md = removeEditMarkers(md);      // [edit], [1], [citation needed]
  md = cleanBrokenTables(md);
  md = truncateLongAltText(md);
  md = collapseRedundantHeadings(md);
  md = fixCodeBlockFormatting(md);
  md = fixBackslashEscapes(md);    // \. → .
  md = removeExcessiveNewlines(md);

  return md.trim();
}
