import type {
  ApiError,
  CheckResponseAccepted,
  JobResult,
  PublisherResearch
} from '../types/api';
import { API_BASE_URL } from '../config';
import { currentLocale } from '../lib/i18n';

export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ApiError['error'] };

async function parseJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function submitCheck(
  url: string,
  deviceId: string
): Promise<ApiResult<CheckResponseAccepted>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // v1.4: send the active i18n locale so the backend can route Wikipedia
      // entity lookups to zh.wikipedia.org first for Chinese users. Unknown
      // locale values are a no-op server-side, so we forward whatever we
      // have without special-casing here.
      body: JSON.stringify({ url, deviceId, locale: currentLocale() })
    });
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Network error — is the backend running?',
        retryable: true
      }
    };
  }

  const body = (await parseJsonSafe(res)) as
    | CheckResponseAccepted
    | ApiError
    | null;

  if (!res.ok) {
    if (body && 'error' in body) return { ok: false, error: body.error };
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: `HTTP ${res.status}`,
        retryable: false
      }
    };
  }

  return { ok: true, value: body as CheckResponseAccepted };
}

export async function getJob(jobId: string): Promise<ApiResult<JobResult>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/check/${jobId}`);
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Network error — is the backend running?',
        retryable: true
      }
    };
  }

  const body = (await parseJsonSafe(res)) as JobResult | ApiError | null;

  if (!res.ok) {
    if (body && 'error' in body) return { ok: false, error: body.error };
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: `HTTP ${res.status}`,
        retryable: false
      }
    };
  }

  return { ok: true, value: body as JobResult };
}

export async function startDeep(jobId: string): Promise<ApiResult<{ jobId: string; deepStatus: 'pending' }>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/check/${jobId}/deep`, {
      method: 'POST'
    });
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Network error — is the backend running?',
        retryable: true
      }
    };
  }

  const body = (await parseJsonSafe(res)) as { jobId: string; deepStatus: 'pending' } | ApiError | null;
  if (!res.ok) {
    if (body && 'error' in body) return { ok: false, error: body.error };
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: `HTTP ${res.status}`, retryable: false }
    };
  }
  return { ok: true, value: body as { jobId: string; deepStatus: 'pending' } };
}

export async function requestPublisherResearch(
  jobId: string,
  deviceId: string
): Promise<ApiResult<PublisherResearch>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/check/${jobId}/publisher-research`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId })
    });
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Network error — is the backend running?',
        retryable: true
      }
    };
  }

  const body = (await parseJsonSafe(res)) as PublisherResearch | ApiError | null;
  if (!res.ok) {
    if (body && 'error' in body) return { ok: false, error: body.error };
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: `HTTP ${res.status}`, retryable: false }
    };
  }
  return { ok: true, value: body as PublisherResearch };
}

export async function submitFeedback(
  jobId: string,
  vote: 'up' | 'down',
  deviceId: string,
  comment?: string
): Promise<ApiResult<{ ok: true }>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId, vote, deviceId, comment })
    });
  } catch (e) {
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Network error — is the backend running?', retryable: true }
    };
  }
  const body = (await parseJsonSafe(res)) as { ok: true } | ApiError | null;
  if (!res.ok) {
    if (body && 'error' in body) return { ok: false, error: body.error };
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: `HTTP ${res.status}`, retryable: false }
    };
  }
  return { ok: true, value: { ok: true } };
}
