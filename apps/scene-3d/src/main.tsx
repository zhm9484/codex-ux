import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { openAppInstance } from '@codex-ux/sdk';
import { App } from './app';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('The application root is missing.');
const instance = await openAppInstance('scene-3d');
instance.enableConnections();
createRoot(root).render(
  <StrictMode>
    <App instance={instance} />
  </StrictMode>,
);
