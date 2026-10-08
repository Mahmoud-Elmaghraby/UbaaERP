import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, type WriteStream } from 'node:fs';
import { get } from 'node:http';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { app, BrowserWindow, clipboard, dialog, Menu, nativeImage, shell, Tray } from 'electron';
import { apiBaseUrl, buildApiEnv } from './shared/api-env';
import { loadConfig, saveConfig, type DesktopConfig } from './shared/config';
import { WINDOWS_SERVICE_NAME, dataPaths, getDataRoot, resourcePaths, type DataPaths, type ResourcePaths } from './shared/paths';
import { PgTools, latestBackupTime, rotateBackups } from './shared/postgres';
import { IS_WINDOWS, nodeRuntimeEnv, run, sleep } from './shared/process';
import { runDesktopSetup } from './setup';
import { splashHtml } from './splash';
import { t } from './strings';

/**
 * Electron main process (CLAUDE.md §2.4): the NestJS API runs as a child
 * process — the app's own executable in Node mode, no separate Node.js —
 * and serves both the API and the built web app on one local port. The
 * window simply loads that URL, exactly as a phone on the shop's network
 * would when the owner turns network access on.
 *
 * Start-up: config → database reachable → migrations → API → window.
 */

const RESOURCES_ROOT = app.isPackaged
  ? process.resourcesPath
  : process.env.ERP_DESKTOP_RESOURCES ?? join(__dirname, '..', 'staging');

let config: DesktopConfig;
let data: DataPaths;
let resources: ResourcePaths;
let pg: PgTools;

let mainWindow: BrowserWindow | null = null;
let splash: BrowserWindow | null = null;
let tray: Tray | null = null;
let apiProcess: ChildProcess | null = null;
let apiLog: WriteStream | null = null;
let quitting = false;
const apiCrashTimes: number[] = [];

// ── Single instance ─────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());
  app.whenReady().then(start).catch((err: Error) => fatal(t.startFailed, err));
}

