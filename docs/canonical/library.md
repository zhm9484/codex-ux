# Shared local library

A Workspace owns a material library shared by its apps. A library location is an explicitly chosen
local directory or individual file. Registering it records its canonical absolute path without
copying or editing its contents. Removing a location removes only the registration. Previously saved
references retain their paths and metadata. Paths are local to the service machine; an agent must
share that filesystem and have permission to read them.

Browser file pickers do not provide reliable absolute paths. The Library dialog therefore browses
through the local Node.js service and accepts pasted absolute paths. It starts at the service user's
home directory, lists up to 500 non-hidden entries at a time, and lets users add the current folder
or individual files. There is no Electron/native-dialog dependency or automatic whole-disk index.

The service searches registered locations by filename and relative path, with recent references
first for an empty query. It skips hidden/tooling directories and symbolic links, stops at 10,000
visited entries, 100 matches or depth 20, and reports truncation. More specific locations and
queries narrow results. Missing or unreadable locations are reported. References reject traversal
and link escapes; content serving validates the reference and sandboxes downloadable active formats.

## Referencing materials

The shared React input opens a search popover on `@` or its `+` button. Results use original SVG
icons for folders, images, video, audio, fonts, documents and code. Surfaces use neutral grays;
saturated file colors and gently rounded folded-sheet glyphs distinguish material types. The
reference menu prioritizes filenames, shows parent paths only for nested entries, and reserves the
return-key hint for the selected row. Arrow keys select results, Enter attaches, and Escape
dismisses without closing the composer. Chinese input composition does not trigger selection. Inline
references are atomic editable tokens with filename/path metadata; input-local undo/redo restores
text and references together. Clicking a token previews the attachment.

A user-initiated paste containing image/file data or an ordinary browser file selection transfers
bytes to the local service. Each file is saved under `files/attachments/` with a generated unique
name, then referenced like other materials. Plain-text paste remains text; HTML is not inserted as
markup. These actions do not create video assets, update source or create a video revision. Limits
are 100 MB per attached file, 20 references per note and 4,000 message characters. Clipboard formats
and media decoding depend on the browser; a copied URL is text, not an automatic download.

Notes persist attachment snapshots alongside their original app context. Sending validates that
referenced files still exist and match their captured size/modification time. Changed or missing
files require choosing the current material again. Directories are location references, not frozen
recursive snapshots. Video requests include these absolute paths in each note's context; the agent
reads them and copies resources actually used into the candidate, leaving originals untouched.
Reference paths do not make external resources part of a saved/exportable video automatically.

## Ownership and reuse

- Protocol: `LibrarySource`, `LibraryEntry`, `LibraryReference`, `LibrarySearch`; no React or video
  dependencies.
- SDK: `WorkspaceLibrary(workspaceId, origin?)`, exposing sources, registration/removal, local
  browsing, search, references, upload and content URLs.
- Backend: Workspace `library.sqlite` stores location registrations and reference metadata;
  `files/attachments/` stores browser-provided bytes. The app database stores its own association
  between a note and those references.
- React: `@codex-ux/library-react` exports `LibraryBrowser`, `MentionInput`, `AttachmentList`,
  `FileIcon`, `LibraryIcon`, and a separately imported `styles.css`. Hosts provide the SDK client,
  modal, draft state and submission callback. Video revision/region/time handling stays in Video
  Editor. `MentionInput` accepts a host placeholder and optional footer actions so hosts can combine
  attachments with draft actions without duplicating input or upload controls.

There is no automatic attachment/reference garbage collection, content indexing or material
transformation. Removing a note does not delete its source files. See [Local API](local-api.md) for
routes and [Video Editor](video-editor.md) for the first integration.
