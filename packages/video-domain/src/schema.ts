import { z } from 'zod';
import type { FeedbackAnchor } from '@codex-ux/protocol';

export const projectPath = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (path) =>
      !path.startsWith('/') &&
      !path.includes('\\') &&
      !path.includes('\0') &&
      !path.split('/').some((part) => !part || part === '.' || part === '..'),
    'Expected a relative project file path.',
  );
const fps = z.number().positive().max(240);
const dimension = z.number().int().min(16).max(7680);
const sourceFields = { entry: projectPath };
/** video.json describes how ordinary source files produce this video. It is not an arrangement. */
export const sourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('hyperframes'), ...sourceFields, fps: fps.default(30) }),
  z
    .strictObject({
      kind: z.literal('remotion'),
      ...sourceFields,
      exportName: z
        .string()
        .regex(/^[a-zA-Z_$][\w$]*$/)
        .default('default'),
      width: dimension,
      height: dimension,
      fps,
      durationInFrames: z.number().int().positive().max(864000),
      inputProps: z.record(z.string(), z.json()).default({}),
    })
    .refine((source) => source.durationInFrames / source.fps <= 3600, 'Video exceeds one hour.'),
  z.strictObject({ kind: z.literal('media'), ...sourceFields }),
]);
export const projectFilesSchema = z.record(
  projectPath,
  z.strictObject({
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    size: z.number().int().nonnegative(),
    text: z.string().optional(),
  }),
);
export const assetSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string().max(200),
  file: z.string().regex(/^[a-zA-Z0-9_-]+\.[a-z0-9]+$/),
  mime: z.string().max(100),
  size: z.number().nonnegative(),
  duration: z.number().positive().optional(),
});
export const videoSchema = z
  .strictObject({
    version: z.literal(1),
    name: z.string().trim().min(1).max(100),
    source: sourceSchema,
    files: projectFilesSchema,
    width: dimension,
    height: dimension,
    duration: z.number().positive().max(3600),
    fps: fps.nullable(),
    assets: z.array(assetSchema).max(300),
  })
  .superRefine((doc, ctx) => {
    if (!doc.files[doc.source.entry])
      ctx.addIssue({ code: 'custom', message: 'Video source entry is missing.' });
    if (doc.source.kind !== 'media' && doc.fps === null)
      ctx.addIssue({ code: 'custom', message: 'A composition needs a frame rate.' });
    if (new Set(doc.assets.map((a) => a.id)).size !== doc.assets.length)
      ctx.addIssue({ code: 'custom', message: 'Asset IDs must be unique.' });
  });
/** Rendered text properties are an editing capability, never the video's authoring model. */
export const textElementSchema = z.object({
  id: z.string().min(1).max(1000),
  name: z.string().max(100),
  text: z.string().max(4000).default(''),
  fontFamily: z.string().max(120).default('Arial'),
  fontSize: z.number().min(8).max(400).default(80),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#242424'),
  x: z.number().min(0).max(100).default(50),
  y: z.number().min(0).max(100).default(50),
  width: z.number().min(1).max(100).default(80),
});
export type VideoSource = z.infer<typeof sourceSchema>;
export type ProjectFiles = z.infer<typeof projectFilesSchema>;
export type VideoDocument = z.infer<typeof videoSchema>;
export type TextElement = z.infer<typeof textElementSchema>;
export type Asset = z.infer<typeof assetSchema>;
export interface TimelineItem {
  id: string;
  name: string;
  kind: 'scene' | 'text';
  start: number;
  duration: number;
  target?: { path: string; index: number; offset: number; textIndex?: number };
}
export interface Revision {
  id: string;
  parentId: string | null;
  label: string;
  createdAt: string;
  author: 'user' | 'agent';
  document: VideoDocument;
}
export const intentSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('change') }),
  z.strictObject({
    kind: z.literal('transition'),
    duration: z.number().positive().max(60).optional(),
  }),
]);
export type VideoIntent = z.infer<typeof intentSchema>;
export interface Note {
  id: string;
  text: string;
  anchor: FeedbackAnchor;
  intent: VideoIntent;
  createdAt: string;
  requestId: string | null;
}
export interface VideoProject {
  workspaceId: string;
  name: string;
  revisionId: string;
  revision: Revision;
  history: Omit<Revision, 'document'>[];
  notes: Note[];
  source?: { directory: string; error?: string };
  canUndo: boolean;
  canRedo: boolean;
}
export interface ExportJob {
  id: string;
  revisionId: string;
  state: 'rendering' | 'complete' | 'failed';
  progress: number;
  error?: string;
  url?: string;
}
