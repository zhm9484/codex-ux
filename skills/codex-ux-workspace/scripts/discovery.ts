import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type DiscoveryCode =
  | 'service_not_started'
  | 'service_record_invalid'
  | 'service_unreachable'
  | 'service_mismatch'
  | 'runtime_mismatch'
  | 'service_restart_required';

export class DiscoveryError extends Error {
  readonly code: DiscoveryCode;
  readonly pid: number | undefined;
  constructor(code: DiscoveryCode, message: string, options?: ErrorOptions & { pid?: number }) {
    super(message, options);
    this.code = code;
    this.pid = options?.pid;
  }
}

async function record(root: string) {
  let text: string;
  try {
    text = await readFile(join(root, 'runtime.json'), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      throw new DiscoveryError(
        'service_not_started',
        'No service address is recorded for this data directory.',
        { cause: error },
      );
    throw new DiscoveryError(
      'service_record_invalid',
      'Cannot read the service address. Check the data directory and its permissions.',
      { cause: error },
    );
  }
  try {
    const saved = JSON.parse(text) as { origin?: unknown };
    if (typeof saved?.origin !== 'string') throw new Error('Missing origin.');
    const url = new URL(saved.origin);
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      url.origin !== saved.origin ||
      !url.port
    )
      throw new Error('Expected a loopback HTTP origin with a port.');
    return saved.origin;
  } catch (error) {
    throw new DiscoveryError(
      'service_record_invalid',
      'The saved service address is invalid. Do not guess a port or edit the record manually.',
      { cause: error },
    );
  }
}

/** Read-only discovery. Never starts, replaces or sends app operations to a service. */
export async function locateService(root: string, runtimeBuild: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const origin = await record(root);
    try {
      let health: Record<string, unknown>;
      try {
        const response = await fetch(origin + '/api/health', {
          signal: AbortSignal.timeout(1500),
          redirect: 'error',
        });
        if (!response.ok) throw new Error(`Health returned HTTP ${response.status}.`);
        health = (await response.json()) as Record<string, unknown>;
      } catch (error) {
        throw new DiscoveryError(
          'service_unreachable',
          'The recorded service did not answer a valid health check. It may have stopped or restarted.',
          { cause: error },
        );
      }
      if (!health || health.service !== 'codex-ux' || health.dataRoot !== root)
        throw new DiscoveryError(
          'service_mismatch',
          'This address belongs to a different service or data directory. It will not be used.',
        );
      if (health.version !== 3 || health.runtimeBuild !== runtimeBuild)
        throw new DiscoveryError(
          'runtime_mismatch',
          'The running service and installed skills have different versions. Finish active work before restarting with matching skills.',
        );
      return {
        state: 'ready' as const,
        origin,
        apiBase: origin + '/api',
        url: origin,
        dataRoot: root,
        runtimeBuild,
      };
    } catch (error) {
      // A restart may publish a new address while the previous health request is in flight.
      if (attempt === 0 && (await record(root).catch(() => origin)) !== origin) continue;
      throw error;
    }
  }
  throw new Error('Service discovery did not complete.');
}
