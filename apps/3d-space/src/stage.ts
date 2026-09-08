import * as THREE from 'three';
import type { Placement, SceneDocument, SceneProject, VisibleObject } from '@codex-ux/scene-domain';
import { objectId, identityPlacement } from '@codex-ux/scene-domain';
import { disposeObject, loadModel } from './models';

export interface SceneModuleContext {
  THREE: typeof THREE;
  scene: THREE.Scene;
  root: THREE.Group;
  camera: THREE.PerspectiveCamera;
  register: (id: string, object: THREE.Object3D, label?: string) => THREE.Object3D;
  assetUrl: (path: string) => string;
  loadModel: (path: string) => Promise<THREE.Object3D>;
  onFrame: (callback: (delta: number, elapsed: number) => void) => () => void;
  onClick: (object: THREE.Object3D, callback: (point: THREE.Vector3) => void) => () => void;
  onDispose: (callback: () => void) => void;
  invalidate: () => void;
}
export interface RegisteredObject {
  object: THREE.Object3D;
  label: string;
  original: Placement;
}
export const placementOf = (object: THREE.Object3D): Placement => ({
  position: object.position.toArray(),
  rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
  scale: object.scale.toArray(),
});
export function place(object: THREE.Object3D, placement: Placement) {
  object.position.fromArray(placement.position);
  object.rotation.set(...placement.rotation);
  object.scale.fromArray(placement.scale);
  object.updateMatrixWorld(true);
}
export function stageKey(project: SceneProject) {
  return JSON.stringify([
    project.source.codeHash,
    project.document.objects,
    project.document.environment,
  ]);
}

