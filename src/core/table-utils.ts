import type * as cheerio from "cheerio";

/**
 * Detect and unwrap layout tables used for page structure (not tabular data).
 * Processes from innermost tables outward to handle nesting.
 */
export function stripLayoutTables($: cheerio.CheerioAPI): void {
  const tables = $("table").toArray().reverse();

  for (const table of tables) {
    const $table = $(table);

    if (isDataTable($, $table)) continue;

    // Unwrap: replace table with cell content organized as divs
    const contents: string[] = [];
    $table.find("td, th").each((_, cell) => {
      const text = $(cell).text().trim();
      if (text) {
        const innerHtml = $(cell).html()?.trim();
        if (innerHtml) {
          contents.push(`<div>${innerHtml}</div>`);
        }
      }
    });

    if (contents.length > 0) {
      $table.replaceWith(contents.join("\n"));
    } else {
      $table.remove();
    }
  }
}

/**
 * Check if a table looks like a legitimate data table (not layout).
 * Returns true if the table has semantic indicators of tabular data.
 */
function isDataTable(
  $: cheerio.CheerioAPI,
  $table: ReturnType<cheerio.CheerioAPI>,
): boolean {
  if ($table.find("th").length > 0) return true;

  const role = $table.attr("role");
  if (role === "grid" || role === "table") return true;

  if ($table.find("caption").length > 0) return true;
  if ($table.attr("summary")) return true;

  // Has data-* attributes suggesting a table component
  const el = $table[0];
  if (el && "attribs" in el) {
    const attrs = (el as any).attribs || {};
    if (Object.keys(attrs).some((a: string) => a.startsWith("data-")))
      return true;
  }

  // Small tables with mostly text content → likely data
  const rows = $table.find("tr");
  if (rows.length <= 2) {
    const cells = $table.find("td");
    const textCells = cells.filter((_, c) => {
      const text = $(c).text().trim();
      return text.length > 0 && text.length < 200;
    });
    if (
      cells.length > 0 &&
      cells.length <= 6 &&
      textCells.length === cells.length
    ) {
      return true;
    }
  }

  return false;
}
