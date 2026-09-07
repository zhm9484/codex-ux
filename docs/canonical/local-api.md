# Local API and video collaboration

HTTP is the local server's transport. The protocol contains portable workspace, app, instance, agent
session, revision and operation references; video documents belong to `video-domain`.

## Shared endpoints

All API paths below are relative to `http://127.0.0.1:5173/api`. JSON mutations use
`Content-Type: application/json`. Errors contain `{ error, code }`; invalid input is 400, missing
objects 404 and stale writes 409.

| Method and path       | Behavior                                                            |
| --------------------- | ------------------------------------------------------------------- |
| `GET /health`         | Service identity, API version and data root                         |
| `GET /apps`           | Hosted app IDs and names                                            |
| `GET /workspaces`     | Workspace identities: `{ id, name, createdAt }`                     |
| `POST /workspaces`    | Create a file container from `{ name }`; no app data is initialized |
| `GET /workspaces/:id` | Workspace identity plus absolute `directory` and `filesDirectory`   |

The workspace contract contains neither a video document nor an agent binding. App instances and
bindings are page-owned, managed by the browser SDK. They have no workspace-global mutation API.
Agent references use `{ provider, sessionId }`; the server currently accepts only
`provider: "codex"`. The Codex adapter maps `sessionId` to the external task's `threadId`.

## Video endpoints

The following paths are relative to `/workspaces/:id/apps/video-editor`.

| Method and path                     | Behavior                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `POST` (base path)                  | Open/initialize a video project with `{}`                                                              |
| `GET` (base path) or `GET /context` | VideoProject: workspace, title, revision/document, notes, history and source status                    |
| `GET /revisions/:revisionId`        | Immutable historical document and file manifest                                                        |
| `GET /source`                       | Absolute working directory and last scan error                                                         |
| `POST /source`                      | Import `{ baseRevision, path }`, an absolute project directory or MP4/WebM file                        |
| `POST /source/media`                | Replace from raw MP4/WebM bytes; `Content-Type`, percent-encoded `X-File-Name`, UUID `X-Base-Revision` |
| `POST /revisions`                   | Commit `{ requestId, baseRevision, label, document }`                                                  |
| `POST /undo` or `/redo`             | Move history using `{ baseRevision }`                                                                  |
| `POST /notes`                       | Save `{ text, anchor, intent }`                                                                        |
| `DELETE /notes/:noteId`             | Remove an unsubmitted note                                                                             |
| `POST /assets`                      | Upload raw bytes with MIME Content-Type and percent-encoded `X-File-Name`                              |
| `POST /requests`                    | Submit `{ noteIds, target: { instanceId, session: { provider, sessionId } } }`                         |
| `GET /requests/:requestId`          | Submission snapshot, target, state and candidate paths                                                 |
| `POST /requests/:requestId/publish` | Publish candidate with `{ label }`                                                                     |
| `POST /requests/:requestId/error`   | Record `{ message }` on a request                                                                      |
| `POST /exports`                     | Export `{ revisionId }`                                                                                |
| `GET /exports/:jobId`               | Export result or error                                                                                 |

Opening is idempotent. It adopts nonempty `files/video/`, or creates starter files in an empty
source directory. Invalid existing source fails without overwriting files or creating a head.
Imports copy files and leave the original directory, sibling workspace files and other apps alone.
The old initialization `format`, native conversion and unscoped video routes are not supported.

Mutation IDs and base revisions are UUIDs. Replaying a committed mutation returns the current
snapshot without another version. Writes must name the current head and cannot overwrite unobserved
working source changes. Writes, imports, publication, scans and checkout are serialized per project;
there is no automatic merge. A video title change does not rename the workspace.

## Source documents and versions

The strict version-1 video document is:

```ts
{
  version: 1,
  name: string,
  source: VideoSource,
  files: Record<string, { hash: string; size: number; text?: string }>,
  width: number,
  height: number,
  duration: number,       // seconds
  fps: number | null,    // null for direct media
  assets: Asset[]
}
```

`source` is resolved from ordinary source files. A `video.json` manifest accepts one of:

```json
{ "kind": "hyperframes", "entry": "index.html", "fps": 30 }
```

```json
{
  "kind": "remotion",
  "entry": "src/Video.tsx",
  "exportName": "default",
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "durationInFrames": 180,
  "inputProps": {}
}
```

```json
{ "kind": "media", "entry": "video.mp4" }
```

`exportName` and `inputProps` default to `default` and `{}`; Hyperframes fps defaults to 30. Without
a manifest, a root `index.html` selects Hyperframes, or one root MP4/WebM selects media. Hyperframes
dimensions/duration come from entry HTML metadata. Remotion metadata is explicit; Studio
registration, dynamic composition discovery and config execution are not supported. Media metadata
is probed, with no inferred fps. Incoming document metadata is re-derived at commit; change the
source manifest/files to change the video.

File paths are relative and traversal-free. HTML, JS/JSX, TS/TSX, CSS and JSON include editable
text; other resources refer to SHA-256 blobs under `apps/video-editor/blobs/`. Commits normalize
text hashes and verify binary hashes/sizes within this workspace. Lockfiles are preserved as binary
resources. Generated/tooling paths are excluded and cannot be submitted as revision source. See
[video editor](video-editor.md) for limits, dependency rules and supported capabilities.

