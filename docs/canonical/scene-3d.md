# Scene

Scene (`scene-3d`) is a local Three.js scene editor for people and agents. Its full-window viewport,
small contextual toolbar and feedback composer avoid a permanent object tree or inspector. Open
`/apps/scene-3d/` to create or select a shared Workspace. It uses the same page-owned connection and
workspace switching rules as Video Editor; the apps keep independent domain state.

## Working in a scene

Click an object and drag to move it across its horizontal plane. Rotate and Resize change the
meaning of the same drag; the lift handle changes height. The camera stays still during object
transforms. Escape cancels a drag; arrow keys nudge the selection. Click empty space and drag to
orbit, use wheel/pinch or zoom buttons, and double-click an object or use Focus to approach it. Show
whole scene fits visible registered objects; search offers quick focus without a scene tree. Camera
framing animates and respects reduced motion. Explore hides editing controls, enables WASDQE
movement and plays imported animation clips; it is not a physics or first-person collision system.
Module frame callbacks can also run outside Explore.

The Add menu supplies four primitives and imports models, multiple companion files or a folder.
Dropping files/folders is equivalent. Original model and texture bytes are retained with relative
paths. Imported objects initially fit two scene units, with a grounded pivot. Loaders support GLB,
glTF, OBJ/MTL, FBX, STL, PLY, 3MF and USD/USDZ through Three.js 0.185.1. GLTF uses local Draco,
Meshopt and KTX2 support. Format-specific extensions, materials and animation fidelity depend on
those loaders; this is not lossless interchange. Prefer GLB for portable textured assets, including
files produced by Meshy or Tripo. There are no generation-service integrations, Blender conversion,
CAD editing, general ZIP importer, full-scene file export or automatic asset optimization.

Pin a surface and save a note or send a request to the connected Codex task. A note records the
revision, camera and object-local hit point (world point for empty ground), so it follows later
object movement. Hidden or missing objects hide their pins without deleting the notes. History can
restore earlier saved source, placements and annotations. Screenshot saves the rendered view.

## Source and runtime contract

The context endpoint supplies the working source directory, normally `files/scene/` within the
Workspace. `scene.json` version 1 declares `entry` (a relative JS/TS module or null), `environment`
(background hex color, ground and grid flags), primitive/model `objects`, `placements`, `hidden` IDs
and `annotations`. Its schema is [scene-domain](../../packages/scene-domain/src/index.ts). Placement
is local position, XYZ Euler rotation in radians, and positive XYZ scale. Source-created objects
need not appear in the manifest. The entry exports a default setup function:

```ts
export default function setup({ THREE, register, onFrame }) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: '#a5b6a1' }),
  );
  mesh.position.y = 0.5;
  register('garden-pavilion', mesh, 'Garden pavilion');
  // Return a cleanup function, or register cleanup with onDispose when needed.
}
```

The function may be async. Its context exposes `THREE`, `scene`, `root`, `camera`,
`register(id, object, label?)`, `assetUrl(relativePath)`, `loadModel(relativePath)`,
`onFrame((deltaSeconds, elapsedSeconds) => {})`, `onClick(object, (worldPoint) => {})`,
`onDispose(callback)` and `invalidate()`. The latter schedules a frame after an external update.
`onFrame` and `onClick` return unsubscribers. Click callbacks run in Explore. Registration uses
stable unique IDs and preserves existing parentage; unparented objects join `root`. Keep IDs stable
across source updates. A human placement overrides that object's initial local transform; a hidden
ID stays hidden after regeneration. Use a child for animated geometry under a registered placement
root to avoid animation overwriting user transforms. Do not import `scene.json` into code: it is
editor state; keep code parameters in another module/JSON file.

Ordinary Three.js geometry, materials, shaders, instancing, LOD, procedural generation and imported
assets can coexist. Register meaningful edit targets, not every blade of grass. Code is compiled
with esbuild into an immutable browser ESM bundle. `three` and `three/addons/*` resolve to the
shared local 0.185.1 runtime, preventing duplicate Three.js instances. Extra browser dependencies
require `package.json` and `pnpm-lock.yaml`; preparation uses frozen pnpm installation with
lifecycle scripts disabled. This is trusted local code with same-origin access, not a sandbox.
Synchronous infinite loops cannot be recovered by the renderer.

## Revisions, failures and performance

The backend observes source on context reads; the browser polls every 1.8 seconds, pausing while
hidden or interacting. Two stable observations at least 650 ms apart precede capture and build.
Invalid JSON, missing declared models or build failures keep the last valid head and block edits
that could overwrite pending source. An unchanged failed source is not rebuilt on every poll.
Runtime/model-load failure retains the displayed scene; editing is disabled until a matching valid
revision loads. Fix the source or undo the failed saved version. Errors are reported in the UI.

Human operations use optimistic base revisions and idempotency IDs. SQLite owns head, undo/redo,
history and requests; immutable SHA-256 blobs own captured source/assets. Only changed working files
are checked out. A placement or note edit does not rebuild code, reload models or rewrite unchanged
source assets. Prepared source is separate from working source. Renderer stages a new runtime before
replacing the old one and disposes old geometry, materials, textures and callbacks. Static views
render on demand, with damping and explicit animation callbacks scheduling frames; pixel ratio is
capped at 1.75. Read-only `window.__sceneEditor.state()` exposes revision, camera, registered bounds
and renderer counters for verification.

Source snapshots allow at most 10,000 files and 1 GB, without symlinks or hidden/build directories.
UI imports allow 100 MB per file and 512 MB/1,000 files per batch. These are storage limits, not GPU
capacity guarantees. Large worlds need appropriate instancing, LOD, resource budgets and code-owned
streaming; the app does not add automatic world partitioning or promise a fixed frame rate.

Requests capture the exact revision, target session, scene document, selected notes, camera, visible
object transforms/bounds and optional PNG. The agent edits a materialized candidate, checks its
read-only preview and publishes once through the supplied endpoint. Publication checks that both the
current head and working source still match the request base, then creates an undoable agent
revision. A 409 requires reconciliation. Delivery-unknown requests are not retried automatically.
See [Local API](local-api.md) and the [Scene skill](../../skills/codex-ux-scene-3d/SKILL.md).
