# Video editor

Video Editor is a collaboration container for Hyperframes source, Remotion source and finished video
files. One video project lives in each workspace. Playback, timeline selection, notes, history and
agent requests use the same interface for all three. An engine's authoring model stays in its
ordinary files; the editor does not translate those files into a universal clip arrangement.

The workspace selector switches this app instance without changing other pages. Workspace names are
independent of video titles. Chat, Notes and app Fullscreen live in a movable vertical tool island.
Agent connection and Library open centered dialogs from the header, alongside version history,
undo/redo and Export. Library registers local material folders/files shared by this Workspace’s
apps. Chat and Add note use `@`, file selection, drop and paste to attach references. Drag the tool
grip or use arrow keys; its position is saved locally and clamped to the pane. Dialogs trap focus,
restore it on close and support Escape. Reduced-motion settings suppress animations.

**Video fullscreen** expands just the video with playback, mute, seeking and an exit button. The
same player stays mounted, retaining time and playback state; scrubbing preserves whether it was
playing. Editing and comparison are hidden until exit. Both fullscreen controls fall back to filling
the app pane when the browser rejects fullscreen. Escape exits the fallback.

## Source and engine capabilities

The working directory is `workspaces/<id>/files/video/`. First opening a video adopts existing
source there, or creates an original 18-second Hyperframes sample with gray, charcoal and periwinkle
scenes if empty. Agents use the local API to import an absolute project directory/video path or
replace the video. Project import and standalone asset management have no frontend controls. Import
copies files without modifying the original. A replacement is an undoable revision, including when
it changes engine, dimensions or duration.

An optional `video.json` manifest identifies the source. With no manifest, a root `index.html`
identifies Hyperframes; otherwise a single root MP4/WebM identifies media. Remotion requires a
manifest. The [local API](local-api.md) describes its fields.

| Source      | Playback and export                                              | Direct editing capability                               |
| ----------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| Hyperframes | HTML Player and Producer, pinned to 0.8.30                       | Unambiguous HTML text and explicit timing attributes    |
| Remotion    | Player and Renderer, pinned to 4.0.522                           | Source editing by the user or agent                     |
| Media       | Browser video playback; export copies the selected original file | Replace the file or ask the agent to edit/regenerate it |

Hyperframes entries declare `data-composition-id`, `data-width`, `data-height` and `data-duration`.
Relative modules, CSS, nested compositions and local resources are preserved. The server injects
playback/error reporting into the served entry only; export uses captured source. Browser-ready
dependencies must be vendored or prebuilt for relative URLs; arbitrary Hyperframes build systems are
not run.

Remotion manifests select a component file and export, with explicit width, height, fps,
`durationInFrames` and JSON `inputProps`. The server builds an isolated Player bundle and a
registered `Video` composition for Renderer from the same snapshot. TS/TSX/JS/JSX, CSS imports,
imported media and `staticFile()` resources under `public/` are supported. This convention does not
run Remotion Studio, evaluate `remotion.config.ts`, or discover composition metadata dynamically.
Projects supplying React, React DOM, Remotion or Player versions must match the pinned runtime
(React/React DOM 19.2.8). Extra dependencies require `package.json` and a frozen `pnpm-lock.yaml`;
installation uses pnpm 10.34.5 with lifecycle scripts and pnpmfile hooks disabled. Dependency
installation and bundles are cached outside working source.

Direct video accepts H.264 MP4 or browser-decodable VP8/VP9/AV1 WebM. FFprobe reads actual duration,
dimensions and rotation. Media time is measured in seconds: the app does not infer a frame rate or
promise frame-exact seeking for compressed or variable-frame-rate files. Code compositions use the
manifest fps. Frame controls stop before the end; media arrow steps are 0.1 seconds.

Snapshots preserve relative paths and bytes, excluding `.git`, `.DS_Store`, `node_modules`, `dist`,
`build`, `.cache`, `.next` and `.video-editor` at any depth. Other source symlinks are rejected.
Limits are 20,000 files, 2 GB total, 8 MB editable HTML/JS/TS/CSS/JSON, one hour and 16–7680 px per
dimension. Ignored tooling directories already in working source survive checkout and undo. Remote
URLs remain remote; neither lockfiles nor source history guarantee identical remote assets, system
fonts or browser behavior. Imported code executes as trusted local code, not in a security sandbox.

## Canvas and timeline

The timeline uses rendered scene thumbnails for static Hyperframes scenes and evenly spaced frame
samples otherwise. Click to seek, drag to select a range, use range edges to adjust it, or drag the
playhead to scrub. Arrow keys step by a composition frame or 0.1 seconds for media; I/O set range
boundaries. Empty canvas space can be dragged to select a normalized rectangle on every engine.
Selections offer **Add note**, also available from the canvas context menu.

