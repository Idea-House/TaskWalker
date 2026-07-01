import type { TaskItem } from '../types';

const now = Date.now();
const task = (id: string, title: string, appName: string, processName: string, fallbackIcon: TaskItem['fallbackIcon'], lastActive: number, pid: number): TaskItem => ({
  id, hwnd: `0x${(0x1000 + pid).toString(16)}`, pid, title, appName, processName,
  executablePath: `C:\\Program Files\\${appName}\\${processName}`,
  fallbackIcon, minimized: false, lastActive, isActive: id === 'excel-1',
});

export const initialTasks: TaskItem[] = [
  task('excel-1', '勤務時間報告_{林檎}.xlsx - Excel', 'Excel', 'EXCEL.EXE', 'excel', now - 1_000, 101),
  task('excel-2', '交通費明細_{張柏}.xlsx - Excel', 'Excel', 'EXCEL.EXE', 'excel', now - 95_000, 102),
  task('excel-3', 'Book1 - Excel', 'Excel', 'EXCEL.EXE', 'excel', now - 180_000, 103),
  task('vscode-1', 'Task Walker - Visual Studio Code', 'Visual Studio Code', 'Code.exe', 'vscode', now - 12_000, 104),
  task('explorer-1', '07_WindowWalker - エクスプローラー', 'エクスプローラー', 'explorer.exe', 'explorer', now - 28_000, 105),
  task('terminal-1', 'PowerShell - Task Walker', 'Windows Terminal', 'WindowsTerminal.exe', 'terminal', now - 62_000, 106),
  task('chrome-1', 'Windows ウィンドウ検索ツール - Google Chrome', 'Google Chrome', 'chrome.exe', 'chrome', now - 44_000, 107),
  task('explorer-2', 'ホーム - エクスプローラー', 'エクスプローラー', 'explorer.exe', 'explorer', now - 130_000, 108),
  task('edge-1', '新しいタブ - 個人 - Microsoft Edge', 'Microsoft Edge', 'msedge.exe', 'edge', now - 75_000, 109),
];