export class Stage {
  readonly scene = new THREE.Scene();
  readonly root = new THREE.Group();
  readonly objects = new Map<string, RegisteredObject>();
  readonly frames = new Set<(delta: number, elapsed: number) => void>();
  readonly clicks = new Map<THREE.Object3D, (point: THREE.Vector3) => void>();
  readonly warnings: string[] = [];
  private cleanups: (() => void)[] = [];
  private disposed = false;
  private mixers: THREE.AnimationMixer[] = [];
  private resources = new Set<THREE.Object3D>();
  private sunlight: THREE.DirectionalLight;
  constructor(document: SceneDocument) {
    this.scene.background = new THREE.Color(document.environment.background);
    this.scene.add(this.root);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#c3bcae', 2.3));
    this.sunlight = new THREE.DirectionalLight('#fff5e8', 3.4);
    this.sunlight.position.set(8, 14, 8);
    this.sunlight.castShadow = true;
    this.sunlight.shadow.mapSize.set(2048, 2048);
    this.sunlight.shadow.normalBias = 0.025;
    this.sunlight.shadow.bias = -0.0001;
    this.sunlight.shadow.camera.left = -12;
    this.sunlight.shadow.camera.right = 12;
    this.sunlight.shadow.camera.top = 12;
    this.sunlight.shadow.camera.bottom = -12;
    this.sunlight.shadow.camera.far = 100;
    this.scene.add(this.sunlight, this.sunlight.target);
    if (document.environment.ground) {
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(20000, 20000),
        new THREE.MeshStandardMaterial({ color: document.environment.background, roughness: 0.9 }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.015;
      ground.receiveShadow = true;
      this.scene.add(ground);
    }
    if (document.environment.grid) {
      const grid = new THREE.GridHelper(200, 200, '#bfbcb7', '#d8d5ce');
      grid.position.y = 0.002;
      this.scene.add(grid);
    }
  }
  register = (id: string, object: THREE.Object3D, label = object.name || 'Object') => {
    objectId.parse(id);
    if (this.disposed) throw new Error('This scene is no longer active.');
    if (!object?.isObject3D) throw new Error('Register a Three.js Object3D.');
    if (this.objects.has(id)) throw new Error(`Duplicate scene object ID: ${id}`);
    if (!object.parent) this.root.add(object);
    object.userData.sceneId = id;
    this.objects.set(id, { object, label: label.slice(0, 100), original: placementOf(object) });
    return object;
  };
  async load(
    project: SceneProject,
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
    invalidate: () => void,
  ) {
    const assetUrl = (path: string) =>
      new URL(
        path.split('/').map(encodeURIComponent).join('/'),
        location.origin + project.source.baseUrl,
      ).href;
    const load = async (path: string) => {
      const model = await loadModel(assetUrl(path), renderer);
      if (this.disposed) {
        disposeObject(model.object);
        throw new Error('Scene loading was cancelled.');
      }
      this.resources.add(model.object);
      this.warnings.push(...model.warnings);
      if (model.animations.length) {
        const mixer = new THREE.AnimationMixer(model.object);
        mixer.clipAction(model.animations[0]!).play();
        this.mixers.push(mixer);
      }
      return model.object;
    };
    for (const item of project.document.objects) {
      let object: THREE.Object3D;
      if (item.kind === 'primitive') {
        const geometry =
          item.shape === 'sphere'
            ? new THREE.SphereGeometry(0.7, 40, 24)
            : item.shape === 'cylinder'
              ? new THREE.CylinderGeometry(0.6, 0.6, 1.3, 40)
              : item.shape === 'torus'
                ? new THREE.TorusGeometry(0.7, 0.2, 20, 64)
                : new THREE.BoxGeometry(1.25, 1.25, 1.25);
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.48 }),
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        object = new THREE.Group();
        object.add(mesh);
        mesh.position.y = -new THREE.Box3().setFromObject(mesh).min.y;
      } else {
        const model = await load(item.path);
        object = new THREE.Group();
        const normalized = new THREE.Group();
        normalized.add(model);
        object.add(normalized);
        if (item.normalize) {
          const box = new THREE.Box3().setFromObject(normalized);
          if (box.isEmpty()) throw new Error(`${item.label} has no visible geometry.`);
          const size = box.getSize(new THREE.Vector3());
          const scale = 2 / Math.max(size.x, size.y, size.z, 0.001);
          normalized.scale.setScalar(scale);
          normalized.position.set(
            -(box.min.x + box.max.x) * 0.5 * scale,
            -box.min.y * scale,
            -(box.min.z + box.max.z) * 0.5 * scale,
          );
        }
      }
      this.register(item.id, object, item.label);
    }
    if (project.source.bundleUrl) {
      const module = (await import(/* @vite-ignore */ project.source.bundleUrl)) as {
        default?: (ctx: SceneModuleContext) => unknown;
      };
      if (typeof module.default !== 'function')
        throw new Error('The scene entry must export a default createScene(ctx) function.');
      const context: SceneModuleContext = {
        THREE,
        scene: this.scene,
        root: this.root,
        camera,
        register: this.register,
        assetUrl,
        loadModel: load,
        onFrame: (callback) => {
          this.frames.add(callback);
          invalidate();
          return () => this.frames.delete(callback);
        },
        onClick: (object, callback) => {
          this.clicks.set(object, callback);
          return () => this.clicks.delete(object);
        },
        onDispose: (callback) => this.cleanups.push(callback),
        invalidate,
      };
      const cleanup = await module.default(context);
      if (typeof cleanup === 'function') this.cleanups.push(cleanup as () => void);
    }
    this.apply(project.document);
    this.fitShadow();
  }
  apply(document: SceneDocument) {
    for (const [id, entry] of this.objects) {
      place(entry.object, document.placements[id] ?? entry.original);
      entry.object.visible = !document.hidden.includes(id);
    }
    this.scene.updateMatrixWorld(true);
  }
  objectAt(object: THREE.Object3D): string | null {
    for (let node: THREE.Object3D | null = object; node; node = node.parent) {
      const id = node.userData.sceneId as unknown;
      if (typeof id === 'string' && this.objects.get(id)?.object === node) return id;
    }
    return null;
  }
  bounds() {
    const box = new THREE.Box3();
    for (const { object } of this.objects.values())
      if (object.visible) box.union(new THREE.Box3().setFromObject(object));
    return box;
  }
  private fitShadow() {
    const box = this.bounds();
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.min(100, Math.max(8, box.getSize(new THREE.Vector3()).length() * 0.75));
    this.sunlight.position.copy(center).add(new THREE.Vector3(radius, radius * 1.5, radius));
    this.sunlight.target.position.copy(center);
    const shadow = this.sunlight.shadow.camera;
    shadow.left = -radius;
    shadow.right = radius;
    shadow.top = radius;
    shadow.bottom = -radius;
    shadow.far = radius * 8;
    shadow.updateProjectionMatrix();
  }
  inventory(): VisibleObject[] {
    return [...this.objects.entries()]
      .filter(([, { object }]) => object.visible)
      .map(([id, entry]) => {
        const box = new THREE.Box3().setFromObject(entry.object);
        if (box.isEmpty())
          box.setFromCenterAndSize(
            entry.object.getWorldPosition(new THREE.Vector3()),
            new THREE.Vector3(0.1, 0.1, 0.1),
          );
        return {
          id,
          label: entry.label,
          placement: placementOf(entry.object),
          bounds: { min: box.min.toArray(), max: box.max.toArray() },
        };
      });
  }
  animate(delta: number, elapsed: number, preview: boolean, report: (message: string) => void) {
    if (preview) for (const mixer of this.mixers) mixer.update(delta);
    for (const callback of this.frames) {
      try {
        callback(delta, elapsed);
      } catch (error) {
        this.frames.delete(callback);
        report(
          `Scene animation stopped: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
  }
  get animated() {
    return this.frames.size > 0;
  }
  get hasClips() {
    return this.mixers.length > 0;
  }
  dispose() {
    this.disposed = true;
    for (const cleanup of this.cleanups) {
      try {
        cleanup();
      } catch {
        /* Continue releasing the other resources. */
      }
    }
    this.cleanups = [];
    for (const mixer of this.mixers) {
      mixer.stopAllAction();
      mixer.uncacheRoot(mixer.getRoot());
    }
    this.mixers = [];
    this.frames.clear();
    this.clicks.clear();
    // Loaded objects may have been left unattached by an asynchronous module.
    for (const object of this.resources) if (!object.parent) this.scene.add(object);
    disposeObject(this.scene);
    this.sunlight.shadow.dispose();
    this.scene.clear();
    this.objects.clear();
    this.resources.clear();
  }
}

export function primitivePlacement(point: THREE.Vector3): Placement {
  return { ...identityPlacement(), position: [point.x, Math.max(0, point.y), point.z] };
}
