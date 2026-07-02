import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App, { defaultSettings } from './App';
import { initialTasks } from './data/mockTasks';

beforeEach(() => {
  delete window.taskWalker;
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Task Walker UI', () => {
  it('filters tasks using title, application and executable name', () => {
    render(<App />);
    const search = screen.getByRole('textbox', { name: '開いているウィンドウを検索' });
    fireEvent.change(search, { target: { value: 'chrome.exe' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByText('Windows ウィンドウ検索ツール - Google Chrome')).toBeInTheDocument();
  });

  it('closes a preview task without Task Walker undo', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'ウィンドウを閉じる Ctrl + Enter' }));
    expect(screen.getAllByRole('option')).toHaveLength(8);
    expect(screen.queryByRole('button', { name: '元に戻す' })).not.toBeInTheDocument();
  });

  it('renders the Excel-specific fallback when no native icon is available', () => {
    const { container } = render(<App />);
    expect(container.querySelector('.excel-icon')).toBeInTheDocument();
    expect(container.querySelector('.native-app-icon')).not.toBeInTheDocument();
  });

  it('separates the active-window marker from the current selection', async () => {
    const active = { ...initialTasks[0], isActive: true };
    const other = { ...initialTasks[1], isActive: false };
    window.taskWalker = {
      getSettings: vi.fn().mockResolvedValue(defaultSettings), saveSettings: vi.fn().mockResolvedValue({ ok: true, settings: defaultSettings }),
      listWindows: vi.fn().mockResolvedValue({ ok: true, windows: [active, other] }), activateWindow: vi.fn(), closeWindow: vi.fn(),
      hideOverlay: vi.fn(), onOpenView: vi.fn().mockReturnValue(() => {}), onThemeChanged: vi.fn().mockReturnValue(() => {}),
    };
    render(<App />);
    const activeRow = await screen.findByRole('option', { name: /現在表示中/ });
    expect(activeRow).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('表示中')).toBeInTheDocument();
    const otherRow = screen.getByRole('option', { name: new RegExp(other.title) });
    fireEvent.mouseEnter(otherRow);
    expect(otherRow).toHaveAttribute('aria-selected', 'true');
    expect(activeRow).toHaveAttribute('aria-selected', 'false');
    expect(activeRow).toHaveClass('active-window');
  });

  it('hides the active marker when search excludes that window', () => {
    render(<App />);
    fireEvent.change(screen.getByRole('textbox', { name: '開いているウィンドウを検索' }), { target: { value: 'chrome.exe' } });
    expect(screen.queryByText('表示中')).not.toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });

  it('uses the native bridge for listing, activation and close', async () => {
    const activateWindow = vi.fn().mockResolvedValue({ ok: true });
    const closeWindow = vi.fn().mockResolvedValue({ ok: true });
    window.taskWalker = {
      getSettings: vi.fn().mockResolvedValue(defaultSettings), saveSettings: vi.fn().mockResolvedValue({ ok: true, settings: defaultSettings }),
      listWindows: vi.fn().mockResolvedValue({ ok: true, windows: [initialTasks[0]] }), activateWindow, closeWindow,
      hideOverlay: vi.fn(), onOpenView: vi.fn().mockReturnValue(() => {}), onThemeChanged: vi.fn().mockReturnValue(() => {}),
    };
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
    fireEvent.click(screen.getByRole('option'));
    await waitFor(() => expect(activateWindow).toHaveBeenCalledWith(initialTasks[0].hwnd));
    fireEvent.click(screen.getByRole('button', { name: `${initialTasks[0].title}を閉じる` }));
    await waitFor(() => expect(closeWindow).toHaveBeenCalledWith(initialTasks[0].hwnd));
  });

  it('applies icons delivered after the window list without blocking it', async () => {
    let deliverIcon: ((update: { hwnd: string; executablePath: string; iconDataUrl: string }) => void) | undefined;
    const task = { ...initialTasks[0], iconDataUrl: undefined };
    window.taskWalker = {
      getSettings: vi.fn().mockResolvedValue(defaultSettings), saveSettings: vi.fn().mockResolvedValue({ ok: true, settings: defaultSettings }),
      listWindows: vi.fn().mockResolvedValue({ ok: true, windows: [task] }), activateWindow: vi.fn(), closeWindow: vi.fn(),
      hideOverlay: vi.fn(), onOpenView: vi.fn().mockReturnValue(() => {}), onThemeChanged: vi.fn().mockReturnValue(() => {}),
      onWindowIcon: vi.fn((callback) => { deliverIcon = callback; return () => {}; }),
    };
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
    expect(container.querySelector('.native-app-icon')).not.toBeInTheDocument();
    deliverIcon?.({ hwnd: task.hwnd, executablePath: task.executablePath, iconDataUrl: 'data:image/png;base64,dGVzdA==' });
    await waitFor(() => expect(container.querySelector('.native-app-icon')).toBeInTheDocument());
  });

  it('opens settings and toggles sort direction', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'アプリ種別を降順に変更' }));
    expect(screen.getByRole('button', { name: 'アプリ種別を昇順に変更' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '設定 Ctrl + ,' }));
    expect(screen.getByRole('heading', { name: 'ショートカットの設定' })).toBeInTheDocument();
  });
});
