import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app';
// The app font ships with the bundle (no Google Fonts request): the desktop
// build runs fully offline (CLAUDE.md §2.4), and the cloud loses nothing.
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
