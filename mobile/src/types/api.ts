// Hand-mirrored from backend/src/types/api.ts.
// When you change one, change the other in the SAME commit.

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

export type JobStatus = 'pending' | 'partial' | 'complete';

export interface JobResult {
  jobId: string;
  status: JobStatus;
  echo?: string; // M1 only
}
