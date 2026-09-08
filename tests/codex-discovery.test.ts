import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { codexCandidates } from '../packages/adapter-codex/src/discovery.ts';
import { queueRequest, DeliveryUnavailableError } from '../packages/adapter-codex/src/index.ts';

void test('Codex discovery respects explicit selection and discovers versioned Windows installs', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ux codex discovery '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, 'OpenAI', 'Codex', 'bin');
  for (const name of ['old', 'new', 'incomplete'])
    await mkdir(join(bin, name), { recursive: true });
  const older = join(bin, 'old', 'codex.exe');
  const newer = join(bin, 'new', 'codex.exe');
  await writeFile(older, 'fixture');
  await writeFile(newer, 'fixture');
  await utimes(older, 1, 1);
  await utimes(newer, 2, 2);
  assert.deepEqual(await codexCandidates('win32', { LOCALAPPDATA: root }), [
    'codex.exe',
    join(bin, 'codex.exe'),
    newer,
    older,
  ]);
  assert.deepEqual(
    await codexCandidates('win32', { LOCALAPPDATA: root, CODEX_UX_CODEX_BIN: '/explicit/missing' }),
    ['/explicit/missing'],
  );
  assert.deepEqual(await codexCandidates('darwin', {}), [
    '/Applications/ChatGPT.app/Contents/Resources/codex',
    'codex',
  ]);
  assert.deepEqual(await codexCandidates('linux', {}), ['codex']);
});

void test('a missing explicitly selected Codex executable is definitely unsent', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ux missing codex '));
  const previous = process.env.CODEX_UX_CODEX_BIN;
  t.after(async () => {
    if (previous === undefined) delete process.env.CODEX_UX_CODEX_BIN;
    else process.env.CODEX_UX_CODEX_BIN = previous;
    await rm(root, { recursive: true, force: true });
  });
  process.env.CODEX_UX_CODEX_BIN = join(root, 'missing.exe');
  await assert.rejects(
    queueRequest('test-session-12345', 'Never delivered'),
    DeliveryUnavailableError,
  );
});
