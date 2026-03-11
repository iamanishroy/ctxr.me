/**
 * Non-content selectors to strip during HTML cleaning.
 * Loaded from config/exclude-selectors.json for maintainability.
 */
import selectorConfig from "../config/exclude-selectors.json";

export const EXCLUDE_SELECTORS: readonly string[] = Object.values(
  selectorConfig.selectors,
).flat();