async function start(): Promise<void> {
  app.setAppUserModelId('com.erp-platform.desktop');
  Menu.setApplicationMenu(null);

  data = dataPaths(getDataRoot());
  resources = resourcePaths(RESOURCES_ROOT);
  pg = new PgTools(resources.pgBin);
  const loaded = loadConfig(data.root);
  if (!loaded) {
    fatal(t.notInstalled, new Error(`No configuration at ${data.root}`));
    return;
  }
  config = loaded;

  splash = new BrowserWindow({
    width: 420, height: 280, frame: false, resizable: false, show: false,
    backgroundColor: '#0d3b30', webPreferences: { sandbox: true },
  });
  splash.once('ready-to-show', () => splash?.show());
  await splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml(t.splashTitle, t.statusDatabase))}`);

  await ensureDatabase();
  setStatus(t.statusMigrations);
  await runDesktopSetup(config, resources.desktopSetupEntry, resources.api);
  setStatus(t.statusServer);
  await startApi();
  await waitForApi(90_000);

  createMainWindow();
  createTray();
  splash?.destroy();
  splash = null;
  scheduleBackups();
}

function setStatus(text: string): void {
  splash?.webContents
    .executeJavaScript(`document.getElementById('status').textContent = ${JSON.stringify(text)}`)
    .catch(() => undefined);
}

function fatal(message: string, err: Error): void {
  const logHint = data ? `\n\n${t.logsAt} ${data.logs}` : '';
  dialog.showErrorBox(t.appName, `${message}\n\n${err.message}${logHint}`);
  quitting = true;
  stopApi();
  app.quit();
}

// ── Database ───────────────────────────────────────────────────────────
async function ensureDatabase(): Promise<void> {
  if (await pg.isReady(config.database.port)) return;
  // The service is set to start automatically with Windows; right after
  // boot it may simply still be starting. If it is stopped, try to start it
  // (works when the user may control the service, harmless otherwise).
  if (IS_WINDOWS) await run('net.exe', ['start', WINDOWS_SERVICE_NAME]);
  else await pg.start({ serviceName: WINDOWS_SERVICE_NAME, pgData: data.pgData, logFile: join(data.logs, 'postgres.log') }).catch(() => undefined);
  await pg.waitReady(config.database.port, 90_000);
}

// ── API child process ──────────────────────────────────────────────────
const pidFile = () => join(data.root, 'logs', 'api.pid');

/** Kills an API left behind by a crashed earlier run — only that process, by its recorded PID. */
async function killStaleApi(): Promise<void> {
  if (!existsSync(pidFile())) return;
  const pid = Number(readFileSync(pidFile(), 'utf8'));
  rmSync(pidFile(), { force: true });
  if (!Number.isInteger(pid) || pid <= 0) return;
  try {
    process.kill(pid, 0); // still alive?
  } catch {
    return;
  }
  if (IS_WINDOWS) await run('taskkill.exe', ['/PID', String(pid), '/T', '/F']);
  else process.kill(pid, 'SIGTERM');
  await sleep(800);
}

function openApiLog(): WriteStream {
  mkdirSync(data.logs, { recursive: true });
  const file = join(data.logs, 'api.log');
  // Keep one previous log; start fresh once it passes 10 MB.
  if (existsSync(file) && statSync(file).size > 10 * 1024 * 1024) renameSync(file, `${file}.1`);
  return createWriteStream(file, { flags: 'a' });
}

async function startApi(): Promise<void> {
  await killStaleApi();
  apiLog ??= openApiLog();
  const env = nodeRuntimeEnv(buildApiEnv({ config, data, resources, appVersion: app.getVersion() }));
  const child = spawn(process.execPath, [resources.apiEntry], {
    cwd: resources.api,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  apiProcess = child;
  if (child.pid) writeFileSync(pidFile(), String(child.pid));
  child.stdout?.pipe(apiLog, { end: false });
  child.stderr?.pipe(apiLog, { end: false });
  child.on('exit', (code) => {
    if (apiProcess === child) apiProcess = null;
    apiLog?.write(`\n[desktop] API exited with code ${code}\n`);
    if (quitting || child.killed) return;
    // Unexpected exit: restart, but give up after 5 crashes in 5 minutes.
    const now = Date.now();
    apiCrashTimes.push(now);
    while (apiCrashTimes.length && apiCrashTimes[0]! < now - 5 * 60_000) apiCrashTimes.shift();
    if (apiCrashTimes.length > 5) {
      fatal(t.apiKeepsCrashing, new Error(`exit code ${code}`));
      return;
    }
    void startApi().then(() => waitForApi(90_000)).then(() => mainWindow?.reload()).catch((err: Error) => fatal(t.startFailed, err));
  });
}

function stopApi(): void {
  const child = apiProcess;
  apiProcess = null;
  if (!child?.pid) return;
  child.kill();
  if (IS_WINDOWS) void run('taskkill.exe', ['/PID', String(child.pid), '/T', '/F']);
  rmSync(pidFile(), { force: true });
}

async function restartApi(): Promise<void> {
  stopApi();
  await sleep(500);
  await startApi();
  await waitForApi(90_000);
  mainWindow?.reload();
}

function waitForApi(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const url = `${apiBaseUrl(config)}/health`;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const retry = () => {
        if (Date.now() > deadline) reject(new Error(`The app server did not start (${url}).`));
        else setTimeout(attempt, 700);
      };
      get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else retry();
      }).on('error', retry);
    };
    attempt();
  });
}

// ── Window ─────────────────────────────────────────────────────────────
function createMainWindow(): void {
  const origin = apiBaseUrl(config);
  mainWindow = new BrowserWindow({
    width: 1366, height: 860, minWidth: 1024, minHeight: 640,
    show: false, title: t.appName, backgroundColor: '#f7f8f8', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });
  // Same-origin pop-ups (the print page, attachments) open as app windows;
  // anything else goes to the default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(origin)) {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, width: 1000, height: 800 } };
    }
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(origin)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
  mainWindow.on('close', (event) => {
    // With network access on, phones/PCs depend on this machine: keep the
    // server running in the tray instead of quitting.
    if (!quitting && config.api.lanAccess) {
      event.preventDefault();
      mainWindow?.hide();
      tray?.displayBalloon?.({ title: t.appName, content: t.stillRunning });
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (!config.api.lanAccess) app.quit();
  });
  void mainWindow.loadURL(origin);
}

function showMainWindow(): void {
  if (!mainWindow) {
    if (config) createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// ── Tray ───────────────────────────────────────────────────────────────
/** LAN addresses of this machine, skipping VPN/virtual adapters (same filter نبغة learned the hard way). */
export function lanAddresses(): string[] {
  const virtual = /virtualbox|vmware|vmnet|hyper-v|virtual|docker|wsl|npcap|tap-?windows|\btun\b|\bppp\b|bluetooth|isatap|loopback|vethernet/i;
  const result: string[] = [];
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    if (virtual.test(name)) continue;
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) result.push(entry.address);
    }
  }
  return result;
}

function createTray(): void {
  const iconPath = join(__dirname, '..', 'assets', 'icon.png');
  tray = new Tray(existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty());
  tray.setToolTip(t.appName);
  tray.on('double-click', showMainWindow);
  refreshTrayMenu();
}

function refreshTrayMenu(): void {
  if (!tray) return;
  const port = config.api.port;
  const urls = config.api.lanAccess ? lanAddresses().map((ip) => `http://${ip}:${port}`) : [];
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t.appName, enabled: false },
      { type: 'separator' },
      { label: t.open, click: showMainWindow },
      {
        label: t.lanAccess,
        type: 'checkbox',
        checked: config.api.lanAccess,
        click: (item) => void setLanAccess(item.checked),
      },
      ...urls.map((url) => ({ label: `${t.copyLink} ${url}`, click: () => clipboard.writeText(url) })),
      { type: 'separator' },
      { label: t.backupNow, click: () => void backupNow(true) },
      { label: t.openBackups, click: () => void shell.openPath(data.backups) },
      { label: t.openLogs, click: () => void shell.openPath(data.logs) },
      { type: 'separator' },
      { label: t.quit, click: () => { quitting = true; app.quit(); } },
    ]),
  );
}

