# Video editor

The `video-editor` preset centers one video per project in a neutral canvas. The project selector
switches projects; it does not create additional videos. The timeline follows the preview and
playback controls, with layout based on both pane dimensions and the video's aspect ratio.

Chat, Notes, Add text (structured projects) and app Fullscreen live in a movable vertical tool
island. History is in the upper-right header alongside undo/redo and Export. Assets and project
source have no toolbar buttons; project imports and source access remain available through the local
API. Drag its grip or focus the grip and use arrow keys. Position is saved in local storage and
clamped when the pane resizes. Notes has a direct entry. Native fullscreen uses the browser API;
embedded browsers that reject it use an in-pane focus mode. Escape exits that mode. Export and
undo/redo remain in the header. Floating surfaces close on outside click or Escape. Reduced-motion
settings suppress animations.

The playback controls also have a separate **Video fullscreen** button. It expands only the video
with a dark background, playback/pause, mute, a seek bar and an exit button. The same player stays
mounted, retaining time and playback state; scrubbing preserves whether it was playing or paused.
Editing tools and comparison are hidden until exit. Escape or Exit video fullscreen returns to the
editor. If an embedded browser refuses native fullscreen, the same player view fills the app pane.

## Native HyperFrames projects

New projects use a native HyperFrames directory. The local source API exposes its source location or
imports an existing directory as a new revision. Import copies files; the original directory is not
modified. Older structured videos can be converted once using `POST /source`. That conversion
materializes their existing arrangement; subsequent native revisions never regenerate a main
timeline or wrap scenes from `project.json`.

Native `index.html`, scripts, styles, sub-compositions and binary resources are captured together.
Files that the app cannot interpret are retained byte for byte and remain available for playback,
export and agent edits. A native project's own `project.json`, if present, is just another file. The
app's revision document stores metadata and a resource manifest, not an authoring replacement for
the native project.

The entry is `index.html`, with positive `data-width`, `data-height`, `data-duration` and a
`data-composition-id`, following HyperFrames conventions. Browser-ready relative module imports,
CSS, nested composition paths and local resources are served under the same revision directory. The
app adds only playback/error-reporting scripts to the preview response. Export uses the unchanged
project files with HyperFrames Producer.

The source directory must be self-contained: root-absolute site URLs, external services, bare npm
imports and build systems are not converted into local dependencies. Build those projects for a
relative base or vendor their runtime dependencies first. Remote references remain remote and are
not frozen by local history. Symbolic links are rejected explicitly; `.git` and `.DS_Store` are
excluded. Current limits are 20,000 files, 2 GB total data, 4 MB of editable HTML, one hour, and
240–3840 px dimensions. Arbitrary project code is trusted local code; this is not a sandbox for
untrusted websites.

## Canvas and timing edits

- Click supported text to select it; double-click to type. Blur or Cmd/Ctrl+Enter saves; Escape
  cancels inline typing. Drag text to reposition it and drag its corner handles to scale it. The
  selection measures rendered text bounds, not the containing block's fixed width.
- Typeface opens a searchable grouped picker with 22 system font choices and imported fonts. System
  fonts depend on the machine. Color is also editable. Uploaded fonts are registered with local
  font-face declarations in both structured and native projects.
- Native UI editing requires an unambiguous plain HTML text node with a source location and a
  matching rendered node. Edits replace only the target text/start-tag ranges; scripts and
  surrounding source formatting are preserved. Ambiguous text, generated text, SVG/canvas content,
  and unsupported markup remain agent-editable. Transparent or opaque layers can intercept canvas
  selection; unsupported or occluded content remains accessible to the agent in source.
- The compact timeline uses rendered thumbnails. Click to seek, drag to select a time range, use its
  edge handles to adjust that range, or drag the playhead to scrub. Arrow keys step frames; I/O set
  range boundaries. There is no loop or cut/split toolbar.
