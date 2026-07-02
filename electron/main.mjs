import { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage, nativeTheme, screen } from 'electron';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const smokeMode = process.env.TASK_WALKER_SMOKE === '1';
if (smokeMode) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.setPath('userData', path.join(app.getPath('temp'), `task-walker-smoke-${process.pid}`));
}

const defaults = Object.freeze({
  sortMode: 'type',
  sortDirections: { type: 'asc', recent: 'desc', title: 'asc' },
  shortcuts: {
    toggle: 'Alt+W',
    activate: 'Enter',
    close: 'Control+Enter',
    settings: 'Control+,',
  },
});

let mainWindow;
let tooltipWindow;
let tray;
let hookProcess;
let hookRestartCount = 0;
let hookReady = false;
let hookRestartFailed = false;
let hookLogicPassed = false;
let hookTitleReceived = false;
let pendingTooltipTitle = '';
let tooltipTimer;
let tooltipShown = false;
let nativeRequestSequence = 0;
const nativeRequests = new Map();
const iconCache = new Map();
const iconRequests = new Map();
const NATIVE_REQUEST_TIMEOUT_MS = 8_000;
let settings = structuredClone(defaults);
let pendingView = 'list';
let quitting = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function logNative(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.warn(line);
  if (app.isReady()) {
    void fs.appendFile(path.join(app.getPath('userData'), 'task-walker.log'), `${line}\n`, 'utf8').catch(() => {});
  }
}

function normalizeSettings(value) {
  const sortMode = ['type', 'recent', 'title'].includes(value?.sortMode) ? value.sortMode : defaults.sortMode;
  const sortDirections = {};
  for (const mode of Object.keys(defaults.sortDirections)) {
    sortDirections[mode] = ['asc', 'desc'].includes(value?.sortDirections?.[mode])
      ? value.sortDirections[mode]
      : defaults.sortDirections[mode];
  }
  const shortcuts = {};
  for (const key of Object.keys(defaults.shortcuts)) {
    const candidate = value?.shortcuts?.[key];
    shortcuts[key] = typeof candidate === 'string' && candidate.trim() ? candidate.trim() : defaults.shortcuts[key];
  }
  return { sortMode, sortDirections, shortcuts };
}

function validateSettings(value) {
  const normalized = normalizeSettings(value);
  const values = Object.values(normalized.shortcuts).map((item) => item.toLocaleLowerCase());
  if (new Set(values).size !== values.length) {
    return { ok: false, error: 'duplicate-shortcut', message: '同じショートカットは複数の操作に割り当てられません。' };
  }
  return { ok: true, settings: normalized };
}

async function loadSettings() {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8');
    settings = normalizeSettings(JSON.parse(raw));
  } catch (error) {
    if (error?.code !== 'ENOENT') console.warn('設定を読み込めませんでした:', error.message);
    settings = structuredClone(defaults);
  }
}

