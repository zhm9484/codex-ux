---
name: codex-ux-scene-3d
description:
  Create, import, explore and collaboratively edit 3D scenes with the local Codex UX Scene app. Use
  for Three.js worlds, procedural environments, model assembly, direct object manipulation, or
  spatial feedback with an agent. Imports Meshy and Tripo output files without integrating their
  generation APIs.
---

# Scene

Use the app as the shared view while editing ordinary Three.js source. People can move, rotate,
resize, focus and annotate objects without learning an object hierarchy. This skill ships the built
app in `dist/` and its registration in `app.json`.

## Start and connect

Read the installed `codex-ux-workspace` skill first. It owns startup, shared files and connecting
the app page to this conversation. When installed together, read
[Workspace](../codex-ux-workspace/SKILL.md). If missing, install both from the same repository/ref:

```sh
npx skills add zhm9484/codex-ux --skill codex-ux-workspace codex-ux-scene-3d
```

Follow Workspace startup with `--app /absolute/path/to/codex-ux-scene-3d/app.json` and connection
with app ID `scene-3d`. Do not send to an unrelated task or replace a page's connection without user
authorization. Open `/apps/scene-3d/w/<workspaceId>`. Initialize the scene with
`POST /api/workspaces/<workspaceId>/apps/scene-3d` and `{}`; read
`GET /api/workspaces/<workspaceId>/apps/scene-3d/context` for its source directory and revision.

## Author the scene

Edit files in the returned source directory. Preserve `scene.json` placements, hidden IDs and
annotations, especially when regenerating geometry. The manifest selects `entry` (normally
`scene.ts`) and optional imported/primitive objects. Set `entry: null` only for a scene without
code. Do not edit private databases, blobs or generated bundles.

The entry exports a default setup function, optionally async. Available context:

- `THREE`, `scene`, `root`, `camera`: ordinary Three.js objects, using shared version 0.185.1.
- `register(id, object, label?)`: make a stable meaningful edit target. Unparented objects join
  root.
- `assetUrl(path)`, `loadModel(path)`: resolve captured resources relative to scene source.
- `onFrame((delta, elapsed) => {})`: seconds; returns an unsubscribe function.
- `onClick(object, (point) => {})`: world-space point; runs in Explore; returns an unsubscribe.
- `onDispose(callback)`, `invalidate()`: release external resources and request rendering.

Setup may return a cleanup function. Register a group as an edit target and animate its children
when human placement must persist. Preserve stable IDs across revisions. Avoid registering each
instance in large repeated geometry; use InstancedMesh, LOD and code-managed streaming as needed.
Code can construct whole environments, shaders and interactions without a scene DSL. Do not import
`scene.json`; keep code configuration elsewhere so human edits do not rebuild the scene.

Imports of `three` and `three/addons/*` use the local pinned runtime. Extra browser packages need a
matching `package.json` and frozen `pnpm-lock.yaml`; lifecycle scripts are disabled during install.
Code is trusted local browser code, not an isolation boundary.

Model files supported by loaders: GLB/glTF, OBJ with MTL/textures, FBX, STL, PLY, 3MF, USD/USDZ.
Prefer GLB when available; preserve original files and companion paths. Draco, Meshopt and KTX2 are
supported locally. Models from Meshy/Tripo can be imported normally; no generation API is needed.
The UI normalizes imported models to two units and a grounded pivot. Loader fidelity varies; verify
materials and animation. There is no Blender conversion, CAD editor or complete scene export.

## Collaborate and verify

Ordinary conversation edits go to working source. The browser observes stable source saves and
creates agent revisions. For an app-submitted request, read the provided context, including its
scene document, camera, object bounds, annotations and screenshot. Edit only its candidate source
directory, inspect the supplied read-only preview URL, and POST `{ "label": "..." }` to the supplied
publish URL. Do not also edit working source for that request. Publish is idempotent; a 409 means
reconcile with the user's newer work rather than overwrite it. Report a failed candidate with POST
`{ "message": "..." }` to the request's `/error` endpoint.

Verify the actual displayed revision, object transforms, materials and interactions. Build success
alone does not prove a valid rendered scene. Build errors retain the last valid head; runtime/load
errors retain the previous displayed scene and disable editing until recovery. Fix source or undo.
Read-only `window.__sceneEditor.state()` reports displayed revision, camera, object bounds and GPU
resource counters. Check framing from useful viewpoints and use Explore for click/animation
behavior.

Explain relevant controls briefly: drag the object, choose Rotate/Resize or the lift handle,
double-click to focus, zoom or Show whole scene, and pin a place for feedback. Keep the user in the
immersive view; avoid exposing implementation choices as required setup steps. Match their language.
