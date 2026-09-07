# Video collaboration contract

Use the running service origin from Workspace. All JSON mutations below use
`Content-Type: application/json`. Let `BASE` be `/api/workspaces/:workspaceId/apps/video-editor`.

1. `POST BASE` with `{}` opens/initializes a project. It adopts existing `files/video/` or creates
   starter Hyperframes files in an empty directory. It does not overwrite invalid existing source.
2. `GET BASE/context` returns the current revision, document, notes, history, and source status.
   `GET BASE/source` returns the absolute working directory and last scan error.
3. Import ordinary source or one MP4/WebM with `POST BASE/source`, body
   `{ "baseRevision": "CURRENT_UUID", "path": "/absolute/path" }`. Imports copy the source; the
   original remains unchanged. Subsequent working edits belong in the returned working directory.

The current revision UUID is the base for edits. Get it immediately before importing or mutating.
Two stable source observations at least 650 ms apart capture direct edits. The visible app polls
every 1.8 seconds; when it is closed, call context twice with sufficient spacing to trigger capture.
There is no independent background watcher. Wait for successful source capture and displayed
revision acknowledgement; incomplete saves and compile errors retain the prior head. Runtime errors
can retain the previous visible frame even after a new head was recorded.

## App-submitted feedback

The delivered message contains the exact request context URL, isolated candidate directory, preview
URL, and publish/error endpoints. Read that context first. It captures app, Workspace, instance,
session, request base, and selected notes. Notes can refer to revisions older than the request base.
Read `GET BASE/revisions/:revisionId` and inspect old frames when necessary.

Modify the ordinary candidate files for the selected engine. Open the provided candidate preview
after edits; it snapshots the candidate into an immutable prepared player. Inspect the changed times
and transitions. Publish with `POST REQUEST_URL/publish` and `{ "label": "Concise change" }`.
Publication checks the candidate base and working source and adds one undoable revision. Repeated
publication is idempotent. If blocked, report `{ "message": "Actionable explanation" }` to
`REQUEST_URL/error`. Do not queue a second agent session or mix working edits with candidate edits.

On conflict, do not force the stale candidate over new edits. Read the current head and explain or
reapply the intended change through a fresh, appropriate workflow. A queue acknowledgement means
sent, not completed. Uncertain delivery must not be automatically retried.

## Anchors, assets, export

Note anchors use seconds, optional normalized rectangles (`x`, `y`, `width`, `height` in 0–1), and
optional stable source object IDs. Intent is `{ kind: "change" }` or
`{ kind: "transition", duration?: SECONDS }`. Transition duration is positive and at most 60
seconds. Interpret intent in the original revision, then implement it in source or generated media.

Agent attachments are not automatically imported. Copy authorized local assets into the working
source or candidate using relative references. The UI upload route `POST BASE/assets` accepts raw
bytes, MIME Content-Type and percent-encoded `X-File-Name`; the returned asset must be incorporated
into the project to be used. Uploading alone does not add a scene, overlay, or audio track.

`POST BASE/exports` with `{ "revisionId": "SAVED_UUID" }` pins that snapshot.
`GET BASE/exports/:jobId` reports rendering, complete, or failed and its result. Hyperframes and
Remotion render H.264 MP4; media returns the original MP4/WebM bytes. One export runs at a time.
`POST BASE/undo` or `/redo` uses `{ baseRevision }` and restores working source with the head.

Source snapshots exclude tooling directories (`.git`, `node_modules`, `dist`, `build`, `.cache`,
`.next`, `.video-editor`) at any depth. Other symlinks are rejected. Keep project assets outside
excluded paths. Snapshots do not freeze remote URLs or system fonts. Preserve local assets when
reproducibility matters. Imported source is trusted local executable code.