async function setLanAccess(enabled: boolean): Promise<void> {
  config.api.lanAccess = enabled;
  try {
    saveConfig(data.root, config);
    await restartApi();
  } catch (err) {
    dialog.showErrorBox(t.appName, `${t.lanToggleFailed}\n\n${(err as Error).message}`);
  }
  refreshTrayMenu();
}

// ── Backups (CLAUDE.md §8: scheduled local pg_dump + manual button) ─────
const appConn = () => ({
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.name,
});

async function backupNow(interactive: boolean): Promise<void> {
  try {
    const file = await pg.dump(appConn(), data.backups, interactive ? 'manual' : 'daily');
    if (!interactive) rotateBackups(data.backups, 'daily', config.backups.keepDaily);
    if (interactive) {
      void dialog.showMessageBox({ type: 'info', title: t.appName, message: t.backupDone, detail: file });
    }
  } catch (err) {
    if (interactive) dialog.showErrorBox(t.appName, `${t.backupFailed}\n\n${(err as Error).message}`);
    else apiLog?.write(`\n[desktop] daily backup failed: ${(err as Error).message}\n`);
  }
}

function scheduleBackups(): void {
  const check = () => {
    const last = latestBackupTime(data.backups, 'daily');
    if (last === null || Date.now() - last > 24 * 3_600_000) void backupNow(false);
  };
  setTimeout(check, 2 * 60_000); // not during start-up
  setInterval(check, 3_600_000);
}

// ── Shutdown ───────────────────────────────────────────────────────────
app.on('before-quit', () => {
  quitting = true;
  stopApi();
});

app.on('window-all-closed', () => {
  // Handled in the window's 'closed' event (stay in the tray when LAN access is on).
});
