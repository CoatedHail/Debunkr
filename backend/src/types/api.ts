// Shared API types — kept in sync (by hand) with mobile/src/types/api.ts.
// When you change a type here, update the mobile copy in the same commit.

export type ErrorCode =
  | 'URL_INVALID'
  | 'URL_BLOCKED'
  | 'EXTRACTION_FAILED'
  | 'LLM_UNAVAILABLE'
  | 'LLM_MALFORMED'
  | 'RATE_LIMITED'
  | 'BUDGET_EXCEEDED'
  | 'UNSUPPORTED_CONTENT_TYPE'
  | 'INTERNAL_ERROR';

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    retryAfter?: number;
  };
}

export interface CheckRequest {
  url: string;
  deviceId: string;
}

export interface CheckResponseAccepted {
  jobId: string;
  status: 'pending';
}

export type JobStatus = 'pending' | 'partial' | 'complete' | 'failed';

export interface ArticleMetadata {
  title?: string;
  byline?: string;
  siteName?: string;
}

// Fields populate as work progresses:
//   pending  → only jobId, status
//   partial  → + article metadata (extraction done, LLM not yet)
//   complete → + contentQuality, contentReasoning
//   failed   → + error
export interface JobResult {
  jobId: string;
  status: JobStatus;
  article?: ArticleMetadata;
  contentQuality?: number;       // 0-100, M2: only sub-score we compute
  contentReasoning?: string;     // 1-3 short sentences, plain English
  error?: ApiError['error'];     // populated when status='failed'
}
