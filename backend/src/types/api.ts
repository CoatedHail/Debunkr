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
    retryAfter?: number; // seconds
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

export type JobStatus = 'pending' | 'partial' | 'complete';

// In M1 the only field beyond the standard envelope is `echo`.
// Later milestones add sourceRep, contentQuality, bias, confidence, etc.
export interface JobResult {
  jobId: string;
  status: JobStatus;
  echo?: string; // M1 only — removed in M2
}
