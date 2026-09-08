# Architecture

Codex UX provides a local collaboration protocol and web apps that share a data directory. The first
app is Video Editor, a collaboration container for Hyperframes, Remotion and finished videos.
Multiple app instances can open the same workspace; accepted changes are shared, and stale writes
are rejected without automatic merging.

## Concepts and ownership

| Term            | Meaning                                                                                |
| --------------- | -------------------------------------------------------------------------------------- |
| Data directory  | The shared local data root, defaulting to `~/.codex-ux/`                               |
| Workspace       | A persistent file container with an ID, name and creation time; independent of apps    |
| App             | A tool such as `video-editor`, identified separately from its installed build          |
| App instance    | One open application page, with its own ID and zero or one selected workspace          |
| Agent session   | An external conversation referenced by `{ provider, sessionId }`; currently Codex only |
| Session binding | The session selected by one app instance for one workspace                             |
| Video project   | Video Editor's document and history within a workspace; currently one per workspace    |

Workspaces belong to the data directory, not to an app. Multiple apps and multiple instances of one
app can use the same workspace. They share files, not an implicit universal document model. Apps
must agree on a concrete format to interpret or edit the same content. Workspace names are
independent of video titles and video undo/redo.

An instance remembers bindings separately for each workspace: switching A → B → A restores A's
binding. Refreshing the page preserves the instance and bindings. A new page starts unbound, even
when opened by a connected page. The browser SDK uses session storage, navigation identity and Web
Locks to prevent a copied page from restoring an instance still owned by another page. It uses no
browser-wide active workspace or session. Browsers without Web Locks start a fresh instance rather
than restoring an unverifiable identity. Selection and playback are page state; drafts and playback
position are not restored on reload.

Closing a page or disconnecting its binding does not delete workspace data, terminate the external
session or cancel submitted work. One session can be referenced by multiple instances. Binding does
not create a session or change its working directory. Requests capture the instance, workspace, app,
session and base revision when submitted; subsequent switching cannot retarget them.

The shared connection broker supports agent-created new-page invitations and existing-page offers.
The SDK acknowledges the actual instance before a receipt becomes connected. Codes are scoped to an
app and Workspace; existing-page offers also name the instance and previous session. A takeover must
explicitly match the previous session. Receipts are transient and renewed by the active page;
bindings remain page-owned. They do not add a Workspace-global binding or automatic message sending.

## Modules

| Module                                     | Implemented responsibility                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `apps/video-editor/src/`                   | React editor, workspace selection, canvas, playback, notes and export UI                |
| `packages/video-domain/`                   | Source manifests, video revisions, feedback intents, HTML operations and timing         |
| `packages/protocol/`                       | Portable workspace, app, instance, session, revision and operation references           |
| `packages/sdk/`                            | Framework-independent browser instance identity and workspace-specific session bindings |
| `packages/adapter-codex/`                  | Delivery to an existing Codex task through `codex queue`                                |
| `packages/local-server/src/storage/`       | Workspace metadata, directory creation and path boundaries                              |
| `packages/local-server/src/connections.ts` | Shared ephemeral pairing, acknowledgements, expiry and takeover checks                  |
| `packages/local-server/src/video/`         | Video databases, revision history, collaboration routes, assets and rendering           |
| `packages/local-server/src/sources/`       | Source import, snapshots, polling, dependency preparation and Remotion builds           |
| `packages/video-runtime/`                  | Common browser playback controller with Hyperframes, Remotion and media adapters        |
| `packages/local-server/src/`               | HTTP hosting, app registration, workspace routes, agent dispatch and process lifecycle  |

The protocol imports no React, Node.js, Codex or video engine. The browser SDK imports only portable
protocol types. The frontend cannot import local-server, adapter-codex or `node:*`; ESLint enforces
these restrictions. Packages expose TypeScript source and use Node.js 24 type stripping. React +
Vite builds the frontend and splits React and the HTML parser into cacheable chunks. Hyperframes
timeline metadata is cached per immutable document.

`apps/scene-3d/` remains reserved. There is no runtime-generated UI, automatic custom app build
manager, multi-agent coordinator or generic domain editing SDK.

The [shared local library](library.md) belongs to a Workspace. `packages/library-react/` provides
reusable material browsing and mention input components; the SDK and local service provide the same
reference and file APIs to every app. Video context remains app-owned.

## Storage

```text
~/.codex-ux/
  service.lock
  runtime.json
  workspaces/
    <workspaceId>/
      library.sqlite              # Shared material locations and references
    workspace.json
      files/
        video/
      apps/
        video-editor/
          state.sqlite
          blobs/
          assets/
          requests/
          presentations/
          dependencies/
          thumbnails/
          exports/
```

`workspace.json` is the authoritative workspace identity. Creating a workspace creates only its
metadata and empty `files/` and `apps/` directories. There is no root database or automatic starter
workspace. Workspaces can be copied to another data root while the service is stopped, preserving
IDs, files and app history together.

