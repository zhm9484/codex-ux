---
name: codex-ux-video-editor
description:
  Create, review, and revise videos with the local Codex UX Video Editor, including Hyperframes
  projects, Remotion components, and MP4/WebM files. Use when users want video collaboration, time
  or region feedback, source previews, or revisions in Video Editor. Prefer Hyperframes for new
  compositions unless the user requests Remotion; preserve the engine of existing projects.
---

# Video Editor

Video Editor is the shared preview and feedback app. Its built web application ships in this skill's
`dist/`, with registration metadata in `app.json`. The agent edits ordinary source files or
generates replacement media; the app displays versions and lets users select, annotate, and edit
supported HTML text.

## Required Workspace skill

**Read the installed `codex-ux-workspace` skill before using the app.** It defines Workspace
ownership, service startup, and connecting this app instance to the current conversation. When
installed beside this skill, its entry is [Workspace SKILL.md](../codex-ux-workspace/SKILL.md).
Resolve the installed skill by name if the agent stores skills in different locations.

If absent, install the companion from the same repository/ref as this skill. The public pair is:

```sh
npx skills add zhm9484/codex-ux --skill codex-ux-workspace codex-ux-video-editor
```

For branch or local installations, use that same source for both. Do not silently mix releases. The
launcher validates their runtime fingerprints. Set `APP_SKILL` to this skill's absolute directory
and follow Workspace's startup instructions with `--app "$APP_SKILL/app.json"`. Initialize the video
project, open a new connected page or pair the user's explicit existing page, and verify
acknowledgement. Do not ask users to understand the two-skill architecture first.

## Choose the starting source

| Starting point or need                                               | Action                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| An existing MP4/WebM to review or annotate                           | Import it directly; preserve its original bytes                    |
| Simple trim, crop, or transcode                                      | A media tool may produce a replacement file; an engine is optional |
| New animated composition, designed overlays, titles, multiple scenes | Prefer Hyperframes                                                 |
| User explicitly requests Remotion                                    | Use Remotion                                                       |
| Existing Hyperframes or Remotion source                              | Keep its engine unless the requested work calls for a change       |

Read only the relevant source reference: [Hyperframes](references/hyperframes.md),
[Remotion](references/remotion.md), or [direct video](references/media.md). These explain the
editor's integration requirements. Use available engine/creative skills when they help, but do not
depend on private skills or force a house visual style onto the user's work.

## Work with the user

Read [collaboration.md](references/collaboration.md) for initialization, imports, feedback, and
publication. For a new brief, determine the audience, content, format, and constraints from the
conversation; ask only for missing decisions that materially affect the result. Produce a useful
first preview and keep iteration in the same Workspace.

Explain relevant controls when useful: play/scrub, select a time range or region, add notes, and
send chosen notes to the connected task. Hyperframes exposes some source-backed text and timing
edits. Remotion and direct media use range/region feedback rather than invented editable layers.
Transition notes are requests for the agent to implement, not already applied effects.

For an app-submitted request, read its exact context, note anchors, and candidate directory. Edit
the candidate, inspect its preview, then publish through the supplied endpoint. Do not also edit
working source for that same request. For ordinary conversational edits, edit working files and let
source observation capture the revision. Never patch app-private SQLite, blobs, or prepared preview
files. On 409, reread current context and reconcile; do not overwrite concurrent user work.

Validate playback at meaningful times, especially modified boundaries, and check audio when it
changes. A successful build or screenshot does not prove seeking, motion, or audio correctness.
Verify that the app displays the intended revision before claiming success. A failed replacement may
leave the old preview visible. Export the selected saved version when the user wants a final file,
and return the actual output path with a short description of changes.

## Upgrade or switch during the work

Do not lock the project to its initial format. When direct video needs designed overlays or a larger
composition, explain that the existing video can remain a media layer inside Hyperframes (or
Remotion if requested). Then follow [source changes](references/source-changes.md).

Preserve the original asset, audio, and intended timing; retain source for further editing.
Embedding an MP4 does not recover its flattened text, layers, or animation. Switching between
engines usually means rewriting composition code, not changing a manifest value. Exporting to MP4
does not require discarding the editable project. Old notes remain anchored to old revisions;
consult their original pictures instead of silently remapping them to new scenes.

The current Remotion adapter uses an explicit component manifest, not arbitrary Studio project
discovery. Direct-media export copies the original file. There is no automatic transition
compositor, inferred media layering, or automatic discovery of agent-chat attachments.
