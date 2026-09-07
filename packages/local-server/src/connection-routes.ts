import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { Services } from './routes.ts';
import { json, readJson } from './http.ts';
import { HttpError } from './errors.ts';

const session = z.strictObject({
  provider: z.literal('codex'),
  sessionId: z.string().regex(/^[a-zA-Z0-9-]{10,100}$/),
});
const scope = { appId: z.string(), workspaceId: z.string().uuid() };
const create = z.union([
  z.strictObject({ ...scope, session }),
  z.strictObject({ ...scope, instanceId: z.string().uuid(), previousSession: session.nullable() }),
]);

export async function connectionApi(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  s: Services,
) {
  if (path === '/api/connections' && req.method === 'POST') {
    const input = create.parse(await readJson(req));
    s.workspaces.get(input.workspaceId);
    if (!s.apps.some((app) => app.id === input.appId)) throw new HttpError(404, 'App not found.');
    json(res, s.connections.create(input), 201);
    return true;
  }
  const match = /^\/api\/connections\/([\w-]{24})(?:\/(connect|accept|disconnect))?$/.exec(path);
  if (!match) return false;
  const code = match[1]!;
  if (!match[2] && req.method === 'GET') json(res, s.connections.get(code));
  else if (match[2] === 'connect' && req.method === 'POST') {
    const input = z
      .strictObject({ session, replaceSession: session.nullable().default(null) })
      .parse(await readJson(req));
    json(res, s.connections.connect(code, input.session, input.replaceSession));
  } else if (match[2] === 'accept' && req.method === 'POST') {
    const input = z
      .strictObject({ instanceId: z.string().uuid(), currentSession: session.nullable() })
      .parse(await readJson(req));
    json(res, s.connections.accept(code, input.instanceId, input.currentSession));
  } else if (match[2] === 'disconnect' && req.method === 'POST') {
    const input = z.strictObject({ instanceId: z.string().uuid() }).parse(await readJson(req));
    json(res, s.connections.disconnect(code, input.instanceId));
  } else throw new HttpError(405, 'Method not allowed.');
  return true;
}
