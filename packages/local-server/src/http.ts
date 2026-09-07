import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError } from './errors.ts';
export async function readBody(req: IncomingMessage, limit = 8 * 1024 * 1024): Promise<Buffer> {
  const parts: Buffer[] = [];
  let size = 0;
  for await (const part of req) {
    const b = Buffer.isBuffer(part) ? part : Buffer.from(part as Uint8Array);
    size += b.length;
    if (size > limit) throw new HttpError(413, 'This file is too large.');
    parts.push(b);
  }
  return Buffer.concat(parts);
}
export async function readJson(req: IncomingMessage): Promise<unknown> {
  try {
    return JSON.parse((await readBody(req)).toString()) as unknown;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Expected a JSON request body.');
  }
}
export function json(res: ServerResponse, body: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