`files/` contains user- and agent-editable working content. Video Editor operates on `files/video/`;
its checkouts leave sibling files and other apps' state untouched. First opening a video project
adopts existing supported source there, or creates a starter if the directory is empty. App-private
state belongs under `apps/<appId>/`, shared by instances of that app rather than duplicated per
page. Video Editor keeps its SQLite database, SHA-256 blobs, uploaded assets, candidates, immutable
source and derived preview/render bundles, dependency caches, thumbnails and exports there. Uploads
also become project resources.

Each video database owns one document head, revisions, undo/redo, notes, delivery records and
mutation deduplication IDs. Transactions record edits and move the head together. Editing after undo
clears the redo stack but retains all revisions. Restoring a historical revision creates a new edit.
Source checkouts and app writes are serialized per video project; stale writes fail with 409.
Workspace metadata has no video document, revision head or session binding. Prepared artifacts are
keyed by source hashes, the manifest and pinned adapter versions. Build output never overwrites
working files. A common iframe controller acknowledges readiness and seeking before the editor
adopts a replacement presentation and its revision metadata.

These are user data, not Git content. Versions and media are retained without automatic garbage
collection. The current directory layout and namespaced API replace the previous workspace-as-video
model; no old database reader, binding endpoint, URL alias or migration layer is provided. Existing
source can be imported into a newly created workspace; existing user directories are never reset.

## Runtime and app builds

Use Node.js 24 and pnpm 10.34.5. Run `pnpm install`, then `pnpm dev`, and open
`http://127.0.0.1:5173/apps/video-editor/`. The app offers workspace selection and creation. A
selected workspace has URL `/apps/video-editor/w/<workspaceId>`; each page selects independently.
`/` lists hosted apps, and `GET /api/apps` returns their IDs and names.

The backend embeds Vite in development. `pnpm build` writes the Video Editor frontend to
`skills/codex-ux-video-editor/dist/` and generates the Workspace skill's source runtime bundle.
`pnpm start` serves that build. These distribution artifacts are committed and verified by CI; other
build output remains ignored. Installed skills run without a repository checkout or frontend build.
See [skills](skills.md) for installation, cache ownership and release verification.

`CODEX_UX_APPS_FILE` can point to a JSON array of `{ id, name, distDirectory }` records with unique
app IDs and absolute build paths, including builds distributed inside installed skills. The
configured array replaces the default Video Editor registration. All apps are served at
`/apps/<appId>/` and must build for that base. Registration hosts static builds; only Video Editor
currently has domain API handlers. `POST /api/apps` can register/update a trusted installed build in
the running service; the skill launcher persists its registry for restart. A build update leaves
workspace data in place.

The service uses a PID lock and health check to reuse the service for a data directory. All apps and
workspaces share its HTTP port. Chromium and FFmpeg subprocesses are still needed for rendering.

| Environment variable                                  | Purpose                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| `CODEX_UX_DATA_DIR`                                   | Override the data directory                                   |
| `CODEX_UX_APPS_FILE`                                  | Read hosted app build registrations from a JSON file          |
| `CODEX_UX_PORT`                                       | Override loopback port 5173                                   |
| `CODEX_UX_CODEX_BIN`                                  | Override the Codex executable                                 |
| `CODEX_UX_CHROME`                                     | Chromium for thumbnails, Remotion rendering and browser tests |
| `CODEX_UX_FFMPEG`, `CODEX_UX_FFPROBE`                 | Media generation/probing binary overrides                     |
| `PRODUCER_HEADLESS_SHELL_PATH`                        | Chromium executable for HyperFrames rendering                 |
| `HYPERFRAMES_FFMPEG_PATH`, `HYPERFRAMES_FFPROBE_PATH` | Hyperframes Producer binary overrides                         |

On macOS, Chrome defaults to `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
Elsewhere, provide Chromium through these settings or Playwright. FFmpeg and FFprobe use pinned
static dependencies. The workspace permits the `ffmpeg-static` and `esbuild` installation scripts;
restore skipped dependency builds before exporting. HyperFrames may fetch fonts while compiling;
fully offline rendering is not guaranteed. Remotion dependencies retain their own Remotion License;
the repository's MIT license does not relicense third-party packages.

The service binds to loopback, checks Host and Origin, and validates IDs and paths. It is a trusted
local application, not a hosted multi-user security boundary: video source and hosted apps execute
on the same origin and must be trusted. Session references are routing information, not credentials.

## Verification

`pnpm check` runs Prettier, ESLint, TypeScript, Node tests and the production build. Tests cover
workspace portability and app isolation, independent app hosting, revision conflicts, source
snapshots, request routing snapshots, publication, source/build rejection and HTTP validation.
Delivery tests substitute a local executable and never send real messages.

`pnpm test:browser` builds and starts an isolated service on port 5197 using a fresh directory under
`.codex-ux/browser-tests/` for each run. It covers instance/session isolation and restoration,
copied pages, sending while switching workspaces, canvas editing, draft preservation, history, media
drops, responsive layouts, fullscreen, Hyperframes dependencies, Remotion builds, direct video
replacement, old-version playback and failed-preview recovery. It renders Hyperframes and Remotion
MP4s and verifies direct media exports, requiring Chrome and the media binaries. Browser/export
integration is separate from `pnpm check`.

See [video editing](video-editor.md) and [local API](local-api.md) for detailed behavior.
