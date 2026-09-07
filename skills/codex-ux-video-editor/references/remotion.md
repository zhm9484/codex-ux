# Remotion source

Use Remotion when requested or when continuing an existing Remotion project. The adapter expects a
component export and explicit metadata in `video.json`:

```json
{
  "kind": "remotion",
  "entry": "src/Video.tsx",
  "exportName": "default",
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "durationInFrames": 180,
  "inputProps": {}
}
```

`exportName` defaults to `default`; `inputProps` defaults to `{}`. Export the React component
itself. The Editor supplies its own preview player and render registration. Existing Studio
registration, dynamic composition discovery, `calculateMetadata`, and arbitrary config execution are
not an import contract: select the desired composition and resolve its metadata explicitly.

The runtime supplies React/React DOM 19.2.8 and Remotion/@remotion/player 4.0.522. A simple
component can import them without its own package file. When declaring them, use those exact
versions. Additional dependencies need `package.json` and a matching `pnpm-lock.yaml`; preparation
installs frozen dependencies without project lifecycle scripts. Do not rely on source
`node_modules`. Preserve assets under ordinary relative paths or `public/`; use the appropriate
Remotion asset references. Check local video/audio seeking and rendered output, not only initial
playback.

The preview compiles the component separately from the immutable render bundle. Compile and early
runtime/resource failures preserve the previous presentation. After editing, verify the intended
revision is actually visible. Remotion layers are not inferred as directly editable canvas objects;
users annotate time ranges and regions for the agent to implement in source.
