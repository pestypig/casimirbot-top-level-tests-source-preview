import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
vi.mock('node-fetch', () => ({
  default: fetchMock,
}));

describe('server/utils/horizons-proxy getHorizonsElements', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('returns live provenance when parser succeeds', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => [
        'A= 1.00000123',
        'EC= 0.01670000',
        'IN= 0.00007000',
        'OM= -11.26064000',
        'W= 102.94719000',
        'MA= 100.46435000',
      ].join('\n'),
    });

    const { getHorizonsElements } = await import('../server/utils/horizons-proxy');
    const result = await getHorizonsElements('2026');

    expect(result.a_AU).toBeCloseTo(1.00000123, 8);
    expect(result.e).toBeCloseTo(0.0167, 8);
    expect(result.provenance).toEqual({
      sourceClass: 'live',
      diagnostic: false,
      certifying: true,
      note: 'Live JPL Horizons orbital elements.',
    });
  });

  it('returns diagnostic non-certifying fallback semantics on upstream failure', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const { getHorizonsElements } = await import('../server/utils/horizons-proxy');
    const result = await getHorizonsElements('2026');

    expect(result.provenance.sourceClass).toBe('fallback');
    expect(result.provenance.diagnostic).toBe(true);
    expect(result.provenance.certifying).toBe(false);
    expect(result.provenance.note.toLowerCase()).toContain('non-certifying');
    expect(result.epochISO).toBe('2026-01-01T12:00:00.000Z');
  });

  it('falls back when live payload is parse-incomplete', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => 'A= 1.00000123',
    });

    const { getHorizonsElements } = await import('../server/utils/horizons-proxy');
    const result = await getHorizonsElements('2026');

    expect(result.provenance.sourceClass).toBe('fallback');
    expect(result.provenance.diagnostic).toBe(true);
    expect(result.provenance.certifying).toBe(false);
  });

  it('parses json-format Horizons payload result text', async () => {
    const resultText = [
      'EC= 1.591429536350342E-02',
      'OM= 1.776179030721728E+02 W = 2.863568704502947E+02',
      'N = 1.142130337831415E-05 MA= 3.563524337712979E+02 TA= 3.562340674073986E+02',
      'A = 9.991949045337009E-01 AD= 1.015097950669922E+00 PR= 3.652004531142557E+02',
      'IN= 3.549055731418342E-03',
    ].join('\n');

    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          signature: { source: 'NASA/JPL Horizons API', version: '1.0' },
          result: resultText,
        }),
    });

    const { getHorizonsElements } = await import('../server/utils/horizons-proxy');
    const result = await getHorizonsElements('2026');

    expect(result.a_AU).toBeCloseTo(0.9991949045337009, 12);
    expect(result.e).toBeCloseTo(0.01591429536350342, 10);
    expect(result.omega_deg).toBeCloseTo(286.3568704502947, 10);
    expect(result.M_deg).toBeCloseTo(356.3524337712979, 10);
    expect(result.provenance.sourceClass).toBe('live');
    expect(result.provenance.certifying).toBe(true);
  });
});
