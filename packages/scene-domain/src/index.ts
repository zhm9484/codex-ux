import { z } from 'zod';

export const objectId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/);
export const sourcePath = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (path) =>
      !path.includes('\\') &&
      !path.includes('\0') &&
      path
        .split('/')
        .every((part) => part !== '' && part !== '.' && part !== '..' && !part.startsWith('.')),
    'Use a relative source path without hidden files or traversal.',
  );
export const vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
export type Vec3 = z.infer<typeof vec3>;
export const placementSchema = z.strictObject({
  position: vec3,
  rotation: vec3,
  scale: z.tuple([
    z.number().positive().max(1e6),
    z.number().positive().max(1e6),
    z.number().positive().max(1e6),
  ]),
});
export type Placement = z.infer<typeof placementSchema>;
export const identityPlacement = (): Placement => ({
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
});
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const primitiveShape = z.enum(['box', 'sphere', 'cylinder', 'torus']);
export const modelExtensions = [
  'glb',
  'gltf',
  'obj',
  'fbx',
  'stl',
  'ply',
  '3mf',
  'usdz',
  'usd',
  'usda',
  'usdc',
] as const;
export function isModel(path: string) {
  return modelExtensions.some((extension) => path.toLowerCase().endsWith(`.${extension}`));
}
export const sceneObjectSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    id: objectId,
    label: z.string().min(1).max(100),
    kind: z.literal('primitive'),
    shape: primitiveShape,
    color,
  }),
  z.strictObject({
    id: objectId,
    label: z.string().min(1).max(100),
    kind: z.literal('model'),
    path: sourcePath.refine(isModel, 'Unsupported model format.'),
    normalize: z.boolean().default(true),
  }),
]);
export type SceneObject = z.infer<typeof sceneObjectSchema>;
export const cameraSchema = z.strictObject({ position: vec3, target: vec3 });
export type CameraView = z.infer<typeof cameraSchema>;
export const anchorSchema = z.strictObject({
  objectId: objectId.nullable(),
  point: vec3,
  camera: cameraSchema,
  revisionId: z.string().uuid(),
});
export type SceneAnchor = z.infer<typeof anchorSchema>;
export const annotationSchema = z.strictObject({
  id: z.string().uuid(),
  text: z.string().trim().min(1).max(4000),
  anchor: anchorSchema,
});
export type Annotation = z.infer<typeof annotationSchema>;
export const sceneSchema = z
  .strictObject({
    version: z.literal(1),
    entry: sourcePath.regex(/\.[cm]?[jt]sx?$/).nullable(),
    environment: z.strictObject({ background: color, ground: z.boolean(), grid: z.boolean() }),
    objects: z.array(sceneObjectSchema).max(10000),
    placements: z.record(objectId, placementSchema),
    hidden: z.array(objectId).max(10000),
    annotations: z.array(annotationSchema).max(1000),
  })
  .refine(
    (doc) => new Set(doc.objects.map((object) => object.id)).size === doc.objects.length,
    'Object IDs must be unique.',
  )
  .refine(
    (doc) => new Set(doc.annotations.map((note) => note.id)).size === doc.annotations.length,
    'Annotation IDs must be unique.',
  );
export type SceneDocument = z.infer<typeof sceneSchema>;

export const operationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('transform'), objectId, placement: placementSchema }),
  z.strictObject({ type: z.literal('add'), object: sceneObjectSchema, placement: placementSchema }),
  z.strictObject({ type: z.literal('remove'), objectId }),
  z.strictObject({ type: z.literal('annotate'), annotation: annotationSchema }),
  z.strictObject({ type: z.literal('remove-annotation'), id: z.string().uuid() }),
]);
export type SceneOperation = z.infer<typeof operationSchema>;
export function applyOperation(document: SceneDocument, operation: SceneOperation): SceneDocument {
  const doc = structuredClone(document);
  switch (operation.type) {
    case 'transform':
      doc.placements[operation.objectId] = operation.placement;
      break;
    case 'add':
      if (doc.objects.some((object) => object.id === operation.object.id))
        throw new Error('This object already exists.');
      doc.objects.push(operation.object);
      doc.placements[operation.object.id] = operation.placement;
      break;
    case 'remove':
      doc.objects = doc.objects.filter((object) => object.id !== operation.objectId);
      if (!doc.hidden.includes(operation.objectId)) doc.hidden.push(operation.objectId);
      break;
    case 'annotate':
      doc.annotations.push(operation.annotation);
      break;
    case 'remove-annotation':
      doc.annotations = doc.annotations.filter((note) => note.id !== operation.id);
      break;
  }
  return sceneSchema.parse(doc);
}

export interface SourceFile {
  hash: string;
  size: number;
}
export interface SceneSnapshot {
  document: SceneDocument;
  files: Record<string, SourceFile>;
  codeHash: string;
}
export interface SceneRevision {
  id: string;
  parentId: string | null;
  label: string;
  author: 'user' | 'agent';
  createdAt: string;
  snapshot: SceneSnapshot;
}
export interface SceneProject {
  workspaceId: string;
  revisionId: string;
  document: SceneDocument;
  history: Omit<SceneRevision, 'snapshot'>[];
  canUndo: boolean;
  canRedo: boolean;
  source: {
    directory: string;
    codeHash: string;
    bundleUrl: string | null;
    baseUrl: string;
    error: string | null;
    pending: boolean;
  };
}
export interface VisibleObject {
  id: string;
  label: string;
  placement: Placement;
  bounds: { min: Vec3; max: Vec3 };
}
export const feedbackSchema = z.strictObject({
  text: z.string().trim().min(1).max(4000),
  anchor: anchorSchema.nullable(),
  camera: cameraSchema,
  objects: z
    .array(
      z.strictObject({
        id: objectId,
        label: z.string().max(100),
        placement: placementSchema,
        bounds: z.strictObject({ min: vec3, max: vec3 }),
      }),
    )
    .max(10000),
  annotationIds: z.array(z.string().uuid()).max(1000),
  attachmentIds: z.array(z.string().uuid()).max(20).optional(),
});
export type SceneFeedback = z.infer<typeof feedbackSchema>;
