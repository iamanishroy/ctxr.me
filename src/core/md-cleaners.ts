/**
 * Post-processing functions that clean up raw markdown output.
 * Each function handles one specific concern.
 */

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
  let cleaned = md
    .replace(/\[(Skip to Content)\]\(#[^)]*\)/gi, "")
    .replace(
      /\[(Return to top|Back to top|Scroll to top|Go to top|Top)\]\(#[^)]*\)/gi,
      "",
    );

  const navPhrases = [
    "skip to content",
    "return to top",
    "back to top",
    "scroll to top",
    "go to top",
    "top",
    "previous page",
    "next page",
    "jump to",
    "back to home",
    "home",
  ];

  const copyPhrases = [
    "copy page",
    "copy page content",
    "copy page content to clipboard",
    "copy to clipboard",
    "share this page",
    "share on",
    "print this page",
    "download pdf",
    "report an issue",
    "improve this page",
    "edit this page",
  ];

  const toRegex = (phrases: string[]) =>
    new RegExp(
      phrases
        .map(
          (p) =>
            `(?:^|[\\s\\*\\_\\#\\-]+)${p.replace(/ /g, "[\\s\\*\\_\\#\\-]*")}(?:$|[\\s\\*\\_\\#\\-]+)`,
        )
        .join("|"),
      "gim",
    );

  cleaned = cleaned.replace(toRegex(navPhrases), "\n");
  cleaned = cleaned.replace(toRegex(copyPhrases), "\n");
  cleaned = cleaned.replace(/^\s*[\r\n]/gm, "");

  return cleaned;
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
          idx > 0 && idx < arr.length - (trimmed.endsWith("|") ? 1 : 0),
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

/** Truncate image alt text longer than 120 characters. */
export function truncateLongAltText(md: string): string {
  return md.replace(
    /!\[([^\]]{121,})\]\(([^)]+)\)/g,
    (_match, alt: string, url: string) =>
      `![${alt.substring(0, 117).trim()}...](${url})`,
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
  const langPattern =
    "ts|tsx|js|jsx|typescript|javascript|python|py|java|c|cpp|csharp|cs|go|rust|ruby|php|html|css|scss|sass|less|json|xml|yaml|yml|bash|sh|shell|zsh|sql|swift|kotlin|dart|r|scala|perl|powershell|ps1|graphql|markdown|md|toml|ini|dockerfile|vue|svelte|astro|hcl|terraform|lua|elixir|elm|haskell|ocaml|fsharp|clojure|groovy|console|diff|text";

  const filePathPattern = `(?:(?:[\\w\\-./]+\\.)?)(${langPattern})(?:\\b|$)`;

  let result = md;

  // Standalone language id before code block
  result = result.replace(
    new RegExp(`^(${langPattern})\\n\`\`\`\\n`, "gm"),
    "```$1\n",
  );
  result = result.replace(
    new RegExp(`^(${langPattern})\\n\\n\`\`\`\\n`, "gm"),
    "```$1\n",
  );

  // File path before code block
  result = result.replace(
    new RegExp(`^${filePathPattern}\\n\`\`\`\\n`, "gm"),
    (_match, lang) => `\`\`\`${lang}\n`,
  );
  result = result.replace(
    new RegExp(`^${filePathPattern}\\n\\n\`\`\`\\n`, "gm"),
    (_match, lang) => `\`\`\`${lang}\n`,
  );
  result = result.replace(
    new RegExp(`^${filePathPattern}\\s*\`\`\`\\n`, "gm"),
    (_match, lang) => `\`\`\`${lang}\n`,
  );

  return result;
}

/** Collapse 3+ consecutive newlines down to 2. */
export function removeExcessiveNewlines(md: string): string {
  return md.replace(/\n{3,}/g, "\n\n");
}
