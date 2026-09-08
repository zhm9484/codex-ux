import type { IncomingMessage, ServerResponse } from 'node:http';
import { environments, capabilities, type Capability } from './environment.ts';
import { browserState, prepareBrowser, cancelBrowser } from './browser.ts';
import { json } from './http.ts';
import { HttpError } from './errors.ts';
export function environmentApi(req: IncomingMessage, res: ServerResponse, path: string) {
  if (path === '/api/environment' && req.method === 'GET') {
    json(
      res,
      environments.list().map((item) => (item.id === 'browser' ? browserState : item)),
    );
    return true;
  }
  const match = /^\/api\/environment\/([a-z-]+)$/.exec(path);
  if (!match) return false;
  const id = match[1] as Capability;
  if (!capabilities.includes(id)) throw new HttpError(404, 'Unknown capability.');
  if (req.method === 'POST') {
    if (id === 'browser') void prepareBrowser().catch(() => {});
    else environments.start(id);
    json(res, { id, state: 'preparing' }, 202);
    return true;
  }
  if (req.method === 'DELETE') {
    environments.cancel(id);
    if (id === 'browser') cancelBrowser();
    json(res, { id, state: 'cancelling' });
    return true;
  }
  throw new HttpError(405, 'Method not allowed.');
}
