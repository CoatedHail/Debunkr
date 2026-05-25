import { app } from '../src/server.js';

describe('GET /health', () => {
  it('returns 200 with {ok: true}', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});