- Selecting canvas text immediately shows a focused timing lane for that text alone. Clearing the
  selection closes it. There is no expand/collapse control, and showing the lane does not move the
  canvas beneath the pointer. Drag its block to move the start, drag its edges to change duration,
  and double-click the block to seek to its exact start and select its text. Other elements are not
  listed. Delete/Backspace or the right-click Delete action removes the selected source element;
  undo restores it.
- Native timing edits change explicit `data-start` and `data-duration` attributes. Offsets from
  statically referenced sub-compositions are accounted for. Reused sub-compositions and dynamically
  controlled timing cannot reliably map to a single editable block. Text without its own timing
  follows its source animation and gets a clear explanation instead of invented clip controls.
  Editing attributes does not rewrite authored GSAP keyframes; deleting a referenced node may
  require an agent to update its script as well.

Structured documents remain readable/editable for earlier revisions. They support their existing
text/media clips and uniquely matched plain scene text. General clip operations are still available
in the domain/API, without requiring a dense arrangement toolbar in the UI.

## Notes and synchronization

Drag empty canvas space to mark a region directly. The selected region or time range offers **Add
note**; right-clicking the canvas and the text toolbar offer the same action. The input opens near
the action, constrained to the visible pane. Chat opens it without replacing an existing draft
reference. Closing and reopening preserves the draft. Drafts survive background revision updates but
are not persisted across a full page reload.

A note captures revision, time/range, optional object reference and normalized rectangle. Its
reference is pinned when the input is opened. Saving stores it locally; selecting notes and pressing
Send explicitly delivers them to the connected Codex task. Submitted and unsent notes keep their
original revision anchors. Locating an older note opens that version for comparison; the app never
silently rebinds it to new content.

The visible page polls every 1.8 seconds. Native source changes must be stable across two scans
(separated by at least 650 ms) before capture. Each accepted external save becomes an agent-authored
revision; incomplete or invalid snapshots retain the current revision and report an error. Stale UI
writes are rejected instead of overwriting external files.

UI text changes reuse the current player when the committed document exactly matches the staged text
edit (apart from normalized resource hashes). Structural, timing, resource and external code changes
load a replacement behind the old frame. It is sought to the paused position and allowed two paints
before becoming visible. Early script/resource errors retain the previous frame and show an error;
later script failures are reported on the active preview. Updates pause playback. While the user is
typing directly in canvas text, preview adoption waits until typing ends, preserving the unsubmitted
text. A conflicting save still reports a stale-write error. Selection, notes, note drafts, range and
timeline expansion/scroll state stay in the editor. The playback indicator paints with
requestAnimationFrame between runtime samples, and thumbnails remain visible while newer images are
generated.

The connection accepts an existing task ID or `codex://threads/<id>` link. Codex receives an HTTP
context and an isolated candidate directory. Native candidates are edited as ordinary HyperFrames
files and explicitly published as one revision; direct edits to the working project are picked up by
polling. No MCP, internal-reasoning stream, multi-agent scheduler or concurrent merge is required.
Files attached to Codex are not automatically imported; the agent can upload them through the local
API. See [local API](local-api.md).

## History, media and output

History includes UI edits, source edits and agent publications. Undo/redo restores the native file
snapshot as well as the revision head; restoring an older version creates a new revision. Compare
shows old and current previews at the same time. Files and old versions are retained without
automatic garbage collection.

Assets accepts images, video, audio and fonts up to 100 MB each, including drops on the iframe.
Native uploads are copied into the project's assets directory for the agent to use. In native mode,
adding arbitrary media or text is an authoring action, not an automatic generated-layer operation.

Export renders a saved revision as H.264 MP4. The service permits one export at a time, retains its
result and download, and reports errors without changing the editing revision. Interrupted exports
are marked failed after restart. Preview and export use the same immutable local project resources.

The starter video is an original 18-second, three-scene composition derived from
`packages/video-domain/src/sample.ts`. It includes text, deterministic GSAP animation and
overlapping artwork. There is no waveform/keyframe editor, stock library or general inference of
script behavior.
