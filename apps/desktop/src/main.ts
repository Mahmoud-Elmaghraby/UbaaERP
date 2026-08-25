import { app, BrowserWindow } from 'electron';

/**
 * Electron main process entry point.
 *
 * Intentionally minimal — this is foundation scaffolding only. Spawning
 * the NestJS backend as a child process (CLAUDE.md §2.4, avoiding the
 * ESM/CommonJS conflict from نبغة) and loading the web renderer are wired
 * up once apps/api and apps/web have real functionality to launch.
 */
function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
  });

  void win; // placeholder — no renderer wired up yet
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
