# Hyperframes source

Prefer Hyperframes for new compositions unless the user asks for Remotion. The editor initializes a
working starter including local GSAP; inspect and adapt it rather than depending on remote scripts.
A source directory uses:

```json
{ "kind": "hyperframes", "entry": "index.html", "fps": 30 }
```

Save that as `video.json`. A root `index.html` also selects Hyperframes without a manifest. The
entry composition supplies `data-composition-id`, `data-width`, `data-height`, and `data-duration`
(seconds). The starter uses `#root` and a paused timeline registered in `window.__timelines.main`.
Animation must be deterministic when seeking; use the engine timeline instead of wall-clock timers.
Keep the stage background opaque when layering scene transitions.

Use ordinary local HTML/CSS/JS and relative asset paths. Preserve stable element IDs so the app can
resolve supported text feedback. Plain, unambiguous source-backed text may be edited on canvas;
generated, ambiguous, or script-controlled elements should be edited by the agent in source.
`data-start` and `data-duration` expose supported timing, including static sub-compositions.
Changing these attributes does not rewrite GSAP keyframes: keep authored animations synchronized.

For an existing six-second video as a layer, a timed element can be:

```html
<video
  id="original-video"
  src="assets/original.mp4"
  playsinline
  data-start="0"
  data-duration="6"
  data-media-start="0"
  data-has-audio="true"
  style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain"
></video>
```

Use the actual duration, desired composition start, and source offset in seconds. Keep the main
composition's duration and paused timeline consistent. Verify actual seek, playback, and audio in
both preview and export. Do not assume browser autoplay synchronizes a media element to a paused
composition timeline. Retain local media as source assets. Refer to the installed Hyperframes
documentation/skills for advanced engine authoring when available; Editor integration does not
require those skills for importing or reviewing existing projects.

Open the candidate or working revision in the Editor, scrub across scene boundaries, and verify text
changes at their intended times. Export runs the saved Hyperframes snapshot through its renderer and
produces an MP4. The editor's timeline is a view over the source, not a separate universal clip
arrangement to keep in sync.
