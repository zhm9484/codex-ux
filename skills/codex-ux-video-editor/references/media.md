# Direct video

Import an MP4 or WebM path, or a directory containing one root video. An explicit manifest is:

```json
{ "kind": "media", "entry": "video.mp4" }
```

Dimensions and duration are probed from the file; the editor does not infer a composition fps. Users
can play, scrub, select ranges/regions, leave feedback, compare versions, and export the original
bytes. Burned-in text and flattened content are not editable source objects.

For simple processing, use an available media tool, write a new output, validate video/audio and
duration, then import or replace the project's media as a new version. In an app request, replace
the candidate media file and update its manifest when needed; preview and publish once complete. Do
not overwrite the user's only original file outside the Workspace.

Complex overlays, designed titles, or multi-scene animation usually warrant embedding the video
inside a Hyperframes composition. Explain the change when it becomes relevant; do not require an
engine just to view or annotate. See [source changes](source-changes.md).
