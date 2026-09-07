# Video and 3D use cases

Non-canonical research; proposals and findings may be outdated.

Research date: September 6, 2026. This is a design digest, not a tested implementation or protocol
spec.

## Video

A user selects a title or marks a time range, submits feedback, and sees the agent's changes in the
same app. The request should retain the submitted source revision and target context even if the
user continues playing or selecting other content.

HyperFrames offers an HTML composition runtime, preview, rendering, and optional editing tools.
Earlier research favored adapting Studio. The current direction is to use only the engine
capabilities the app needs; see [Video engine boundaries](video-engines.md).

Validate changed timing against surrounding scenes and media. A visual update is not proof of
persistence. Direct source changes must produce an identifiable revision, and exports must identify
the revision they render.

## 3D scene assembly

A user imports a model, selects it with a reference object, and asks the agent to reposition it. The
agent needs transforms, bounds, coordinate conventions, units, and the relevant scene revision.

Three.js is a candidate browser runtime. Blender is an optional external modeling or rendering tool.
Meshy and similar services supply assets; they should not own the app's scene state. No 3D engine
has been selected.

Keep an imported asset separate from its scene instances. Store model resources locally with stable
references; provider download URLs may expire. GLB is a useful exchange format, but it does not
preserve every Blender feature or app behavior. Do not assume lossless whole-scene round trips.

## Shared questions

- What work and revision did the user refer to?
- Which references remain valid after changes?
- What happens if the user edits while an agent is working?
- Can a retried request avoid applying the change twice?
- Is the result accepted, persisted, previewed, or exported?

The protocol should share these collaboration concepts without standardizing timelines, scene
graphs, materials, or domain-specific actions. Test a small video workflow first and then a 3D
workflow.

## Sources

- [HyperFrames SDK](https://hyperframes.heygen.com/packages/sdk)
- [HyperFrames HTML contract](https://hyperframes.heygen.com/reference/html-schema)
- [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)
- [Three.js TransformControls](https://threejs.org/docs/pages/TransformControls.html)
- [glTF specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
- [Blender glTF support](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html)
- [Meshy model API](https://docs.meshy.ai/en/api/text-to-3d)
