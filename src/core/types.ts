// Types for the extraction pipeline

export interface PageMetadata {
  title?: string;
  description?: string;
  language?: string;
  canonical?: string;
  author?: string;
  keywords?: string[];
  ogType?: string;
  ogSiteName?: string;
  datePublished?: string;
  dateModified?: string;
  publisher?: string;
  image?: string;
}

/** Result from fetchPage() — raw HTML + parsed metadata. */
export interface FetchResult {
  html: string;
  title: string;
  description: string;
  metadata: PageMetadata;
}

/** Result from extractContent() — ready for formatting. */
export interface ExtractionResult {
  markdown: string;
  title: string;
  description: string;
  metadata: PageMetadata;
}
