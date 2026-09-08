import { join } from 'node:path';
import { homedir } from 'node:os';
import { Environments } from '../../../skills/codex-ux-workspace/scripts/environments.ts';
export {
  capabilities,
  type Capability,
} from '../../../skills/codex-ux-workspace/scripts/environments.ts';
export const environments = new Environments(
  process.env.CODEX_UX_RUNTIME_DIR,
  process.env.CODEX_UX_CACHE_DIR ?? join(homedir(), '.cache/codex-ux'),
);