`GET` context observes working source. Two stable scans at least 650 ms apart capture an external
edit as an agent-authored revision. The visible app polls every 1.8 seconds; there is no independent
background watcher. Validated snapshots and Remotion bundles are prepared before changing the head.
An invalid save or failed build reports `source.error` while retaining the head. Runtime failure can
still occur after a structurally valid commit; the UI retains the prior visible presentation until
the new player acknowledges readiness.

Ordinary working edits use polling; candidate edits use explicit publication. Mixing both for one
change can make the candidate stale. Never edit app-private `presentations/`, blobs or SQLite files.
Preview and rendering use immutable prepared source; undo/redo reconstructs working files from the
saved snapshot. Ignored tooling directories survive checkout and are not historical content.

## Requests and publication

A submission snapshots the selected notes, base revision and target before asynchronous preparation
or delivery. It reserves those notes transactionally so another instance cannot submit them twice.
The target is stored in the video project's database, not resolved from a current workspace binding.
Switching workspaces, reconnecting, disconnecting or closing the originating page cannot retarget or
cancel that request.

Candidates live at `workspaces/<id>/apps/video-editor/requests/<requestId>/` and contain the
captured ordinary source files for every engine. Edit component/HTML/CSS files, update `video.json`,
or replace the media file there. A project's own `project.json` has no editor-specific meaning.
Preserve stable IDs for source-backed text references. Hyperframes timelines follow engine
conventions; Remotion candidates use the component manifest above.

The adapter invokes `codex queue --thread <sessionId> --message <instructions>` using an argument
array, without a shell. It resolves `CODEX_UX_CODEX_BIN`, the bundled macOS executable, or `codex`
on PATH. An existing task and an executable supporting `queue` are required. The agent receives an
HTTP context URL, exact candidate directory, preview URL and publication/error endpoints. Context
returns `workspaceId`, `appId`, `target`, `baseRevision`, `currentRevision`, notes, document and
request state.

The request is durable before invoking the external queue. Successful queue acceptance is `sent`,
not agent completion. Preparation failures are `failed` and release the selected notes. Unconfirmed
CLI delivery is `delivery-unknown`; notes stay reserved and there is no automatic retry. Inspect the
external session before resubmitting. The CLI timeout is 15 seconds. The app does not create or
terminate sessions, schedule agents or resume interrupted delivery.

Publication reads the full candidate, validates resources, prepares required bundles, checks its
base and working source, then records one agent-authored revision. Repeated publication does not
create duplicate revisions. Structural validation does not guarantee visual correctness; the agent
should inspect playback. Remotion compile errors fail preparation; arbitrary runtime errors and
visual correctness still require preview inspection.

Notes retain the revision where they were made, which can predate a request's base. Region
coordinates are normalized to the composition (`x`, `y`, `width`, `height` in 0–1); times are
seconds, and object IDs identify supported source elements. A note must stay within its revision
duration. Intent is `{ kind: "change" }` or `{ kind: "transition", duration?: number }`; transition
duration is positive and at most 60 seconds. It describes requested behavior, not an applied edit.
Consult historical revisions when interpreting older notes.

## Media routes and limits

Media routes are under `/media/video-editor` on the same origin, outside `/api`:

| Path                                     | Content                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `/preview/:id/:revisionId/player.html`   | Saved version's common player                                             |
| `/preview/:id/:revisionId/source/:path`  | Captured source resource                                                  |
| `/preview/:id/:revisionId/preview/:path` | Derived preview bundle/resource                                           |
| `/candidate/:id/:requestId/player.html`  | Snapshot/build candidate and redirect to its immutable prepared player    |
| `/prepared/:id/:contentHash/player.html` | Prepared candidate player, with the same source/preview resource subpaths |
| `/capture/:id/:revisionId?time=...`      | Redirect to a saved player sought to seconds                              |
| `/thumbnails/:id/:revisionId?time=...`   | Cached PNG frame after player readiness                                   |
| `/assets/:id/:file`                      | Uploaded resource                                                         |
| `/exports/:id/:file`                     | Exported MP4/WebM                                                         |
| `/engine/preview.js`                     | Shared Hyperframes/media playback adapters                                |
| `/engine/runtime.js`                     | Hyperframes runtime                                                       |

Only manifest-listed source files and derived preview output are exposed; source `node_modules` and
render bundles are not preview resource routes. Byte ranges support local video playback. Candidate
previews are immutable per captured content, so module caching cannot show an old build under a new
source version. All player pages expose `window.__videoPreview`: readiness, seeking,
play/pause/mute, state subscription and optional HTML editing document. Frame captures wait for
`document.documentElement.dataset.ready === "true"` after loading and seeking.

An asset upload returns a record without adding a revision. Add it to `document.assets` in a commit
to copy it into source resources for agent use. Audio/video assets include probed duration. A media
replacement upload directly creates a source revision. Neither operation automatically creates
compositor layers. Codex attachments must be explicitly uploaded; attachment discovery is absent.

Exports pin a saved revision. Hyperframes and Remotion produce H.264 MP4 from its prepared files;
media export copies original bytes. Jobs report `rendering`, `complete` or `failed`, retain results,
and reject concurrent exports. Interrupted jobs are failed on restart. Source snapshots and caches
are retained without automatic garbage collection.
