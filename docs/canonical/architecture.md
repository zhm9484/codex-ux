# Architecture

Codex UX is a local collaboration workspace. The first preset is a video editor built around
HyperFrames HTML compositions. The app package and directory are `@codex-ux/video-editor` and
`apps/video-editor/`. The implementation supports one person editing a video and sending anchored
feedback to an existing Codex task. Concurrent editing is outside the supported workflow; stale
writes are rejected instead of silently overwriting newer work.

## Modules

| Module                               | Implemented responsibility                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| `apps/video-editor/src/editor/`      | Canvas layout, player interactions, scene strip, timeline, feedback composer and export |
| `apps/video-editor/src/canvas/`      | Native/structured text binding, source edits, live gestures and player reuse            |
| `apps/video-editor/src/panels/`      | Notes, assets, history and focused property editing                                     |
| `apps/video-editor/src/hooks/`       | Editor state, buffered player lifecycle, pointer gestures and backend synchronization   |
| `apps/video-editor/src/styles/`      | Separate foundations, controls, layout, panels, timeline and responsive styles          |
| `packages/video-domain/`             | Video metadata, native HTML source ranges, timing operations and starter sample         |
| `packages/protocol/`                 | Framework-independent revision, operation and anchor types                              |
| `packages/adapter-codex/`            | Existing-task delivery through `codex queue`                                            |
| `packages/local-server/src/storage/` | SQLite workspaces, immutable revision manifests and undo/redo                           |
| `packages/local-server/src/native/`  | Native project import, content-addressed snapshots, source polling and preview bridge   |
| `packages/local-server/src/video/`   | Composition generation, source files, assets, thumbnails and rendering                  |
| `packages/local-server/src/`         | HTTP routes, local hosting, process lifecycle and request publication                   |

The protocol imports no React, Node.js, Codex or video engine. The video document belongs to the
video domain, not to a universal protocol model. The frontend cannot import local-server,
adapter-codex or `node:*`; ESLint enforces these restrictions. Packages expose TypeScript source and
run with Node.js 24 type stripping. Application code uses React + Vite. JSX and TypeScript use the
repository's Prettier configuration; `pnpm check` rejects unformatted source. The production build
splits React and the HTML parser into cacheable chunks. Parsed native timeline metadata is cached
per immutable document; playback updates do not repeatedly parse project HTML.

`packages/sdk/` and `apps/scene-3d/` remain reserved. There is no general SDK, runtime-generated UI,
custom app build manager or multi-agent coordinator.

## Runtime

Use Node.js 24 and pnpm 10.34.5. Run `pnpm install`, then `pnpm dev` and open
`http://127.0.0.1:5173` in Codex's In-App Browser. The backend embeds Vite middleware during
development. For the preset production build, run `pnpm build` then `pnpm start`; the same backend
serves `apps/video-editor/dist/` without a separate Vite server.

The service defaults to `~/.codex-ux/`. It uses a PID lock and a health check to reuse an already
running service for that data directory. All videos share its HTTP port. They have separate IDs,
revisions, assets, requests, thumbnail caches and exports. A second launch reports the existing URL
instead of starting another service. This is one coordinating Node.js process; Chromium and FFmpeg
subprocesses are still required for rendering, and development tooling can use workers.

| Environment variable                                  | Purpose                                       |
| ----------------------------------------------------- | --------------------------------------------- |
| `CODEX_UX_DATA_DIR`                                   | Override the local data directory             |
| `CODEX_UX_PORT`                                       | Override loopback port 5173                   |
| `CODEX_UX_CODEX_BIN`                                  | Override the Codex executable                 |
| `CODEX_UX_CHROME`                                     | Chromium executable for thumbnail capture     |
| `PRODUCER_HEADLESS_SHELL_PATH`                        | Chromium executable for HyperFrames rendering |
| `HYPERFRAMES_FFMPEG_PATH`, `HYPERFRAMES_FFPROBE_PATH` | Override bundled media binaries               |

On macOS, Chrome defaults to `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Other
environments must provide Chromium through these settings or Playwright's installed browser. FFmpeg
and FFprobe come from pinned static binary dependencies. The workspace permits the `ffmpeg-static`
and `esbuild` installation scripts. If scripts were skipped during installation, restore the
dependency build before exporting. HyperFrames may fetch and cache fonts when compiling; a fully
offline rendering guarantee is not implemented.

## Storage and access

`state.sqlite` stores workspaces, immutable document revisions (including scene HTML and native file
manifests), notes, delivery requests and mutation deduplication IDs. SQLite transactions move a
workspace's head and record edits together. Undo moves the head to its parent; redo follows a saved
stack. Editing after undo clears that stack but retains all revisions for history and comparison.
Restoring a historical version creates a new edit, preserving later versions.

Files live under `workspaces/<workspaceId>/`: `project/` is the editable native source directory,
`blobs/` stores immutable SHA-256-addressed file contents, `assets/` contains imported files,
`requests/` contains editable candidates, `revisions/` contains generated immutable preview/render
inputs, `thumbnails/` contains cached frames, and `exports/` contains MP4 files and job records.
These are local user data, not Git content. Old revisions and media are retained; there is no
automatic garbage collection.

The service binds to loopback and checks Host and Origin. IDs and file paths are validated and
resolved under the appropriate workspace. It is a trusted local application, not a hosted multi-user
security boundary: scene HTML executes in same-origin frames and must be trusted. Credentials and
external account access are not part of the video document.

## Verification

`pnpm check` runs Prettier, ESLint, TypeScript, Node's test runner and a Vite production build.
`pnpm test` covers timing, import failures, workspace isolation, durable history, stale writes, HTTP
validation and candidate publication. The Codex-delivery test substitutes a local executable; it
does not send real messages. `pnpm test:browser` builds and starts an isolated service on port 5197,
then checks inline editing and cancellation, buffered revision replacement, anchored notes, narrow
layouts, selection-driven text timing/deletion, native and embedded-fallback video fullscreen with
playback/seeking, iframe/panel file drops, native module/sub-composition loading, draft preservation
during source updates, failed-update recovery and comparison. It requires Chrome and stores test
data in `.codex-ux/browser-tests/`. The native browser integration also renders an MP4 and requires
the media binaries. This export integration remains outside `pnpm check`.

See [video editing](video-editor.md) for user-facing behavior and [local API](local-api.md) for
collaboration details. Research and proposals belong in `docs/non-canonical/`.
