import { afterEach, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { verifySolarRuntimeCandidate, stageSolarRuntimeCandidate, verifyStagedSolarRuntime } from '../apps/desktop/scripts/solar-runtime-staging-lib.mjs';
import releaseGuard from '../apps/desktop/scripts/solar-runtime-release-guard.cjs';
const roots: string[] = [];
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
afterEach(async () => { for (const root of roots.splice(0)) {
  if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) ||
      !path.basename(root).startsWith('solar-stage-test-')) throw new Error('Unsafe test cleanup target');
  await rm(root, { recursive: true, force: true });
} });
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'solar-stage-test-')); roots.push(root);
  const files = [];
  for (const name of ['solar-exporter/solar-exporter.exe', 'licenses/example/LICENSE', 'requirements.lock.txt', 'install-report.json', 'build.log']) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), name);
    files.push({ path: name, sha256: hash(name) });
  }
  const manifest = { schemaVersion: 'solar-runtime-candidate/1', platform: 'win32-x64',
    entry: 'solar-exporter/solar-exporter.exe', files, scienceRunAllowed: false,
    publicReleaseReady: false, cleanWindowsVerified: false };
  async function save() { const text = JSON.stringify(manifest); await writeFile(path.join(root, 'candidate-manifest.json'), text); return hash(text); }
  return { root, manifest, save, pin: await save() };
}
it('verifies and stages a pinned diagnostic payload and its provenance', async () => {
  const f = await fixture(); const candidate = await verifySolarRuntimeCandidate(f.root, f.pin);
  const runtime = path.join(f.root, '..', path.basename(f.root) + '-runtime'); roots.push(runtime);
  await stageSolarRuntimeCandidate(candidate, runtime);
  expect(await readFile(path.join(runtime, 'bin/solar-exporter/solar-exporter.exe'), 'utf8')).toBe('solar-exporter/solar-exporter.exe');
  expect(candidate.cleanWindowsVerified).toBe(false);
  expect((await verifyStagedSolarRuntime(runtime, candidate)).checkedFileCount).toBe(5);
  await writeFile(path.join(runtime, 'bin/solar-exporter/extra.dll'), 'extra');
  await expect(verifyStagedSolarRuntime(runtime, candidate)).rejects.toThrow('payload mismatch');
  await rm(path.join(runtime, 'bin/solar-exporter/extra.dll'));
  await expect(stageSolarRuntimeCandidate(candidate, runtime)).rejects.toThrow('already exists');
});
it('rejects public release even when a candidate is configured', async () => {
  const f = await fixture(); await expect(verifySolarRuntimeCandidate(f.root, f.pin, { releaseMode: true })).rejects.toThrow('public release');
});
it('blocks direct public packaging of a previously staged candidate', async () => {
  const f = await fixture(); await mkdir(path.join(f.root, 'bin/solar-exporter'), { recursive: true });
  expect(() => releaseGuard.assertSolarCandidateNotInPublicRelease(f.root, true)).toThrow('clean-installed Windows');
  expect(() => releaseGuard.assertSolarCandidateNotInPublicRelease(f.root, false)).not.toThrow();
});
it('rejects unpinned and mismatched manifests', async () => {
  const f = await fixture();
  await expect(verifySolarRuntimeCandidate(f.root, '')).rejects.toThrow('pinned');
  await expect(verifySolarRuntimeCandidate(f.root, '0'.repeat(64))).rejects.toThrow('hash mismatch');
});
it('rejects payload mutation and undeclared extras', async () => {
  const f = await fixture(); await writeFile(path.join(f.root, 'extra.exe'), 'extra');
  await expect(verifySolarRuntimeCandidate(f.root, f.pin)).rejects.toThrow('payload mismatch');
  await rm(path.join(f.root, 'extra.exe'));
  await writeFile(path.join(f.root, 'solar-exporter/solar-exporter.exe'), 'changed');
  await expect(verifySolarRuntimeCandidate(f.root, f.pin)).rejects.toThrow('payload mismatch');
});
it('rejects traversal and case-duplicate inventory entries', async () => {
  const f = await fixture(); f.manifest.files.push({ path: '../outside', sha256: '0'.repeat(64) });
  await expect(verifySolarRuntimeCandidate(f.root, await f.save())).rejects.toThrow('inventory');
  f.manifest.files.pop(); f.manifest.files.push({ ...f.manifest.files[0], path: f.manifest.files[0].path.toUpperCase() });
  await expect(verifySolarRuntimeCandidate(f.root, await f.save())).rejects.toThrow('inventory');
});
it('rejects inventory omissions and source changes during staging', async () => {
  const f = await fixture(); f.manifest.files.push({ path: 'missing', sha256: '0'.repeat(64) });
  await expect(verifySolarRuntimeCandidate(f.root, await f.save())).rejects.toThrow('missing files');
  f.manifest.files.pop(); const candidate = await verifySolarRuntimeCandidate(f.root, await f.save());
  await writeFile(path.join(f.root, 'solar-exporter/solar-exporter.exe'), 'changed');
  const runtime = path.join(f.root, '..', path.basename(f.root) + '-runtime'); roots.push(runtime);
  await expect(stageSolarRuntimeCandidate(candidate, runtime)).rejects.toThrow('changed during staging');
});
