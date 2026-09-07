# Local API and video collaboration

The HTTP transport is an implementation choice of the local server. The protocol package contains
only portable types for revision references, mutation IDs/results and feedback anchors. Video
objects are defined separately in `packages/video-domain/src/schema.ts`.

## Read and write

All API routes are under `http://127.0.0.1:5173/api` by default. JSON mutations use
`Content-Type: application/json`. Errors contain `{ error, code }`; invalid input is 400, missing
objects 404 and stale revisions 409. Endpoint paths are scoped to a workspace ID.

| Method and path                                    | Behavior                                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GET /health`                                      | Service identity and data directory                                                            |
| `GET /workspaces`                                  | Workspace summaries                                                                            |
| `POST /workspaces`                                 | Create native starter from `{ name }`; `native: false` retains the structured format           |
| `GET /workspaces/:id` or `/context`                | Current revision/document, notes, history and connection                                       |
| `GET /workspaces/:id/revisions/:revisionId`        | Historical document and scene sources                                                          |
| `GET /workspaces/:id/source`                       | Working source directory and last scan error                                                   |
| `POST /workspaces/:id/source`                      | `{}` converts a structured video; `{ directory }` imports an absolute native project directory |
| `POST /workspaces/:id/revisions`                   | Commit `{ requestId, baseRevision, label, document }`                                          |
| `POST /workspaces/:id/undo` or `/redo`             | Move history using `{ baseRevision }`                                                          |
| `POST /workspaces/:id/binding`                     | Set `{ threadId }`; null disconnects                                                           |
| `POST /workspaces/:id/notes`                       | Save `{ text, anchor }`                                                                        |
| `DELETE /workspaces/:id/notes/:noteId`             | Remove an unsent note                                                                          |
| `POST /workspaces/:id/assets`                      | Raw bytes with MIME Content-Type and percent-encoded `X-File-Name`                             |
| `POST /workspaces/:id/requests`                    | Deliver selected `{ noteIds }` to Codex                                                        |
| `GET /workspaces/:id/requests/:requestId`          | Request context and candidate paths                                                            |
| `POST /workspaces/:id/requests/:requestId/publish` | Publish candidate with `{ label }`                                                             |
| `POST /workspaces/:id/requests/:requestId/error`   | Record `{ message }` on the request                                                            |
| `POST /workspaces/:id/exports`                     | Start rendering `{ revisionId }`                                                               |
| `GET /workspaces/:id/exports/:jobId`               | Export result or error                                                                         |

`requestId` and `baseRevision` in mutations are UUIDs. Replaying a committed mutation does not
create another revision: the response is the workspace's current snapshot. A new mutation must name
the current head. The service does not merge stale changes automatically. Native UI saves also check
for unobserved filesystem changes before writing. Request delivery and publication are distinct:
accepting a CLI queue invocation does not mean the agent has finished.

## Native source and versions

New workspaces are native by default. `POST /source` copies a self-contained project into
`workspaces/<id>/project/`; it never edits the imported directory. The context snapshot includes
`source.directory` and an optional source error. Reading the workspace/context checks this
directory: stable file changes are captured as an agent revision after two observations at least 650
ms apart. The frontend supplies this polling while visible; there is no separate background file
watcher.

Native documents contain `native: { entry: "index.html", duration, files }`. Each relative path maps
to `{ hash, size, text? }`; HTML includes editable text, while other files refer to workspace-local
SHA-256 blobs. UI HTML commits normalize hashes and validate every referenced resource before
publication. A resource cannot be borrowed from another workspace's blobs. Files are reconstructed
unchanged for preview, history, candidates and export. `project.json` is not interpreted in native
projects. Native creation/import/timing/limits are described in [video editor](video-editor.md).

Native candidates receive all project files, with the same preview and publish endpoints as
structured candidates. Publication captures the complete candidate directory and checks its base
revision. Alternatively, the agent can edit `source.directory` directly for automatic capture; those
working edits need no publish call. Choose one workflow per change, since working edits make an
older candidate stale. Do not edit immutable `revisions/` files. Native timing controls only patch
explicit HTML attributes; they do not reinterpret arbitrary JavaScript timelines.

## Structured candidate workflow

This path is retained for earlier structured revisions; native projects use the file workflow above.

1. Store the selected notes and base revision, then create
   `workspaces/<id>/requests/<requestId>/project.json` and `scenes/<sourceId>.html`.
2. Invoke `codex queue --thread <threadId> --message <instructions>` using an argument array,
   without a shell. The adapter uses `CODEX_UX_CODEX_BIN`, the macOS bundled Codex executable, or
   `codex` on PATH. An existing task is required. This command was verified against the bundled CLI;
   other Codex installations must support `queue`.
3. Codex reads the supplied request URL with ordinary HTTP and edits the candidate files. The
   context contains the exact base document, selected notes, current revision, candidate directory,
   preview URL and publish URL. `GET /workspaces/:id/context` returns newer workspace information.
4. The candidate's `project.json` controls tracks, clips, source IDs, assets and editable
   properties. Its `sources` keys select scene files. At publication, each `scenes/<sourceId>.html`
   overrides the corresponding JSON source string; add both a source key and its file for a new
   scene.
5. The candidate preview at `/candidate/:id/:requestId/preview.html` loads a local HyperFrames
   player. The app-generated composition is `/candidate/:id/:requestId/index.html`. Previewing or
   editing these files does not alter the working revision.
6. Publish validates the document and source references, materializes its files (failing on missing
   assets), checks the base revision and creates one agent-authored revision. This is structural
   validation, not a guarantee of visual correctness; the agent should inspect candidate playback
   before publishing. Syntax/runtime errors in arbitrary scene code are not fully preflighted.

Notes refer to the revision where they were made, which may predate the request's base. Consult that
historical revision when interpreting a note. Region coordinates are normalized to the composition:
`{ x, y, width, height }` in 0–1; times use seconds. Object IDs refer to video clips. Keep IDs
stable when changing an existing object.

Scene sources are HTML template fragments. Use `__CLIP_ID__` for instance-specific selectors and
register a deterministic paused GSAP timeline under that ID in `window.__timelines`. The server
wraps each scene with HyperFrames composition metadata and supplies local GSAP. A trimmed scene uses
its source offset. Generated saved revision files are cache artifacts and must not be edited. Text
layers and media elements are generated from the document; arbitrary scene code remains free.

## Media and delivery limits

Uploading returns an asset record but does not add it to a revision automatically. Add the returned
record to `document.assets`, then reference its ID from a clip. Audio/video records include probed
duration. Preview and export use copies of the same immutable binary files. Assets from a Codex
attachment must be explicitly imported using this endpoint; attachment discovery is not implemented.

`/preview/:id/:revisionId/index.html` serves saved compositions, `/capture/:id/:revisionId?time=...`
serves a screenshot wrapper, `/thumbnails/:id/:revisionId?time=...` returns cached PNG frames, and
`/assets/:id/:file` and `/exports/:id/:file` serve local media with byte-range support.

The CLI timeout is 15 seconds. If delivery cannot be confirmed, the service retains the request and
reports uncertainty; it does not automatically retry and risk duplicate messages. Verify the Codex
task before resending. Errors reported by the agent are readable in the request context. The app has
no multi-agent scheduler, concurrent edit resolution, cancellation protocol or resumable event log.
Custom app builds and a domain-independent SDK remain future work.
