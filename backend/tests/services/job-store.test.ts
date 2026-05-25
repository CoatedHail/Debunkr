import { createJobStore } from '../../src/services/job-store.js';

describe('JobStore', () => {
  it('creates a job and returns a unique jobId', () => {
    const store = createJobStore();
    const job = store.create({ url: 'https://example.com' });
    expect(job.jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(job.status).toBe('pending');
  });

  it('retrieves a job by id', () => {
    const store = createJobStore();
    const { jobId } = store.create({ url: 'https://example.com' });
    const fetched = store.get(jobId);
    expect(fetched).toBeDefined();
    expect(fetched?.status).toBe('pending');
  });

  it('returns undefined for unknown jobId', () => {
    const store = createJobStore();
    expect(store.get('unknown-id')).toBeUndefined();
  });

  it('updates a job to partial with article metadata', () => {
    const store = createJobStore();
    const { jobId } = store.create({ url: 'https://example.com/a' });
    store.update(jobId, {
      status: 'partial',
      article: { title: 'Test', siteName: 'example.com' }
    });
    const result = store.get(jobId);
    expect(result?.status).toBe('partial');
    expect(result?.article?.title).toBe('Test');
  });

  it('updates a job to complete with content score', () => {
    const store = createJobStore();
    const { jobId } = store.create({ url: 'https://example.com/a' });
    store.update(jobId, {
      status: 'complete',
      contentQuality: 72,
      contentReasoning: 'Article cites multiple primary sources.'
    });
    const result = store.get(jobId);
    expect(result?.status).toBe('complete');
    expect(result?.contentQuality).toBe(72);
  });

  it('updates a job to failed with an error envelope', () => {
    const store = createJobStore();
    const { jobId } = store.create({ url: 'https://example.com/a' });
    store.update(jobId, {
      status: 'failed',
      error: {
        code: 'EXTRACTION_FAILED',
        message: 'Could not fetch the article.',
        retryable: true
      }
    });
    const result = store.get(jobId);
    expect(result?.status).toBe('failed');
    expect(result?.error?.code).toBe('EXTRACTION_FAILED');
  });

  it('preserves earlier fields across multiple updates', () => {
    const store = createJobStore();
    const { jobId } = store.create({ url: 'https://example.com/a' });
    store.update(jobId, { status: 'partial', article: { title: 'X' } });
    store.update(jobId, { status: 'complete', contentQuality: 50 });
    const result = store.get(jobId);
    expect(result?.article?.title).toBe('X');
    expect(result?.contentQuality).toBe(50);
  });
});