async function persistSettings(next) {
  const target = settingsPath();
  const temporary = `${target}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, target);
}

function positionWindow() {
  if (!mainWindow) return;
  const point = screen.getCursorScreenPoint();
  const { workArea } = screen.getDisplayNearestPoint(point);
  const [width, height] = mainWindow.getSize();
  mainWindow.setPosition(
    Math.round(workArea.x + (workArea.width - width) / 2),
    Math.round(workArea.y + (workArea.height - height) / 2),
    false,
  );
}

function showOverlay(view = 'list') {
  if (!mainWindow) return;
  pendingView = view;
  positionWindow();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('window:open-view', view);
}

function toggleOverlay() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) mainWindow.hide();
  else showOverlay('list');
}

function registerToggle(accelerator) {
  return globalShortcut.register(accelerator, toggleOverlay);
}

function iconPath(extension) {
  return path.join(rootDir, 'resources', `task-walker.${extension}`);
}

function nativeHelperPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'native', 'TaskWalkerHook.exe')
    : path.join(rootDir, 'resources', 'native', 'TaskWalkerHook.exe');
}

function positionTooltip(width, height) {
  if (!tooltipWindow) return;
  const point = screen.getCursorScreenPoint();
  const { workArea } = screen.getDisplayNearestPoint(point);
  const x = Math.min(Math.max(point.x + 14, workArea.x), workArea.x + workArea.width - width);
  const y = Math.min(Math.max(point.y + 18, workArea.y), workArea.y + workArea.height - height);
  tooltipWindow.setBounds({ x: Math.round(x), y: Math.round(y), width, height }, false);
}

function showActiveTitleTooltip(title) {
  if (!tooltipWindow || tooltipWindow.isDestroyed()) return;
  pendingTooltipTitle = title?.trim() || '（タイトルなし）';
  tooltipWindow.webContents.send('tooltip:show', pendingTooltipTitle);
}

function createTooltipWindow() {
  tooltipWindow = new BrowserWindow({
    width: 360,
    height: 44,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'tooltip-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  tooltipWindow.setIgnoreMouseEvents(true);
  if (process.env.VITE_DEV_SERVER_URL) {
    tooltipWindow.loadURL(new URL('tooltip.html', `${process.env.VITE_DEV_SERVER_URL}/`).toString());
  } else {
    tooltipWindow.loadFile(path.join(rootDir, 'dist', 'tooltip.html'));
  }
  tooltipWindow.webContents.on('did-finish-load', () => {
    if (pendingTooltipTitle) tooltipWindow.webContents.send('tooltip:show', pendingTooltipTitle);
  });
}

async function startNativeHook() {
  const executable = nativeHelperPath();
  try {
    await fs.access(executable);
  } catch {
    logNative(`Native helper was not found: ${executable}`);
    return;
  }

  const args = smokeMode ? ['--self-test'] : [];
  hookReady = false;
  const child = spawn(executable, args, {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, TASK_WALKER_HOST_PID: String(process.pid) },
  });
  hookProcess = child;
  const lines = readline.createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    if (line === 'READY') {
      hookReady = true;
      hookRestartCount = 0;
      hookRestartFailed = false;
      return;
    }
    if (line === 'LOGIC_OK') {
      hookLogicPassed = true;
      return;
    }
    if (line.startsWith('TITLE_BASE64:')) {
      try {
        const title = Buffer.from(line.slice('TITLE_BASE64:'.length), 'base64').toString('utf8');
        hookTitleReceived = true;
        showActiveTitleTooltip(title);
      } catch (error) {
        console.warn('Native helper title could not be decoded:', error.message);
      }
      return;
    }
    if (line.startsWith('RESPONSE_BASE64:')) {
      try {
        const response = JSON.parse(Buffer.from(line.slice('RESPONSE_BASE64:'.length), 'base64').toString('utf8'));
        const pending = nativeRequests.get(response.id);
        if (pending) {
          clearTimeout(pending.timer);
          nativeRequests.delete(response.id);
          pending.resolve(response);
        }
      } catch (error) {
        console.warn('Native helper response could not be decoded:', error.message);
      }
    }
  });
  child.on('error', (error) => logNative(`Native helper could not be started: ${error.message}`));
  child.stderr.on('data', (chunk) => logNative(`Native helper error: ${String(chunk).trim()}`));
  child.on('exit', (code, signal) => {
    if (hookProcess !== child) return;
    logNative(`Native helper exited (code=${code ?? 'none'}, signal=${signal ?? 'none'}).`);
    hookReady = false;
    for (const pending of nativeRequests.values()) {
      clearTimeout(pending.timer);
      pending.resolve({ ok: false, error: 'native-unavailable' });
    }
    nativeRequests.clear();
    hookProcess = undefined;
    lines.close();
    if (!quitting && !smokeMode && hookRestartCount < 3) {
      hookRestartCount += 1;
      setTimeout(startNativeHook, hookRestartCount * 750);
    } else if (!quitting && !smokeMode) {
      hookRestartFailed = true;
      logNative('Native helper restart limit was reached.');
    }
  });
}

function nativeRequest(command, hwnd = '') {
  if (!hookProcess?.stdin?.writable || !hookReady) {
    const error = hookRestartFailed ? 'native-restart-failed' : hookRestartCount > 0 ? 'native-restarting' : 'native-unavailable';
    return Promise.resolve({ ok: false, error });
  }
  const id = String(++nativeRequestSequence);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      nativeRequests.delete(id);
      logNative(`Native request timed out: ${command} (${NATIVE_REQUEST_TIMEOUT_MS}ms). Restarting helper.`);
      resolve({ ok: false, error: 'native-timeout' });
      hookReady = false;
      hookProcess?.kill();
    }, NATIVE_REQUEST_TIMEOUT_MS);
    nativeRequests.set(id, { resolve, timer });
    hookProcess.stdin.write(`${command}|${id}${hwnd ? `|${hwnd}` : ''}\n`, 'utf8');
  });
}

async function iconForExecutable(executablePath) {
  if (!executablePath) return '';
  if (iconCache.has(executablePath)) return iconCache.get(executablePath);
  try {
    const icon = await app.getFileIcon(executablePath, { size: 'large' });
    const dataUrl = icon.isEmpty() ? '' : icon.toDataURL();
    iconCache.set(executablePath, dataUrl);
    if (iconCache.size > 128) iconCache.delete(iconCache.keys().next().value);
    return dataUrl;
  } catch {
    iconCache.set(executablePath, '');
    return '';
  }
}

function queueWindowIcons(windows) {
  for (const window of windows) {
    if (!window.executablePath) continue;
    const key = window.executablePath.toLocaleLowerCase();
    let request = iconRequests.get(key);
    if (!request) {
      request = iconForExecutable(window.executablePath).finally(() => iconRequests.delete(key));
      iconRequests.set(key, request);
    }
    void request.then((iconDataUrl) => {
      if (!iconDataUrl || !mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send('windows:icon', {
        hwnd: window.hwnd,
        executablePath: window.executablePath,
        iconDataUrl,
      });
    }).catch((error) => console.warn(`Window icon could not be loaded: ${window.executablePath}`, error.message));
  }
}

async function listNativeWindows() {
  const response = await nativeRequest('LIST');
  if (!response.ok) return response;
  const windows = (response.windows ?? []).map((window) => ({
    ...window,
    iconDataUrl: iconCache.get(window.executablePath) || undefined,
    fallbackIcon: fallbackIconForProcess(window.processName),
  }));
  queueWindowIcons(windows.filter((window) => !window.iconDataUrl));
  return { ok: true, windows };
}

function fallbackIconForProcess(processName = '') {
  const name = processName.toLocaleLowerCase();
  if (name.includes('excel')) return 'excel';
  if (name.includes('chrome')) return 'chrome';
  if (name.includes('edge')) return 'edge';
  if (name.includes('explorer')) return 'explorer';
  if (name.includes('code')) return 'vscode';
  return 'terminal';
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 944,
    height: 502,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#202020' : '#f5f5f5',
    icon: iconPath('ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.removeMenu();
  if (process.env.VITE_DEV_SERVER_URL) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  else mainWindow.loadFile(path.join(rootDir, 'dist', 'index.html'));

  mainWindow.on('blur', () => {
    if (!smokeMode && !mainWindow.webContents.isDevToolsOpened()) mainWindow.hide();
  });
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('window:open-view', pendingView);
  });
}

function createTray() {
  const image = nativeImage.createFromPath(iconPath('png')).resize({ width: 20, height: 20 });
  tray = new Tray(image);
  tray.setToolTip('Task Walker');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '開く', click: () => showOverlay('list') },
    { label: '設定', click: () => showOverlay('settings') },
    { type: 'separator' },
    { label: '終了', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', toggleOverlay);
}

async function saveSettingsCandidate(candidate) {
  const result = validateSettings(candidate);
  if (!result.ok) return result;

  const next = result.settings;
  const oldAccelerator = settings.shortcuts.toggle;
  const newAccelerator = next.shortcuts.toggle;
  let registeredNew = false;

  if (oldAccelerator !== newAccelerator) {
    registeredNew = registerToggle(newAccelerator);
    if (!registeredNew) {
      return { ok: false, error: 'shortcut-in-use', message: `${newAccelerator} は別のアプリで使用されています。` };
    }
  }

  try {
    await persistSettings(next);
    if (registeredNew) globalShortcut.unregister(oldAccelerator);
    settings = next;
    return { ok: true, settings };
  } catch (error) {
    if (registeredNew) globalShortcut.unregister(newAccelerator);
    return { ok: false, error: 'save-failed', message: `設定を保存できませんでした: ${error.message}` };
  }
}

ipcMain.handle('settings:get', () => settings);
ipcMain.handle('settings:save', (_event, candidate) => saveSettingsCandidate(candidate));
ipcMain.handle('windows:list', () => listNativeWindows());
ipcMain.handle('windows:activate', (_event, hwnd) => nativeRequest('ACTIVATE', String(hwnd)));
ipcMain.handle('windows:close', (_event, hwnd) => nativeRequest('CLOSE', String(hwnd)));
ipcMain.on('window:hide', () => mainWindow?.hide());
ipcMain.on('tooltip:size', (_event, requested) => {
  if (!tooltipWindow || !pendingTooltipTitle) return;
  const width = Math.min(560, Math.max(180, Math.round(Number(requested?.width) || 360)));
  const height = Math.min(72, Math.max(40, Math.round(Number(requested?.height) || 44)));
  positionTooltip(width, height);
  tooltipWindow.showInactive();
  tooltipShown = true;
  clearTimeout(tooltipTimer);
  tooltipTimer = setTimeout(() => {
    tooltipWindow?.hide();
    pendingTooltipTitle = '';
  }, 2_000);
});

app.on('second-instance', () => showOverlay('list'));
app.on('before-quit', () => {
  quitting = true;
  clearTimeout(tooltipTimer);
  hookProcess?.kill();
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'system';
  await loadSettings();
  if (smokeMode) {
    settings = {
      ...settings,
      shortcuts: { ...settings.shortcuts, toggle: 'Control+Alt+Shift+F12' },
    };
  }
  createWindow();
  createTooltipWindow();
  createTray();
  await startNativeHook();

  const registered = registerToggle(settings.shortcuts.toggle);
  if (!registered) {
    console.warn(`${settings.shortcuts.toggle} を登録できませんでした。`);
  }

  nativeTheme.on('updated', () => {
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    mainWindow?.setBackgroundColor(theme === 'dark' ? '#202020' : '#f5f5f5');
    mainWindow?.webContents.send('theme:changed', theme);
  });

  if (smokeMode) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    const tooltipWasShown = tooltipShown;
    const listResult = await listNativeWindows();
    const smokeHwnd = listResult.windows?.[0]?.hwnd ?? '1001';
    const activateResult = await nativeRequest('ACTIVATE', smokeHwnd);
    const closeResult = await nativeRequest('CLOSE', smokeHwnd);
    const blockedAccelerator = 'Control+Alt+Shift+F11';
    const blockerRegistered = globalShortcut.register(blockedAccelerator, () => {});
    const conflictResult = blockerRegistered
      ? await saveSettingsCandidate({ ...settings, shortcuts: { ...settings.shortcuts, toggle: blockedAccelerator } })
      : { ok: false };
    await persistSettings(settings);
    await loadSettings();
    await new Promise((resolve) => setTimeout(resolve, 2_100));
    console.log(JSON.stringify({
      window: Boolean(mainWindow),
      tray: Boolean(tray),
      shortcut: registered,
      conflictRollback: !conflictResult.ok && globalShortcut.isRegistered(settings.shortcuts.toggle),
      settingsReloaded: settings.shortcuts.toggle === 'Control+Alt+Shift+F12',
      nativeHookReady: hookReady,
      nativeHookLogic: hookLogicPassed,
      nativeTitleReceived: hookTitleReceived,
      tooltipShown: tooltipWasShown,
      tooltipHiddenAfterTimeout: tooltipWasShown && !tooltipWindow.isVisible(),
      sortDirectionsReloaded: settings.sortDirections.type === 'asc'
        && settings.sortDirections.recent === 'desc'
        && settings.sortDirections.title === 'asc',
      nativeList: listResult.ok && listResult.windows?.length === 1,
      nativeActivate: activateResult.ok,
      nativeClose: closeResult.ok,
    }));
    if (blockerRegistered) globalShortcut.unregister(blockedAccelerator);
    setTimeout(() => { quitting = true; app.quit(); }, 200);
  } else {
    showOverlay('list');
  }
});
