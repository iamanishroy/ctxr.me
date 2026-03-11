/**
 * Non-content selectors to strip during HTML cleaning.
 * Used by MainContentHandler to identify elements to remove.
 *
 * Adapted from deepcrawl's selector list, optimized for LLM-friendly output.
 */
export const EXCLUDE_SELECTORS = [
  // Core structural non-content
  "header",
  "footer",
  "nav",
  "aside",
  "style",
  "script",
  "noscript",
  "iframe",
  "svg",

  // ARIA roles
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  '[role="search"]',
  '[role="dialog"]',
  '[role="alert"]',

  // Hidden elements
  '[aria-hidden="true"]',
  "[hidden]",

  // Navigation
  ".header",
  ".navbar",
  "#header",
  "#navbar",
  ".navigation",
  "#nav",
  ".menu",
  "#menu",
  ".breadcrumbs",
  "#breadcrumbs",
  ".visually-hidden",

  // Footers
  ".footer",
  "#footer",
  ".footer-links",
  ".footer-nav",
  ".site-footer",

  // Sidebars
  ".sidebar",
  "#sidebar",
  ".side-bar",

  // Popups, modals, overlays
  ".modal",
  ".popup",
  ".overlay",
  ".dialog",
  ".drawer",
  ".banner",
  ".toast",

  // Ads
  ".ad",
  ".ads",
  ".advertisement",
  ".advertising",
  ".sponsor",
  ".promotion",
  ".promo",
  ".advert",
  "#ad",

  // Social & sharing
  ".social",
  ".social-media",
  ".social-links",
  "#social",
  ".share",
  "#share",
  ".sharing",

  // Comments
  ".comments",
  ".comment-section",

  // Cookie & consent
  ".cookie",
  ".cookie-banner",
  ".consent",

  // Search
  ".search",
  "#search",
  "#search-form",

  // Widgets & UI chrome
  ".widget",
  "#widget",
  ".theme-switcher",
  ".lang-selector",
  ".skip-link",
  ".skip-to-content",

  // Pagination
  ".pagination",
  ".pager",
  ".toolbar",

  // TOC & documentation
  ".toc",
  ".table-of-contents",
  "#toc",
  ".on-this-page",
  "#on-this-page",
  ".docs-toolbar",
  ".docs-edit-link",

  // Feedback
  ".feedback",
  ".was-this-helpful",

  // Back to top
  ".back-to-top",
  "#back-to-top",
  ".scroll-to-top",
  ".return-to-top",

  // Newsletter
  ".newsletter",
  ".announcement",
] as const;
