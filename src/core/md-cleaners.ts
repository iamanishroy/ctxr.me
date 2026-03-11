/**
 * Post-processing functions that clean up raw markdown output.
 * Each function handles one specific concern.
 * Phrase lists loaded from config/cleaner-patterns.json.
 * All regex patterns are pre-compiled at module level for CPU efficiency.
 */

import patterns from "../config/cleaner-patterns.json";

// --- Pre-compiled patterns from JSON config ---

const buildPhraseRegex = (phrases: string[]) =>
  new RegExp(
    phrases
      .map(
        (p) =>
          `(?:^|[\\s\\*\\_\\#\\-]+)${p.replace(/ /g, "[\\s\\*\\_\\#\\-]*")}(?:$|[\\s\\*\\_\\#\\-]+)`,
      )
      .join("|"),
    "gim",
  );

const NAV_RE = buildPhraseRegex(patterns.navigationPhrases);
const COPY_RE = buildPhraseRegex(patterns.copyPhrases);

const SKIP_LINK_RE = /\[(Skip to Content)\]\(#[^)]*\)/gi;
const BACK_TOP_RE =
  /\[(Return to top|Back to top|Scroll to top|Go to top|Top)\]\(#[^)]*\)/gi;
const BLANK_LINE_RE = /^\s*[\r\n]/gm;

// --- Pre-compiled patterns for fixCodeBlockFormatting ---
const LANG_PATTERN =
  "ts|tsx|js|jsx|typescript|javascript|python|py|java|c|cpp|csharp|cs|go|rust|ruby|php|html|css|scss|sass|less|json|xml|yaml|yml|bash|sh|shell|zsh|sql|swift|kotlin|dart|r|scala|perl|powershell|ps1|graphql|markdown|md|toml|ini|dockerfile|vue|svelte|astro|hcl|terraform|lua|elixir|elm|haskell|ocaml|fsharp|clojure|groovy|console|diff|text";
const FILE_PATH_PATTERN = `(?:(?:[\\w\\-./]+\\.)?)(${LANG_PATTERN})(?:\\b|$)`;
const CODE_RE1 = new RegExp(`^(${LANG_PATTERN})\\n\`\`\`\\n`, "gm");
const CODE_RE2 = new RegExp(`^(${LANG_PATTERN})\\n\\n\`\`\`\\n`, "gm");
const CODE_RE3 = new RegExp(`^${FILE_PATH_PATTERN}\\n\`\`\`\\n`, "gm");
const CODE_RE4 = new RegExp(`^${FILE_PATH_PATTERN}\\n\\n\`\`\`\\n`, "gm");
const CODE_RE5 = new RegExp(`^${FILE_PATH_PATTERN}\\s*\`\`\`\\n`, "gm");

// --- Pre-compiled patterns for link/marker/escape cleaners ---
const INLINE_LINK_RE = /\[([^\]]+)\]\([^)]+\)/g;
const EDIT_MARKER_RE = new RegExp(
  `\\[\\s*(?:${patterns.editMarkers.join("|")})\\s*\\]`,
  "g",
);
const CITATION_RE = new RegExp(
  `\\[\\s*(?:${patterns.citationMarkers.map((m) => m.replace(/\?/g, "\\?")).join("|")})\\s*\\]`,
  "gi",
);
const REF_NUMBER_RE = /\[\d{1,3}\]/g;
const BACKSLASH_RE = /\\([.,:;!?'"()\[\]{}|\\*_~`#>+\-])/g;

// ─── Cleaners ─────────────────────────────────────────────

/** Escape newlines inside markdown link text so multi-line links render correctly. */
export function processMultiLineLinks(md: string): string {
  let insideLink = false;
  let result = "";
  let openCount = 0;

  for (let i = 0; i < md.length; i++) {
    const ch = md[i];
    if (ch === "[") openCount++;
    else if (ch === "]") openCount = Math.max(0, openCount - 1);

    insideLink = openCount > 0;
    result += insideLink && ch === "\n" ? "\\\n" : ch;
  }
  return result;
}

/** Remove navigation aid links like "Skip to Content", "Back to top". */
export function removeNavigationAidLinks(md: string): string {
  return md
    .replace(SKIP_LINK_RE, "")
    .replace(BACK_TOP_RE, "")
    .replace(NAV_RE, "\n")
    .replace(COPY_RE, "\n")
    .replace(BLANK_LINE_RE, "");
}

/** Remove empty links: `[](url)` and `[  ](url)` patterns. */
export function removeEmptyLinks(md: string): string {
  return md.replace(/\[\s*\]\([^)]*\)/g, "");
}

/**
 * Clean up broken/empty markdown tables and layout-table noise.
 * Strips pipe-only lines, extracts content from layout-table rows.
 */
export function cleanBrokenTables(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip pipe/whitespace/dash-only noise
    if (/^[|\s\-:]*$/.test(trimmed) && trimmed.includes("|")) continue;

    const isTableLike = trimmed.startsWith("|") || trimmed.endsWith("|");

    if (!isTableLike) {
      result.push(line);
      continue;
    }

    const cells = trimmed
      .split("|")
      .map((c) => c.trim())
      .filter(
        (_, idx, arr) =>
          idx > 0 &&
          idx < arr.length - (trimmed.endsWith("|") ? 1 : 0),
      );

    const nonEmpty = cells.filter((c) => c.length > 0);

    // All-empty row → skip
    if (nonEmpty.length === 0) continue;

    // Divider row → only keep if sandwiched between data rows
    if (/^[|\s\-:]+$/.test(trimmed)) {
      const prev = result.length > 0 ? result[result.length - 1]?.trim() : "";
      const next = i + 1 < lines.length ? lines[i + 1]?.trim() : "";
      const isData = (s: string) =>
        /^\|.*\|$/.test(s) && !/^[|\s\-:]+$/.test(s);

      if (isData(prev!) && isData(next!)) result.push(line);
      continue;
    }

    // Layout table: >70% empty cells with 3+ columns → extract text
    const emptyRatio =
      cells.length > 0 ? (cells.length - nonEmpty.length) / cells.length : 0;

    if (emptyRatio > 0.7 && cells.length > 2) {
      const content = nonEmpty.join(" ").trim();
      if (content) result.push(content);
      continue;
    }

    result.push(line);
  }

  return result.join("\n");
}

