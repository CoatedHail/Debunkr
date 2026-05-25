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
