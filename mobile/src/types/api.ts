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
  | 'INTERNAL_ERROR'
  | 'JOB_NOT_COMPLETE';

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

export type ReliabilityTier = 'high' | 'medium' | 'mixed' | 'low' | 'unknown';

export interface DatasetVerdict {
  source: 'curated-wikipedia' | 'ifcn';
  verdict: string;
  details?: string;
  link?: string;
}

export interface PublisherLookup {
  canonicalDomain: string | null;
  reliabilityTier: ReliabilityTier;
  verdicts: DatasetVerdict[];
}

export type OverallBucket =
  | 'highly-credible'
  | 'mostly-credible'
  | 'mixed'
  | 'questionable'
  | 'low';

export type Confidence = 'high' | 'medium' | 'low';

export interface BiasEstimate {
  scale: number;
  source: 'llm' | 'allsides';
}

export interface CheapSignalsBreakdown {
  https: boolean;
  hasByline: boolean;
  hasSiteName: boolean;
  articleLength: number;
  longEnoughBonus: boolean;
  score: number;
}

export type DeepStatus = 'idle' | 'pending' | 'complete' | 'failed';

export interface AgentReport {
  reasoning: string;
  evidence: string[];
}

export interface JudgeRuling {
  verdict: string;
  confidence: Confidence;
}

// M8: external-evidence fact-check result types (mirror of backend EvidenceResult).
export type EvidenceVerdict = 'corroborated' | 'contradicted' | 'uncorroborated' | 'mixed';
export type CitationSupport = 'agrees' | 'contradicts' | 'context';

export interface EvidenceCitation {
  source: string;
  url: string;
  snippet: string;
  supports: CitationSupport;
}

export interface EvidenceResult {
  verdict: EvidenceVerdict;
  confidence: Confidence;
  citations: EvidenceCitation[];
  scoreDelta: number;
  reasoning: string;
}

export interface DeepAnalysis {
  skeptic: AgentReport;
  advocate: AgentReport;
  judge: JudgeRuling;
  modelLimitation: string;
  /** M8: external-evidence fact-check result, when available. */
  evidence?: EvidenceResult;
}

export interface JobResult {
  jobId: string;
  status: JobStatus;
  article?: ArticleMetadata;
  publisher?: PublisherLookup;

  overall?: number;
  bucket?: OverallBucket;
  confidence?: Confidence;

  sourceRep?: number;
  sourceRepFrom?: 'curated-wikipedia' | 'cheap-signals';
  cheapSignals?: CheapSignalsBreakdown;
  contentQuality?: number;
  contentReasoning?: string;
  bias?: BiasEstimate;
  counterArgument?: string;

  deepStatus?: DeepStatus;
  deepAnalysis?: DeepAnalysis;
  deepError?: ApiError['error'];

  error?: ApiError['error'];
}
