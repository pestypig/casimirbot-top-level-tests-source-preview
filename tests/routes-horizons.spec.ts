import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getHorizonsElementsMock = vi.fn();

vi.mock('../server/utils/horizons-proxy', () => ({
  getHorizonsElements: getHorizonsElementsMock,
}));

describe('/api/horizons route contract', () => {
  beforeEach(() => {
    getHorizonsElementsMock.mockReset();
  });

  it('preserves response-shape parity with utility payload including provenance', async () => {
    process.env.FAST_BOOT = '1';
    vi.resetModules();

    const payload = {
      a_AU: 1.00000018,
      e: 0.01673163,
      i_deg: 0.00005,
      Omega_deg: -11.26064,
      omega_deg: 102.94719,
      M_deg: 100.46435,
      epochISO: '2026-01-01T12:00:00.000Z',
      perihelionISO: null,
      provenance: {
        sourceClass: 'fallback',
        diagnostic: true,
        certifying: false,
        note: 'Fallback orbital elements are diagnostic only and non-certifying.',
      },
    };
    getHorizonsElementsMock.mockResolvedValue(payload);

    const { registerRoutes } = await import('../server/routes');
    const app = express();
    app.use(express.json());
    await registerRoutes(app);

    const res = await request(app).get('/api/horizons?year=2026').expect(200);
    expect(res.body).toEqual(payload);
    expect(res.body.provenance?.sourceClass).toBe('fallback');
    expect(res.body.provenance?.diagnostic).toBe(true);
    expect(res.body.provenance?.certifying).toBe(false);
  }, 10000);
});
