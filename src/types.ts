export type SortMode = 'type' | 'recent' | 'title';
export type SortDirection = 'asc' | 'desc';
export type ViewName = 'list' | 'settings';
export type ShortcutName = 'activate' | 'close' | 'settings';
export type SwitchEvent = 'begin-forward' | 'begin-backward' | 'next' | 'previous' | 'commit' | 'cancel';
export type FallbackIcon = 'excel' | 'chrome' | 'edge' | 'explorer' | 'vscode' | 'terminal';

export interface TaskItem {
  id: string;
  hwnd: string;
  pid: number;
  title: string;
  appName: string;
  processName: string;
  executablePath: string;
  iconDataUrl?: string;
  fallbackIcon: FallbackIcon;
  minimized: boolean;
  lastActive: number;
  isActive: boolean;
}

export interface ShortcutSettings {
  activate: string;
  close: string;
  settings: string;
}

export interface AppSettings {
  sortMode: SortMode;
  sortDirections: Record<SortMode, SortDirection>;
  shortcuts: ShortcutSettings;
}

export type SaveSettingsResult =
  | { ok: true; settings: AppSettings }
  | { ok: false; error: 'duplicate-shortcut' | 'save-failed'; message: string };

export type NativeWindowError = 'window-not-found' | 'access-denied' | 'activation-failed' | 'native-unavailable' | 'native-timeout' | 'native-restarting' | 'native-restart-failed' | 'native-error';
export type WindowIconUpdate = { hwnd: string; executablePath: string; iconDataUrl: string };
export type WindowListResult = { ok: true; windows: TaskItem[] } | { ok: false; error: NativeWindowError; message?: string };
export type WindowActionResult = { ok: true } | { ok: false; error: NativeWindowError; message?: string };

declare global {
  interface Window {
    taskWalker?: {
      getSettings: () => Promise<AppSettings>;
      saveSettings: (settings: AppSettings) => Promise<SaveSettingsResult>;
      listWindows: () => Promise<WindowListResult>;
      onWindowIcon?: (callback: (update: WindowIconUpdate) => void) => () => void;
      activateWindow: (hwnd: string) => Promise<WindowActionResult>;
      closeWindow: (hwnd: string) => Promise<WindowActionResult>;
      hideOverlay: () => void;
      onSwitchEvent?: (callback: (event: SwitchEvent) => void) => () => void;
      onOpenView: (callback: (view: ViewName) => void) => () => void;
      onThemeChanged: (callback: (theme: 'light' | 'dark') => void) => () => void;
    };
  }
}
