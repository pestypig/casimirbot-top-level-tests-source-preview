import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true), statSync: vi.fn(() => ({ size: 262144 })),
  writeFileSync: vi.fn(), appendFileSync: vi.fn(),
}));
import { appendFileSync, writeFileSync } from 'node:fs';
import { appendOAuthDiagnostic } from '../apps/desktop/src/oauth-diagnostic-journal';
beforeEach(() => vi.clearAllMocks());
it('retains new diagnostic events after the journal fills', () => {
  appendOAuthDiagnostic('fixture.log', 'received');
  expect(writeFileSync).toHaveBeenCalledWith('fixture.log', '', { mode: 0o600 });
  expect(appendFileSync).toHaveBeenCalledWith('fixture.log', expect.stringMatching(/ received\n$/), { mode: 0o600 });
});
it('rejects arbitrary event text and isolates diagnostic I/O errors', () => {
  appendOAuthDiagnostic('fixture.log', 'secret-bearing-text' as any);
  expect(appendFileSync).not.toHaveBeenCalled();
  vi.mocked(writeFileSync).mockImplementationOnce(() => { throw Error('disk unavailable'); });
  expect(() => appendOAuthDiagnostic('fixture.log', 'rejected')).not.toThrow();
});
