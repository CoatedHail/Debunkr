import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { app } from '../../src/server.js';
import { setFeedbackTestDeps } from '../../src/routes/feedback.js';
import { createFeedbackStore } from '../../src/services/feedback-store.js';

describe('POST /api/feedback', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'feedback-route-'));
    setFeedbackTestDeps({ store: createFeedbackStore({ dataDir: dir }) });
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('records up vote', async () => {
    const res = await app.request('/api/feedback', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: 'j1', deviceId: 'd1', vote: 'up' })
    });
    expect(res.status).toBe(201);
    const lines = readFileSync(path.join(dir, 'feedback-events.jsonl'), 'utf-8').trim().split('\n');
    expect(JSON.parse(lines[0]).vote).toBe('up');
  });

  it('records down vote with comment', async () => {
    const res = await app.request('/api/feedback', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: 'j1', deviceId: 'd1', vote: 'down', comment: 'too lenient on bias' })
    });
    expect(res.status).toBe(201);
    const lines = readFileSync(path.join(dir, 'feedback-events.jsonl'), 'utf-8').trim().split('\n');
    expect(JSON.parse(lines[0]).comment).toBe('too lenient on bias');
  });

  it('400s on missing vote', async () => {
    const res = await app.request('/api/feedback', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: 'j1', deviceId: 'd1' })
    });
    expect(res.status).toBe(400);
  });

  it('400s on invalid vote value', async () => {
    const res = await app.request('/api/feedback', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: 'j1', deviceId: 'd1', vote: 'sideways' })
    });
    expect(res.status).toBe(400);
  });
});
