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

| Method and path                     | Behavior                                                                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` (base path)                  | Open a video project, initializing it once if needed; `{ format: "native" \| "structured" }`, default native                                    |
| `GET` (base path) or `GET /context` | `VideoProject`: workspace ID, video title, current revision/document, notes, history and source status                                          |
| `GET /revisions/:revisionId`        | Historical document and sources                                                                                                                 |
| `GET /source`                       | Working source directory and last scan error                                                                                                    |
| `POST /source`                      | `{ baseRevision, directory? }` imports an absolute native source directory; omitting directory materializes a structured video as native source |
| `POST /revisions`                   | Commit `{ requestId, baseRevision, label, document }`                                                                                           |
| `POST /undo` or `/redo`             | Move video history using `{ baseRevision }`                                                                                                     |
| `POST /notes`                       | Save `{ text, anchor }`                                                                                                                         |
| `DELETE /notes/:noteId`             | Remove an unsubmitted note                                                                                                                      |
| `POST /assets`                      | Upload raw bytes with MIME Content-Type and percent-encoded `X-File-Name`                                                                       |
| `POST /requests`                    | Submit `{ noteIds, target: { instanceId, session: { provider, sessionId } } }`                                                                  |
| `GET /requests/:requestId`          | Submission snapshot, current context, target, state and candidate paths                                                                         |
| `POST /requests/:requestId/publish` | Publish candidate with `{ label }`                                                                                                              |
| `POST /requests/:requestId/error`   | Record `{ message }` on a request                                                                                                               |
| `POST /exports`                     | Start rendering `{ revisionId }`                                                                                                                |
| `GET /exports/:jobId`               | Export result or error                                                                                                                          |

`POST` on the video base path is idempotent: two pages opening the same workspace receive the same
project; opening an existing project does not change its format. First native open adopts
`files/video/` when nonempty and creates a starter otherwise. Invalid existing source fails without
being overwritten or creating a video head. Structured initialization refuses a nonempty native
source directory.

Mutation IDs and base revisions are UUIDs. Replaying a committed mutation does not add a version and
returns the current video snapshot. A new write must name the current video head. Native saves and
imports also check unobserved source changes before writing. App writes are serialized per video
project; the service does not merge concurrent edits. Video title edits do not rename the workspace.

The previous unscoped video routes and workspace binding route do not exist. Workspace creation does
not accept a video-format flag. No API compatibility aliases are provided.

## Native source and versions

`POST /source` copies a self-contained project into `workspaces/<id>/files/video/`; it never
modifies the imported directory. Sibling files under `files/` and other apps' data remain
independent. Context includes `source.directory` and an optional source error. Visible pages poll
every 1.8 seconds; reading video context captures source changes after two stable observations at
least 650 ms apart. There is no separate background watcher.

Native video documents contain `native: { entry: "index.html", duration, files }`. Relative file
paths map to `{ hash, size, text? }`; editable HTML includes text, and binary resources refer to
SHA-256 blobs in `apps/video-editor/blobs/`. Commits normalize HTML hashes and verify resources
within this video project's blob store. A resource cannot be borrowed from another workspace.
Preview, history, candidates and export reconstruct those files unchanged. A native `project.json`
is an ordinary file, not an editor document.

The source can also be edited directly by an agent. Stable working edits become revisions through
polling, without a publish call. Choose either direct working edits or candidate publication for a
change: working edits can make a candidate stale. Never edit immutable `revisions/` files. Native UI
timing edits patch explicit HTML attributes rather than reinterpret arbitrary JavaScript timelines.
See [video editor](video-editor.md) for import limits and edit capabilities.

## Requests and publication

A submission snapshots the selected notes, base revision and target before asynchronous preparation
or delivery. It reserves those notes transactionally so another instance cannot submit them twice.
The target is stored in the video project's database, not resolved from a current workspace binding.
Switching workspaces, reconnecting, disconnecting or closing the originating page cannot retarget or
cancel that request.

Candidates live at `workspaces/<id>/apps/video-editor/requests/<requestId>/`. Native candidates
contain all captured project files. Structured candidates contain `project.json` and
`scenes/<sourceId>.html`; scene files override the corresponding JSON source strings at publication.
Add both a source key and its file for a new scene. Use stable object IDs and register deterministic
paused scene timelines under `window.__timelines`; structured source fragments use `__CLIP_ID__` for
instance selectors.

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

Publication reads the full candidate, validates resources, checks its base and records one
agent-authored revision. Repeated publication does not create duplicate revisions. Structural
validation does not guarantee visual correctness; the agent should inspect playback. Syntax/runtime
errors in arbitrary scene code are not fully preflighted.

Notes retain the revision where they were made, which can predate a request's base. Region
coordinates are normalized to the composition (`x`, `y`, `width`, `height` in 0–1); times are
seconds, and object IDs refer to video objects. Consult historical revisions when interpreting older
notes.

## Media routes and limits

Media routes are under `/media/video-editor` on the same origin, outside `/api`:

| Path                                      | Content                           |
| ----------------------------------------- | --------------------------------- |
| `/preview/:id/:revisionId/index.html`     | Saved composition preview         |
| `/candidate/:id/:requestId/preview.html`  | Candidate player wrapper          |
| `/candidate/:id/:requestId/index.html`    | Candidate composition             |
| `/capture/:id/:revisionId?time=...`       | Frame capture wrapper             |
| `/thumbnails/:id/:revisionId?time=...`    | Cached PNG frame                  |
| `/assets/:id/:file`                       | Uploaded media                    |
| `/exports/:id/:file`                      | Rendered MP4                      |
| `/engine/player.js`, `/engine/runtime.js` | Shared HyperFrames player/runtime |

Preview and candidate directories also serve referenced resources. Local media supports byte ranges.
Uploading returns an asset record but does not add it to a revision automatically; add it to
`document.assets` and reference it in the document. Audio/video assets include probed duration.
Codex attachments must be explicitly uploaded; attachment discovery is not implemented.
