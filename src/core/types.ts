// Request/Response types for read feature

export interface ReadOptions {
  url: string;
  markdown?: boolean;
  cleanedHtml?: boolean;
  rawHtml?: boolean;
  metadata?: boolean;
}

export interface PageMetadata {
  title?: string;
  description?: string;
  language?: string;
  canonical?: string;
  robots?: string;
  author?: string;
  keywords?: string[];
  favicon?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  ogType?: string;
  ogSiteName?: string;
  twitterCard?: string;
  twitterSite?: string;
  twitterCreator?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
}

export interface ScrapedData {
  title: string;
  description: string;
  rawHtml: string;
  metadata?: PageMetadata;
}



export interface ReadSuccessResponse {
  success: true;
  targetUrl: string;
  title?: string;
  description?: string;
  markdown?: string;
  cleanedHtml?: string;
  rawHtml?: string;
  metadata?: PageMetadata;
}

export interface ReadErrorResponse {
  success: false;
  targetUrl: string;
  error: string;
}

export type ReadResponse = ReadSuccessResponse | ReadErrorResponse;