Hyperframes text editing requires one plain HTML source target matching one rendered element. Stable
IDs distinguish repeated captions. Click to select, double-click to type, blur or Cmd/Ctrl+Enter to
save, and Escape to cancel typing. Drag text to reposition and corner handles to scale. Typeface and
color controls edit the source; the font picker offers system and uploaded fonts. Text edits patch
target text/start-tag ranges while preserving surrounding source and scripts. Generated, ambiguous,
occluded or unsupported text remains available to the agent in source.

Selecting supported text opens its focused timing lane. Explicit `data-start` and `data-duration`
attributes can be moved/resized, including offsets from statically referenced sub-compositions.
Double-clicking a block seeks to its start. Delete removes the source element; undo restores it.
Reused compositions and script-controlled timing do not receive invented timing controls. Attribute
edits do not rewrite GSAP keyframes; deleting a node may require a related script edit by the agent.
Clearing selection closes the lane. Remotion and media use range feedback instead of inferred
layers.

## Notes, versions and synchronization

A note records text, revision, seconds/range, optional object reference/region and an intent:
`change` or `transition`, with optional transition duration. A transition is an instruction for the
agent to implement in source or regenerated media. Saving it does not composite a transition. Both
Chat and Add note offer **Send now** for the current draft only and **Add to notes** to save it
locally. Pending notes appear in a draggable, collapsible board with a count, locate/edit/delete
controls and **Send all**. Its position persists and stays within the viewport. A successful batch
empties and hides the board; Notes can reopen it to access the centered **Notes history** dialog.
History shows submitted notes, their original context and delivery state. Editing checks the
previous text and rejects notes changed, removed or submitted in another page. Notes also retain
attachment references; editing uses the shared mention input and checks previous text and
attachments together.

An unbound send opens Agent connection and preserves the draft; **Continue sending** resumes the
chosen action after binding. Canceling preserves the draft without sending. Sending disables
repeated submissions. Draft creation uses a stable ID so a failed request can be retried without
duplicating notes. Uncertain delivery remains submitted and requires checking history rather than
automatic resending. The draft pins its reference when opened; closing/reopening and background
updates preserve typed drafts and their original anchors. Drafts are not persisted across reload.

The visible page polls every 1.8 seconds. Files must be stable across two observations at least 650
ms apart. Capture validates source and builds Remotion before committing an external revision.
Incomplete saves, invalid manifests and failed builds retain the current head and report an error.
UI writes, imports, publication and checkout are serialized; stale or unobserved working edits cause
409 rather than overwriting files. Undo/redo restores working source as well as the head.

Every accepted revision loads a replacement player behind the previous frame. The new player must
acknowledge readiness and seek to the paused position before the editor adopts its picture,
metadata, timeline and note revision together. Early runtime/resource errors retain the prior
presentation; later errors are reported on the active player. Updates pause playback. Direct text
editing is rejected while the displayed revision differs from the head. Unfinished inline typing
defers incoming previews, while a conflicting save still fails. The playhead interpolates runtime
samples; thumbnails belong to the displayed revision and are loaded separately.

Old notes never rebind to replacement content. Locating an older note opens that revision for
comparison. The selected export version is pinned when the export dialog opens. History retains all
revisions even when editing after undo creates a new branch.

Each instance remembers its own Codex session binding per workspace; switching A → B → A and
refreshing restore it. New/copied pages start unbound. Requests capture instance, workspace, app,
session, notes and base revision before delivery, so later switching cannot retarget them. The agent
receives HTTP context plus an isolated candidate directory containing ordinary project files. It
previews and publishes a candidate as one revision, or edits working files for polling to capture.
See [local API](local-api.md) for the publication contract.

The header’s Agent connection dialog offers **Connect current agent** to create a code for this
page. Agents can also open an invitation URL in a new page through the Workspace skill. Pairing
confirms the actual page/session; it never sends notes automatically. Manual task-ID/link entry
remains available and is labeled as a saved session, without implying verified delivery. An existing
other-session connection requires explicit takeover; opening a new page preserves it. Connection
receipt errors do not delete the saved binding or user notes.

## Assets and output

The [shared library](library.md) handles user-provided files and screenshots as message attachments.
Dragging files onto the canvas opens Chat and attaches them without changing the video. The agent
receives paths with each submitted note and decides how to use them in source. Existing app-specific
asset upload APIs remain available to agents; assets do not automatically become timeline layers.
Hyperframes fonts incorporated through that API receive local font-face declarations.

Hyperframes and Remotion render the selected saved snapshot to H.264 MP4. Direct media exports its
original MP4/WebM bytes, preserving audio and encoding. One export runs at a time; errors do not
change the editing revision. A service restart marks interrupted exports failed. Source versions,
prepared previews, dependency caches, thumbnails and exports have no automatic garbage collection.

There is no waveform/keyframe editor, stock library, automatic transition compositor or general
inference of script behavior. The previous structured arrangement format and native-mode aliases
have been removed. Existing unsupported video databases are rejected without resetting them; import
their ordinary source into a new workspace.
