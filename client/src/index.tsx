import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './css/global.css';

import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  MantineProvider,
  localStorageColorSchemeManager,
} from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import App from './App';
import { theme } from './theme';

const colorSchemeManager = localStorageColorSchemeManager({
  key: '1kwords-color-scheme',
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MantineProvider
      theme={theme}
      defaultColorScheme="dark"
      colorSchemeManager={colorSchemeManager}
    >
      <ModalsProvider>
        <Notifications position="top-right" />
        <App />
      </ModalsProvider>
    </MantineProvider>
  </React.StrictMode>,
);

// PWA service worker (production only).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  });
}
