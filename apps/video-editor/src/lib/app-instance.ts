import { createContext } from 'react';
import type { BrowserAppInstance } from '@codex-ux/sdk';

export const AppInstanceContext = createContext<BrowserAppInstance | null>(null);
