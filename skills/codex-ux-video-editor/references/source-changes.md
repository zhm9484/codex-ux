# Changing source type during a project

Keep the current Workspace so the user retains versions and feedback. For app feedback, perform the
change in the supplied candidate and publish once. For direct conversational work, assemble a
complete new source directory outside the live working source, then import it against the current
revision. This avoids capturing a partially rewritten project while switching engines.

For media → Hyperframes (the default) or Remotion:

1. Retain the original video as a local asset. Match the original duration, dimensions, and audio
   unless the user's requested composition changes them.
2. Create a real composition using that asset as a media layer, with timeline-synchronized playback.
   Add the requested graphics or scenes and an appropriate engine manifest.
3. Check the first frame, middle, last frame, edited boundaries, seeks in both directions, and
   audio. Render a representative output when adding engine-specific video or audio behavior.
4. Import/publish the complete source and confirm the new revision is displayed. Explain that the
   project now has editable composition source, while the embedded video's internal layers remain
   flattened.

Hyperframes ↔ Remotion requires translating source behavior and timing. A changed `kind` field alone
cannot perform the conversion. Keep the original project in history and preserve reusable assets. Do
not migrate an existing Remotion project merely because Hyperframes is the default.

Rendering an engine project to MP4 is an output operation; keep its source project for subsequent
edits. Switch the active source to media only when that is actually the desired workflow.

Old notes retain their original revision/time/region. If duration, layout, or scene order changes,
consult the historical picture to interpret intent; do not silently reinterpret the same seconds as
the same content in the new version. Describe material changes to timing in the result.