/** Truncate image alt text longer than configured max. */
export function truncateLongAltText(md: string): string {
  const max = patterns.maxAltTextLength;
  const re = new RegExp(`!\\[([^\\]]{${max + 1},})\\]\\(([^)]+)\\)`, "g");
  return md.replace(
    re,
    (_match, alt: string, url: string) =>
      `![${alt.substring(0, max - 3).trim()}...](${url})`,
  );
}

/** Remove consecutive duplicate headings (same level and text). */
export function collapseRedundantHeadings(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let lastHeading = "";

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const key = match[0].trim();
      if (key === lastHeading) continue;
      lastHeading = key;
    } else if (line.trim()) {
      lastHeading = "";
    }
    result.push(line);
  }

  return result.join("\n");
}

/** Merge stray language identifiers/file paths into adjacent code fences. */
export function fixCodeBlockFormatting(md: string): string {
  let result = md;
  result = result.replace(CODE_RE1, "```$1\n");
  result = result.replace(CODE_RE2, "```$1\n");
  result = result.replace(CODE_RE3, (_m, lang) => `\`\`\`${lang}\n`);
  result = result.replace(CODE_RE4, (_m, lang) => `\`\`\`${lang}\n`);
  result = result.replace(CODE_RE5, (_m, lang) => `\`\`\`${lang}\n`);
  return result;
}

/** Collapse 3+ consecutive newlines down to 2. */
export function removeExcessiveNewlines(md: string): string {
  return md.replace(/\n{3,}/g, "\n\n");
}

/**
 * Strip inline markdown links, keeping only the display text.
 * `[Shah Rukh Khan](url)` → `Shah Rukh Khan`
 * Preserves image links `![alt](url)` — only strips text links.
 */
export function stripInlineLinks(md: string): string {
  return md.replace(INLINE_LINK_RE, "$1");
}

/**
 * Remove editorial markers: [edit], [1], [2], [citation needed], etc.
 * These are Wikipedia/wiki navigation artifacts that add noise for LLMs.
 */
export function removeEditMarkers(md: string): string {
  return md
    .replace(EDIT_MARKER_RE, "")
    .replace(CITATION_RE, "")
    .replace(REF_NUMBER_RE, "");
}

/**
 * Fix stray backslash escapes from markdown conversion.
 * `1959\.` → `1959.`, `Khan\'s` → `Khan's`
 */
export function fixBackslashEscapes(md: string): string {
  return md.replace(BACKSLASH_RE, "$1");
}
