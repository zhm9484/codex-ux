import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type {
  Annotation,
  CameraView,
  Placement,
  SceneAnchor,
  SceneProject,
  Vec3,
} from '@codex-ux/scene-domain';
import { Stage, place, placementOf, stageKey } from './stage';

export type Tool = 'move' | 'rotate' | 'scale';
interface Callbacks {
  select: (id: string | null, label: string) => void;
  commit: (id: string, placement: Placement, label: string) => void;
  interaction: (active: boolean) => void;
  anchor: (anchor: SceneAnchor) => void;
  note: (annotation: Annotation) => void;
  error: (message: string) => void;
}
interface Gesture {
  pointer: number;
  x: number;
  y: number;
  id: string | null;
  before: Placement | null;
  start: THREE.Vector3;
  plane: THREE.Plane;
  moved: boolean;
  lift: boolean;
  captured: boolean;
}
const vector = () => new THREE.Vector3();
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class SceneViewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.01, 10000);
  readonly controls: OrbitControls;
  readonly canvas: HTMLCanvasElement;
  private host: HTMLElement;
  private markers: HTMLElement;
  private callbacks: Callbacks;
  private stage: Stage | null = null;
  private project: SceneProject | null = null;
  private key = '';
  private generation = 0;
  private raf = 0;
  private lastFrame = 0;
  private started = performance.now();
  private disposed = false;
  private resize: ResizeObserver;
  private selected: string | null = null;
  private gesture: Gesture | null = null;
  private ray = new THREE.Raycaster();
  private overlay = new THREE.Scene();
  private selectionBox = new THREE.Box3Helper(new THREE.Box3(), '#9b8877');
  private selectionMaterial = new THREE.LineBasicMaterial({
    color: '#9b8877',
    transparent: true,
    opacity: 0.65,
    depthTest: false,
  });
  private noteButtons = new Map<string, HTMLButtonElement>();
  private keys = new Set<string>();
  private tween: { started: number; from: CameraView; to: CameraView } | null = null;
  tool: Tool = 'move';
  preview = false;
  annotating = false;
  editable = true;
  constructor(host: HTMLElement, markers: HTMLElement, callbacks: Callbacks) {
    this.host = host;
    this.markers = markers;
    this.callbacks = callbacks;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.info.autoReset = false;
    this.canvas = this.renderer.domElement;
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute(
      'aria-label',
      '3D scene. Drag empty space to orbit, scroll to zoom. Select an object to move it.',
    );
    this.canvas.setAttribute('role', 'application');
    host.append(this.canvas);
    this.canvas.addEventListener('pointerdown', this.down, true);
    this.canvas.addEventListener('pointermove', this.move, true);
    this.canvas.addEventListener('pointerup', this.up, true);
    this.canvas.addEventListener('pointercancel', this.cancel, true);
    this.canvas.addEventListener('lostpointercapture', this.lostCapture);
    this.canvas.addEventListener('dblclick', this.doubleClick);
    this.canvas.addEventListener('contextmenu', this.contextMenu);
    this.canvas.addEventListener('keydown', this.keydown);
    this.canvas.addEventListener('keyup', this.keyup);
    this.canvas.addEventListener('blur', this.blur);
    this.canvas.addEventListener('webglcontextlost', this.contextLost);
    this.camera.position.set(8, 6, 11);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.set(0, 1, 0);
    this.controls.enableDamping = !reducedMotion();
    this.controls.dampingFactor = 0.13;
    this.controls.minDistance = 0.05;
    this.controls.maxDistance = 1e8;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.addEventListener('change', this.invalidate);
    this.controls.addEventListener('start', this.controlStart);
    for (const material of Array.isArray(this.selectionBox.material)
      ? this.selectionBox.material
      : [this.selectionBox.material])
      material.dispose();
    this.selectionBox.material = this.selectionMaterial;
    this.overlay.add(this.selectionBox);
    this.selectionBox.visible = false;
    this.resize = new ResizeObserver(() => {
      this.camera.aspect = Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(host.clientWidth, host.clientHeight);
      this.invalidate();
    });
    this.resize.observe(host);
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('blur', this.blur);
  }
  private controlStart = () => {
    this.tween = null;
  };
  private contextMenu = (event: Event) => event.preventDefault();
  private contextLost = (event: Event) => {
    if (this.disposed) return;
    event.preventDefault();
    this.callbacks.error(
      'The graphics context was lost. Your saved scene is safe; reload to reconnect to the GPU.',
    );
    this.editable = false;
  };
  private visibility = () => {
    this.lastFrame = 0;
    this.keys.clear();
    this.invalidate();
  };
  private blur = () => {
    this.keys.clear();
    this.cancel();
  };
  private lostCapture = () => {
    if (this.gesture?.captured) this.cancel();
  };
  private keyup = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };
  private keydown = (event: KeyboardEvent) => {
    if (event.code === 'Escape') {
      this.cancel();
      this.select(null);
      return;
    }
    if (event.code === 'KeyF') {
      event.preventDefault();
      this.focus(this.selected);
      return;
    }
    if (this.preview && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(event.code)) {
      event.preventDefault();
      this.keys.add(event.code);
      this.invalidate();
      return;
    }
    if (this.selected && this.editable && !this.preview && event.code.startsWith('Arrow')) {
      event.preventDefault();
      const entry = this.stage?.objects.get(this.selected);
      if (!entry) return;
      const step = event.shiftKey ? 0.5 : 0.1;
      entry.object.position.x +=
        event.code === 'ArrowRight' ? step : event.code === 'ArrowLeft' ? -step : 0;
      entry.object.position.z +=
        event.code === 'ArrowDown' ? step : event.code === 'ArrowUp' ? -step : 0;
      this.callbacks.commit(this.selected, placementOf(entry.object), 'Moved object');
      this.invalidate();
    }
  };
  view(): CameraView {
    return { position: this.camera.position.toArray(), target: this.controls.target.toArray() };
  }
  inventory() {
    return this.stage?.inventory() ?? [];
  }
  screenObjects() {
    return this.inventory().map((object) => {
      const center = new THREE.Vector3()
        .fromArray(object.bounds.min)
        .add(new THREE.Vector3().fromArray(object.bounds.max))
        .multiplyScalar(0.5)
        .project(this.camera);
      return {
        ...object,
        screen: {
          x: ((center.x + 1) * this.host.clientWidth) / 2,
          y: ((1 - center.y) * this.host.clientHeight) / 2,
          visible: Math.abs(center.x) < 1 && Math.abs(center.y) < 1 && center.z < 1,
        },
      };
    });
  }
  diagnostics() {
    return {
      revisionId: this.project?.revisionId ?? null,
      selected: this.selected,
      camera: this.view(),
      objects: this.screenObjects(),
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
    };
  }
  async load(project: SceneProject) {
    const nextKey = stageKey(project);
    if (this.stage && nextKey === this.key) {
      this.cancel();
      this.stage.apply(project.document);
      this.project = project;
      this.syncMarkers();
      if (this.selected && !this.stage.objects.get(this.selected)?.object.visible)
        this.select(null);
      this.invalidate();
      return;
    }
    const generation = ++this.generation;
    const next = new Stage(project.document);
    const camera = this.view();
    try {
      await next.load(project, this.renderer, this.camera, this.invalidate);
      if (generation !== this.generation || this.disposed) {
        next.dispose();
        return;
      }
      // Compilation/runtime failure never replaces the last working stage.
      this.cancel();
      const first = !this.stage;
      this.stage?.dispose();
      this.stage = next;
      this.project = project;
      this.key = nextKey;
      this.camera.position.fromArray(camera.position);
      this.controls.target.fromArray(camera.target);
      this.controls.update();
      this.syncMarkers();
      if (this.selected && !next.objects.get(this.selected)?.object.visible) this.select(null);
      else if (this.selected)
        this.callbacks.select(this.selected, next.objects.get(this.selected)!.label);
      if (first) this.focus(null, false);
      this.invalidate();
      if (next.warnings.length) this.callbacks.error([...new Set(next.warnings)].join(' '));
    } catch (error) {
      next.dispose();
      this.camera.position.fromArray(camera.position);
      this.controls.target.fromArray(camera.target);
      this.controls.update();
      throw error;
    }
  }
  setPreview(preview: boolean) {
    this.cancel();
    this.preview = preview;
    this.keys.clear();
    if (preview) this.select(null);
    this.invalidate();
  }
  select(id: string | null) {
    this.selected = id;
    this.callbacks.select(id, id ? (this.stage?.objects.get(id)?.label ?? 'Object') : '');
    this.invalidate();
  }
  private cast(x: number, y: number) {
    const bounds = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(
      new THREE.Vector2(
        ((x - bounds.left) / bounds.width) * 2 - 1,
        (-(y - bounds.top) / bounds.height) * 2 + 1,
      ),
      this.camera,
    );
  }
  private hit(x: number, y: number) {
    this.cast(x, y);
    this.stage?.scene.updateMatrixWorld(true);
    const objects = [...(this.stage?.objects.values() ?? [])]
      .filter(({ object }) => object.visible)
      .map(({ object }) => object);
    return this.ray.intersectObjects(objects, true).find((hit) => {
      for (let node: THREE.Object3D | null = hit.object; node; node = node.parent)
        if (!node.visible) return false;
      return true;
    });
  }
  insertionPoint(x?: number, y?: number): Vec3 {
    if (x !== undefined && y !== undefined) {
      const hit = this.hit(x, y);
      if (hit) return hit.point.toArray();
      const point = this.ray.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
        vector(),
      );
      if (point && point.distanceTo(this.camera.position) < 10000) return point.toArray();
    }
    return [this.controls.target.x, 0, this.controls.target.z];
  }
  anchorForSelection(): SceneAnchor | null {
    if (!this.project || !this.selected) return null;
    const object = this.stage?.objects.get(this.selected)?.object;
    if (!object) return null;
    const center = new THREE.Box3().setFromObject(object).getCenter(vector());
    return {
      objectId: this.selected,
      point: object.worldToLocal(center).toArray(),
      camera: this.view(),
      revisionId: this.project.revisionId,
    };
  }
  private makeAnchor(hit: THREE.Intersection | undefined, x: number, y: number): SceneAnchor {
    const id = hit ? (this.stage?.objectAt(hit.object) ?? null) : null;
    const object = id ? this.stage?.objects.get(id)?.object : null;
    return {
      objectId: id,
      point:
        object && hit
          ? object.worldToLocal(hit.point.clone()).toArray()
          : this.insertionPoint(x, y),
      camera: this.view(),
      revisionId: this.project!.revisionId,
    };
  }
  private down = (event: PointerEvent) => {
    if (event.button !== 0 || !this.stage || !this.project) return;
    if (!event.isPrimary) {
      this.cancel();
      return;
    }
    this.tween = null;
    this.canvas.focus({ preventScroll: true });
    const hit = this.hit(event.clientX, event.clientY);
    const id = hit ? this.stage.objectAt(hit.object) : null;
    if (this.annotating && !this.preview) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.callbacks.anchor(this.makeAnchor(hit, event.clientX, event.clientY));
      return;
    }
    const object = id ? this.stage.objects.get(id)?.object : null;
    const captured = !!object && !this.preview;
    if (captured) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.select(id);
      this.controls.enabled = false;
      this.canvas.setPointerCapture(event.pointerId);
    }
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(hit?.point.y ?? 0));
    this.gesture = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      id,
      before: object ? placementOf(object) : null,
      start: hit?.point.clone() ?? vector(),
      plane,
      moved: false,
      lift: false,
      captured,
    };
  };
  startLift(event: PointerEvent) {
    if (!this.selected || !this.editable) return;
    const object = this.stage?.objects.get(this.selected)?.object;
    if (!object) return;
    this.cancel();
    this.tween = null;
    this.gesture = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      id: this.selected,
      before: placementOf(object),
      start: vector(),
      plane: new THREE.Plane(),
      moved: false,
      lift: true,
      captured: true,
    };
    this.controls.enabled = false;
    this.canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  private move = (event: PointerEvent) => {
    const gesture = this.gesture;
    if (!gesture || gesture.pointer !== event.pointerId) return;
    const dx = event.clientX - gesture.x,
      dy = event.clientY - gesture.y;
    if (Math.hypot(dx, dy) > 4 && !gesture.moved) {
      gesture.moved = true;
      if (gesture.captured && this.editable) this.callbacks.interaction(true);
    }
    if (!gesture.captured || !gesture.id || !gesture.before || !gesture.moved || !this.editable)
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const object = this.stage?.objects.get(gesture.id)?.object;
    if (!object) return;
    if (gesture.lift) {
      const distance = this.camera.position.distanceTo(this.controls.target);
      object.position.y = gesture.before.position[1] - (dy * distance) / this.host.clientHeight;
    } else if (this.tool === 'move') {
      this.cast(event.clientX, event.clientY);
      const point = this.ray.ray.intersectPlane(gesture.plane, vector());
      if (point) {
        const delta = point.sub(gesture.start);
        const parent = object.parent;
        if (parent) {
          const origin = parent.worldToLocal(vector());
          delta.copy(parent.worldToLocal(delta.clone()).sub(origin));
        }
        object.position.fromArray(gesture.before.position).add(delta);
      }
    } else if (this.tool === 'rotate') object.rotation.y = gesture.before.rotation[1] + dx * 0.012;
    else {
      const multiplier = Math.exp((dx - dy) / 180);
      const minScale = Math.min(...gesture.before.scale),
        maxScale = Math.max(...gesture.before.scale);
      object.scale
        .fromArray(gesture.before.scale)
        .multiplyScalar(THREE.MathUtils.clamp(multiplier, 0.01 / minScale, 10000 / maxScale));
    }
    object.updateMatrixWorld(true);
    this.invalidate();
  };
  private up = (event: PointerEvent) => {
    const gesture = this.gesture;
    if (!gesture || gesture.pointer !== event.pointerId) return;
    this.gesture = null;
    this.controls.enabled = true;
    if (this.canvas.hasPointerCapture(event.pointerId))
      this.canvas.releasePointerCapture(event.pointerId);
    if (gesture.captured) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    const entry = gesture.id ? this.stage?.objects.get(gesture.id) : null;
    if (gesture.captured && gesture.moved && entry && this.editable) {
      this.callbacks.commit(
        gesture.id!,
        placementOf(entry.object),
        gesture.lift
          ? 'Raised object'
          : this.tool === 'move'
            ? 'Moved object'
            : this.tool === 'rotate'
              ? 'Rotated object'
              : 'Resized object',
      );
    } else if (!gesture.moved) {
      if (!gesture.id && !this.preview) this.select(null);
      if (this.preview) {
        const hit = this.hit(event.clientX, event.clientY);
        for (
          let object: THREE.Object3D | null = hit?.object ?? null;
          object;
          object = object.parent
        ) {
          const callback = this.stage?.clicks.get(object);
          if (callback && hit) {
            try {
              callback(hit.point);
            } catch (error) {
              this.callbacks.error(
                error instanceof Error ? error.message : 'Scene interaction failed.',
              );
            }
            break;
          }
        }
        this.invalidate();
      }
    }
    this.callbacks.interaction(false);
  };
  cancel = () => {
    const gesture = this.gesture;
    this.gesture = null;
    if (!gesture) return;
    const object = gesture.id ? this.stage?.objects.get(gesture.id)?.object : null;
    if (object && gesture.before && gesture.captured) place(object, gesture.before);
    this.controls.enabled = true;
    if (this.canvas.hasPointerCapture(gesture.pointer))
      this.canvas.releasePointerCapture(gesture.pointer);
    this.callbacks.interaction(false);
    this.invalidate();
  };
  private doubleClick = (event: MouseEvent) => {
    const hit = this.hit(event.clientX, event.clientY);
    const id = hit ? this.stage?.objectAt(hit.object) : null;
    if (id) this.focus(id);
  };
  focus(id: string | null, animate = true) {
    if (!this.stage) return;
    const object = id ? this.stage.objects.get(id)?.object : null;
    const box = object ? new THREE.Box3().setFromObject(object) : this.stage.bounds();
    if (box.isEmpty())
      box.setFromCenterAndSize(new THREE.Vector3(0, 1, 0), new THREE.Vector3(5, 3, 5));
    const center = box.getCenter(vector());
    const radius = Math.max(0.05, box.getSize(vector()).length() * 0.5);
    const fov = Math.min(
      THREE.MathUtils.degToRad(this.camera.fov),
      2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * this.camera.aspect),
    );
    const distance = (radius / Math.sin(fov / 2)) * 1.25;
    const direction = object
      ? this.camera.position.clone().sub(this.controls.target).normalize()
      : new THREE.Vector3(0.85, 0.65, 1.25).normalize();
    const to: CameraView = {
      target: center.toArray(),
      position: center.clone().addScaledVector(direction, distance).toArray(),
    };
    this.goTo(to, animate);
  }
  goTo(to: CameraView, animate = true) {
    if (animate && !reducedMotion())
      this.tween = { from: this.view(), to, started: performance.now() };
    else {
      this.camera.position.fromArray(to.position);
      this.controls.target.fromArray(to.target);
      this.controls.update();
    }
    this.invalidate();
  }
  zoom(direction: 'in' | 'out') {
    const offset = this.camera.position
      .clone()
      .sub(this.controls.target)
      .multiplyScalar(direction === 'in' ? 0.72 : 1.4);
    this.goTo({
      position: offset.add(this.controls.target).toArray(),
      target: this.controls.target.toArray(),
    });
  }
  private syncMarkers() {
    for (const button of this.noteButtons.values()) button.remove();
    this.noteButtons.clear();
    this.project?.document.annotations.forEach((note, index) => {
      const button = document.createElement('button');
      button.className = 'scene-pin';
      button.textContent = String(index + 1);
      button.setAttribute('aria-label', `Annotation: ${note.text}`);
      button.title = note.text;
      button.onclick = () => {
        this.callbacks.note(note);
        this.goTo(note.anchor.camera);
        if (note.anchor.objectId && this.stage?.objects.has(note.anchor.objectId))
          this.select(note.anchor.objectId);
      };
      this.markers.append(button);
      this.noteButtons.set(note.id, button);
    });
  }
  private updateMarkers() {
    for (const note of this.project?.document.annotations ?? []) {
      const button = this.noteButtons.get(note.id);
      if (!button) continue;
      const object = note.anchor.objectId
        ? this.stage?.objects.get(note.anchor.objectId)?.object
        : null;
      if ((note.anchor.objectId && (!object || !object.visible)) || this.preview) {
        button.hidden = true;
        continue;
      }
      const point = new THREE.Vector3().fromArray(note.anchor.point);
      if (object) object.localToWorld(point);
      point.project(this.camera);
      button.hidden = point.z > 1 || point.z < -1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1;
      button.style.transform = `translate(${((point.x + 1) * this.host.clientWidth) / 2}px, ${((1 - point.y) * this.host.clientHeight) / 2}px) translate(-50%, -100%)`;
    }
  }
  capture() {
    if (!this.stage) return undefined;
    this.renderer.render(this.stage.scene, this.camera);
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(1000, this.canvas.width);
    canvas.height = Math.round((canvas.width * this.canvas.height) / this.canvas.width);
    canvas.getContext('2d')?.drawImage(this.canvas, 0, 0, canvas.width, canvas.height);
    this.invalidate();
    return canvas.toDataURL('image/png');
  }
  invalidate = () => {
    if (!this.raf && !this.disposed && !document.hidden)
      this.raf = requestAnimationFrame(this.render);
  };
  private render = (now: number) => {
    this.raf = 0;
    if (this.disposed || !this.stage || document.hidden) return;
    const delta = this.lastFrame ? Math.min(0.05, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    if (this.tween) {
      const t = Math.min(1, (now - this.tween.started) / 550),
        eased = 1 - (1 - t) ** 3;
      this.camera.position.lerpVectors(
        vector().fromArray(this.tween.from.position),
        vector().fromArray(this.tween.to.position),
        eased,
      );
      this.controls.target.lerpVectors(
        vector().fromArray(this.tween.from.target),
        vector().fromArray(this.tween.to.target),
        eased,
      );
      if (t === 1) this.tween = null;
    }
    if (this.preview && this.keys.size) {
      const forward = this.camera.getWorldDirection(vector()),
        right = vector().crossVectors(forward, this.camera.up).normalize();
      const movement = vector();
      if (this.keys.has('KeyW')) movement.add(forward);
      if (this.keys.has('KeyS')) movement.sub(forward);
      if (this.keys.has('KeyD')) movement.add(right);
      if (this.keys.has('KeyA')) movement.sub(right);
      if (this.keys.has('KeyE')) movement.y += 1;
      if (this.keys.has('KeyQ')) movement.y -= 1;
      movement.normalize().multiplyScalar(delta * Math.max(1, this.controls.getDistance() * 0.65));
      this.camera.position.add(movement);
      this.controls.target.add(movement);
    }
    this.controls.update(delta);
    const distance = this.controls.getDistance();
    const near = Math.max(0.005, distance / 10000),
      far = Math.max(1000, distance * 100);
    if (Math.abs(this.camera.near - near) > 0.001 || Math.abs(this.camera.far - far) > 1) {
      this.camera.near = near;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
    this.stage.animate(delta, (now - this.started) / 1000, this.preview, this.callbacks.error);
    const object = this.selected ? this.stage.objects.get(this.selected)?.object : null;
    this.selectionBox.visible = !!object?.visible && !this.preview;
    if (object) this.selectionBox.box.setFromObject(object).expandByScalar(0.025);
    this.renderer.info.reset();
    this.renderer.autoClear = true;
    this.renderer.render(this.stage.scene, this.camera);
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.overlay, this.camera);
    this.renderer.autoClear = true;
    this.updateMarkers();
    if (
      this.tween ||
      this.keys.size ||
      this.stage.animated ||
      (this.preview && this.stage.hasClips)
    )
      this.invalidate();
  };
  dispose() {
    this.disposed = true;
    this.generation++;
    this.cancel();
    cancelAnimationFrame(this.raf);
    this.resize.disconnect();
    this.controls.dispose();
    this.stage?.dispose();
    this.selectionBox.geometry.dispose();
    this.selectionMaterial.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    for (const button of this.noteButtons.values()) button.remove();
    this.canvas.remove();
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('blur', this.blur);
  }
}
