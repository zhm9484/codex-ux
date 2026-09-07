# Collaboration direction

Proposed workflow, not implemented behavior. This plan may change; see
[canonical architecture](../../canonical/architecture.md) for the current system.

1. A user submits a request with references to the work they are viewing.
2. An agent reads the relevant context and source revision.
3. The agent changes app data or edits source code.
4. The app checks the base revision and presents the resulting work.

`read` and `act` are working concepts, not a finalized API. Validate stale versions, duplicate
requests, invalid references, and failed persistence. Everyday UI activity should not automatically
start an agent task.

Explore a video collaboration loop first, then use 3D scene assembly to test whether the protocol
stays general. HyperFrames and Remotion are video-engine candidates. Their Studios and editing SDKs
are optional; direct source editing remains a valid workflow.
