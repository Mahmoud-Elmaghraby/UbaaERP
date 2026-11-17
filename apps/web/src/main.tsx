import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app';
// The app font ships with the bundle (no Google Fonts request): the desktop
// build runs fully offline (CLAUDE.md §2.4), and the cloud loses nothing.
import '@fontsource/cairo/400.css';
import '@fontsource/cairo/500.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
