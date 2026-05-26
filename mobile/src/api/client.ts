import type {
  ApiError,
  CheckResponseAccepted,
  JobResult
} from '../types/api';
import { API_BASE_URL } from '../config';

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
      body: JSON.stringify({ url, deviceId })
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
