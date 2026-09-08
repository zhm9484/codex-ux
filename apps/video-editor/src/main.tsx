import { RuntimeGate } from '@codex-ux/editor-ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { openAppInstance } from '@codex-ux/sdk';
import { App } from './app';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('The application root is missing.');
}

const instance = await openAppInstance('video-editor');
instance.enableConnections();

createRoot(root).render(
  <StrictMode>
    <RuntimeGate app="video">
      <App instance={instance} />
    </RuntimeGate>
  </StrictMode>,
);
