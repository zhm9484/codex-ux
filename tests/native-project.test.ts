import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { VideoStore } from '../packages/local-server/src/video/store.ts';
import { WorkspaceStore } from '../packages/local-server/src/storage/workspaces.ts';
import { NativeProjects } from '../packages/local-server/src/native/projects.ts';
import { materialize } from '../packages/local-server/src/video/files.ts';
import {
  nativeTextTargets,
  replaceNativeText,
  nativeTimelineItems,
  updateNativeTiming,
} from '../packages/video-domain/src/index.ts';

const html = `<!doctype html><html><head><link rel="stylesheet" href="styles/main.css"></head><body><div id="root" data-composition-id="main" data-width="640" data-height="360" data-duration="8"><p id="caption" data-start="1" data-duration="4">A &amp; B</p><div data-composition-src="scenes/detail.html" data-start="0" data-duration="8"></div><canvas id="art"></canvas></div><script type="module" src="scripts/main.js"></script><!-- keep this formatting --></body></html>`;
void test('native source snapshots preserve arbitrary dependencies, synchronize saves and restore immutable history', async () => {
  const root = await mkdtemp(join(tmpdir(), 'video-editor-native-'));
  const input = join(root, 'input');
  await mkdir(join(input, 'scripts'), { recursive: true });
  await mkdir(join(input, 'styles'));
  await mkdir(join(input, 'scenes'));
  await writeFile(join(input, 'index.html'), html);
  await writeFile(
    join(input, 'scripts/main.js'),
    'export const arbitrary = { source: "unchanged" };',
  );
  await writeFile(join(input, 'styles/main.css'), 'body { margin: 0; }');
  await writeFile(
    join(input, 'scenes/detail.html'),
    '<template><div>Nested composition</div></template>',
  );
  await writeFile(join(input, 'asset.bin'), Buffer.from([0, 255, 45, 10]));
  await writeFile(join(input, 'project.json'), '{"custom":"Not an editor document"}');
  const workspaces = new WorkspaceStore(join(root, 'data'));
  const store = new VideoStore(workspaces);
  const native = new NativeProjects(join(root, 'data'), store);
  try {
    const initial = store.create(workspaces.create('Native project').id);
    const imported = await native.importSource(initial.workspaceId, initial.revisionId, input);
    const id = imported.workspaceId;
    const directory = native.status(id).directory;
    assert.equal(imported.revision.document.native!.files['index.html']!.text, html);
    assert.equal(imported.revision.document.clips.length, 0);
    const revisionFiles = await materialize(join(root, 'data'), id, imported.revision);
    assert.equal(await readFile(join(revisionFiles, 'index.html'), 'utf8'), html);
    assert.deepEqual(
      await readFile(join(revisionFiles, 'asset.bin')),
      Buffer.from([0, 255, 45, 10]),
    );
    assert.equal(
      await readFile(join(revisionFiles, 'project.json'), 'utf8'),
      '{"custom":"Not an editor document"}',
    );
    const target = nativeTextTargets(html).find((target) => target.id === 'caption')!;
    const text = replaceNativeText(html, target.index, 'Changed <text>', 'color: red');
    assert.ok(text.includes('Changed &lt;text&gt;'));
    assert.ok(
      text.endsWith(
        '<script type="module" src="scripts/main.js"></script><!-- keep this formatting --></body></html>',
      ),
    );
    const document = structuredClone(imported.revision.document);
    document.native!.files['index.html']!.text = text;
    const change = {
      requestId: randomUUID(),
      baseRevision: imported.revisionId,
      label: 'Edit native text',
    };
    const edited = await native.commit(id, change, document);
    assert.equal((await native.commit(id, change, document)).revisionId, edited.revisionId);
    const item = nativeTimelineItems(edited.revision.document).find((item) =>
      item.id.endsWith(':caption'),
    )!;
    const timed = await native.commit(
      id,
      { requestId: randomUUID(), baseRevision: edited.revisionId, label: 'Retime native text' },
      updateNativeTiming(edited.revision.document, item, 2, 5),
    );
    assert.match(
      await readFile(join(directory, 'index.html'), 'utf8'),
      /data-start="2" data-duration="5"/,
    );
    const undo = await native.travel(id, timed.revisionId, 'undo');
    assert.equal(await readFile(join(directory, 'index.html'), 'utf8'), text);
    await writeFile(
      join(directory, 'scripts/main.js'),
      'export const arbitrary = { source: "agent changed it" };',
    );
    await native.sync(id);
    await new Promise((resolve) => setTimeout(resolve, 700));
    await native.sync(id);
    const synced = store.get(id);
    assert.notEqual(synced.revisionId, undo.revisionId);
    assert.equal(synced.revision.author, 'agent');
    assert.equal(
      await readFile(join(revisionFiles, 'scripts/main.js'), 'utf8'),
      'export const arbitrary = { source: "unchanged" };',
    );
    await writeFile(join(directory, 'index.html'), '<html>Incomplete save</html>');
    await native.sync(id);
    await new Promise((resolve) => setTimeout(resolve, 700));
    await native.sync(id);
    assert.equal(store.get(id).revisionId, synced.revisionId);
    assert.match(native.status(id).error ?? '', /composition metadata/);
    await assert.rejects(
      native.commit(
        id,
        { requestId: randomUUID(), baseRevision: synced.revisionId, label: 'Stale UI' },
        synced.revision.document,
      ),
    );
    await writeFile(join(directory, 'index.html'), text);
    await native.sync(id);
    await new Promise((resolve) => setTimeout(resolve, 700));
    await native.sync(id);
    assert.equal(native.status(id).error, undefined);
    assert.equal(await readFile(join(input, 'index.html'), 'utf8'), html);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
