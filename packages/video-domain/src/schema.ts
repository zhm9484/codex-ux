import { z } from 'zod';
import type { FeedbackAnchor } from '@codex-ux/protocol';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const assetSchema = z.object({
  id,
  name: z.string().max(200),
  file: z.string().regex(/^[a-zA-Z0-9_-]+\.[a-z0-9]+$/),
  mime: z.string().max(100),
  size: z.number().nonnegative(),
  duration: z.number().positive().optional(),
});
export const clipSchema = z.object({
  id,
  name: z.string().min(1).max(100),
  kind: z.enum(['scene', 'text', 'image', 'video', 'audio']),
  trackId: id,
  start: z.number().min(0).max(3600),
  duration: z.number().min(0.1).max(3600),
  offset: z.number().min(0).max(3600).default(0),
  assetId: id.optional(),
  sourceId: id.optional(),
  text: z.string().max(4000).default(''),
  fontFamily: z.string().max(120).default('Arial'),
  fontSize: z.number().min(8).max(400).default(80),
  color: color.default('#f4f0e8'),
  align: z.enum(['left', 'center', 'right']).default('center'),
  x: z.number().min(0).max(100).default(50),
  y: z.number().min(0).max(100).default(50),
  width: z.number().min(1).max(100).default(80),
  volume: z.number().min(0).max(1).default(1),
});
export const nativeFilePath = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (path) =>
      !path.startsWith('/') &&
      !path.includes('\\') &&
      !path.split('/').some((part) => !part || part === '.' || part === '..'),
    'Expected a relative project file path.',
  );
export const nativeProjectSchema = z.object({
  entry: nativeFilePath,
  duration: z.number().positive().max(3600),
  files: z.record(
    nativeFilePath,
    z.object({
      hash: z.string().regex(/^[a-f0-9]{64}$/),
      size: z.number().int().nonnegative(),
      text: z.string().optional(),
    }),
  ),
});
export const videoSchema = z
  .object({
    name: z.string().min(1).max(100),
    native: nativeProjectSchema.optional(),
    width: z.number().int().min(240).max(3840),
    height: z.number().int().min(240).max(3840),
    fps: z.union([z.literal(24), z.literal(30), z.literal(60)]),
    background: color,
    tracks: z
      .array(z.object({ id, name: z.string().min(1).max(60) }))
      .min(1)
      .max(20),
    clips: z.array(clipSchema).max(300),
    assets: z.array(assetSchema).max(300),
    sources: z.record(id, z.string().max(500000)),
  })
  .superRefine((doc, ctx) => {
    const tracks = new Set(doc.tracks.map((t) => t.id));
    const assets = new Set(doc.assets.map((a) => a.id));
    if (
      tracks.size !== doc.tracks.length ||
      new Set(doc.clips.map((c) => c.id)).size !== doc.clips.length ||
      assets.size !== doc.assets.length
    )
      ctx.addIssue({ code: 'custom', message: 'Object IDs must be unique.' });
    for (const c of doc.clips) {
      if (!tracks.has(c.trackId)) ctx.addIssue({ code: 'custom', message: 'Unknown track.' });
      if (c.start + c.duration > 3600)
        ctx.addIssue({ code: 'custom', message: 'The maximum video length is one hour.' });
      if (c.kind === 'scene' && (!c.sourceId || !(c.sourceId in doc.sources)))
        ctx.addIssue({ code: 'custom', message: 'Scene source is missing.' });
      if (['image', 'video', 'audio'].includes(c.kind) && (!c.assetId || !assets.has(c.assetId)))
        ctx.addIssue({ code: 'custom', message: 'Media asset is missing.' });
    }
  });
export type VideoDocument = z.infer<typeof videoSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type Asset = z.infer<typeof assetSchema>;
export interface Revision {
  id: string;
  parentId: string | null;
  label: string;
  createdAt: string;
  author: 'user' | 'agent';
  document: VideoDocument;
}
export interface Note {
  id: string;
  text: string;
  anchor: FeedbackAnchor;
  createdAt: string;
  requestId: string | null;
}
export interface WorkspaceSummary {
  id: string;
  name: string;
  revisionId: string;
  updatedAt: string;
  threadId: string | null;
}
export interface Workspace extends WorkspaceSummary {
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
