import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    expect(otherRow).not.toHaveClass('switch-target');
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

  it('preserves the list scroll position when the native window list refreshes', async () => {
    vi.useFakeTimers();
    const first = { ...initialTasks[0], isActive: true };
    const second = { ...initialTasks[1], isActive: false };
    const listWindows = vi.fn()
      .mockResolvedValueOnce({ ok: true, windows: [first, second] })
      .mockResolvedValue({ ok: true, windows: [{ ...first, title: `${first.title} updated` }, second] });
    window.taskWalker = {
      getSettings: vi.fn().mockResolvedValue(defaultSettings), saveSettings: vi.fn().mockResolvedValue({ ok: true, settings: defaultSettings }),
      listWindows, activateWindow: vi.fn(), closeWindow: vi.fn(), hideOverlay: vi.fn(),
      onOpenView: vi.fn().mockReturnValue(() => {}), onThemeChanged: vi.fn().mockReturnValue(() => {}),
    };
    const { container } = render(<App />);
    await act(async () => { await Promise.resolve(); });
    const list = container.querySelector('.task-list') as HTMLElement;
    list.scrollTop = 180;
    await act(async () => { vi.advanceTimersByTime(1_000); await Promise.resolve(); });
    expect(listWindows).toHaveBeenCalledTimes(2);
    expect(list.scrollTop).toBe(180);
  });

  it('does not scroll to the replacement selection when the selected window disappears', async () => {
    vi.useFakeTimers();
    const first = { ...initialTasks[0], isActive: true };
    const second = { ...initialTasks[1], isActive: false };
    const listWindows = vi.fn()
      .mockResolvedValueOnce({ ok: true, windows: [first, second] })
      .mockResolvedValue({ ok: true, windows: [second] });
    window.taskWalker = {
      getSettings: vi.fn().mockResolvedValue(defaultSettings), saveSettings: vi.fn().mockResolvedValue({ ok: true, settings: defaultSettings }),
      listWindows, activateWindow: vi.fn(), closeWindow: vi.fn(), hideOverlay: vi.fn(),
      onOpenView: vi.fn().mockReturnValue(() => {}), onThemeChanged: vi.fn().mockReturnValue(() => {}),
    };
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    render(<App />);
    await act(async () => { await Promise.resolve(); });
    scrollIntoView.mockClear();
    await act(async () => { vi.advanceTimersByTime(1_000); await Promise.resolve(); });
    expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'true');
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('cycles recently used windows with Alt+W and commits on Alt release', async () => {
    let deliverSwitch: ((event: 'begin-forward' | 'next' | 'commit') => void) | undefined;
    const active = { ...initialTasks[0], id: 'active', hwnd: 'a', isActive: true, lastActive: 300 };
    const previous = { ...initialTasks[1], id: 'previous', hwnd: 'b', isActive: false, lastActive: 200 };
    const older = { ...initialTasks[2], id: 'older', hwnd: 'c', isActive: false, lastActive: 100 };
    const activateWindow = vi.fn().mockResolvedValue({ ok: true });
    window.taskWalker = {
      getSettings: vi.fn().mockResolvedValue(defaultSettings), saveSettings: vi.fn().mockResolvedValue({ ok: true, settings: defaultSettings }),
      listWindows: vi.fn().mockResolvedValue({ ok: true, windows: [older, active, previous] }), activateWindow, closeWindow: vi.fn(),
      hideOverlay: vi.fn(), onOpenView: vi.fn().mockReturnValue(() => {}), onThemeChanged: vi.fn().mockReturnValue(() => {}),
      onSwitchEvent: vi.fn((callback) => { deliverSwitch = callback; return () => {}; }),
    };
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    act(() => deliverSwitch?.('begin-forward'));
    const previousRow = screen.getByRole('option', { name: new RegExp(previous.title) });
    const olderRow = screen.getByRole('option', { name: new RegExp(older.title) });
    await waitFor(() => expect(previousRow).toHaveClass('selected', 'switch-target'));
    expect(screen.getByRole('option', { name: new RegExp(active.title) })).not.toHaveClass('switch-target');
    fireEvent.mouseEnter(olderRow);
    expect(previousRow).toHaveClass('selected', 'switch-target');
    expect(olderRow).not.toHaveClass('selected', 'switch-target');
    fireEvent.keyDown(window, { key: 'ArrowDown', altKey: false });
    await waitFor(() => expect(olderRow).toHaveClass('selected', 'switch-target'));
    fireEvent.keyDown(window, { key: 'ArrowUp', altKey: false });
    await waitFor(() => expect(previousRow).toHaveClass('selected', 'switch-target'));
    fireEvent.keyDown(window, { key: 'ArrowDown', altKey: true });
    await waitFor(() => expect(olderRow).toHaveClass('selected', 'switch-target'));
    fireEvent.keyDown(window, { key: 'ArrowUp', altKey: true });
    await waitFor(() => expect(previousRow).toHaveClass('selected', 'switch-target'));
    act(() => deliverSwitch?.('next'));
    await waitFor(() => expect(olderRow).toHaveClass('selected', 'switch-target'));
    expect(previousRow).not.toHaveClass('switch-target');
    act(() => deliverSwitch?.('commit'));
    await waitFor(() => expect(activateWindow).toHaveBeenCalledWith(older.hwnd));
    await waitFor(() => expect(olderRow).not.toHaveClass('switch-target'));
    expect(window.taskWalker.hideOverlay).toHaveBeenCalled();
  });

  it('commits an Alt+W target after selection catches up when Alt is released immediately', async () => {
    let deliverSwitch: ((event: 'begin-forward' | 'commit') => void) | undefined;
    let resolveWindows: ((result: { ok: true; windows: typeof initialTasks }) => void) | undefined;
    const active = { ...initialTasks[0], id: 'active', hwnd: 'a', isActive: true, lastActive: 300 };
    const previous = { ...initialTasks[1], id: 'previous', hwnd: 'b', isActive: false, lastActive: 200 };
    const windowsPromise = new Promise<{ ok: true; windows: typeof initialTasks }>((resolve) => { resolveWindows = resolve; });
    const activateWindow = vi.fn().mockResolvedValue({ ok: true });
    window.taskWalker = {
      getSettings: vi.fn().mockResolvedValue(defaultSettings), saveSettings: vi.fn().mockResolvedValue({ ok: true, settings: defaultSettings }),
      listWindows: vi.fn().mockReturnValue(windowsPromise), activateWindow, closeWindow: vi.fn(),
      hideOverlay: vi.fn(), onOpenView: vi.fn().mockReturnValue(() => {}), onThemeChanged: vi.fn().mockReturnValue(() => {}),
      onSwitchEvent: vi.fn((callback) => { deliverSwitch = callback; return () => {}; }),
    };
    render(<App />);
    act(() => {
      deliverSwitch?.('begin-forward');
      deliverSwitch?.('commit');
    });
    expect(activateWindow).not.toHaveBeenCalled();
    await act(async () => { resolveWindows?.({ ok: true, windows: [active, previous] }); await windowsPromise; });
    await waitFor(() => expect(screen.getByRole('option', { name: new RegExp(previous.title) })).toHaveClass('selected'));
    await waitFor(() => expect(activateWindow).toHaveBeenCalledTimes(1));
    expect(activateWindow).toHaveBeenCalledWith(previous.hwnd);
  });

  it('keeps the list open when search is focused during an Alt+W session', async () => {
    let deliverSwitch: ((event: 'begin-forward' | 'commit') => void) | undefined;
    const active = { ...initialTasks[0], id: 'active', hwnd: 'a', isActive: true, lastActive: 300 };
    const previous = { ...initialTasks[1], id: 'previous', hwnd: 'b', isActive: false, lastActive: 200 };
    const activateWindow = vi.fn().mockResolvedValue({ ok: true });
    const hideOverlay = vi.fn();
    window.taskWalker = {
      getSettings: vi.fn().mockResolvedValue(defaultSettings), saveSettings: vi.fn().mockResolvedValue({ ok: true, settings: defaultSettings }),
      listWindows: vi.fn().mockResolvedValue({ ok: true, windows: [active, previous] }), activateWindow, closeWindow: vi.fn(),
      hideOverlay, onOpenView: vi.fn().mockReturnValue(() => {}), onThemeChanged: vi.fn().mockReturnValue(() => {}),
      onSwitchEvent: vi.fn((callback) => { deliverSwitch = callback; return () => {}; }),
    };
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
    act(() => deliverSwitch?.('begin-forward'));
    const list = screen.getByRole('listbox');
    const search = screen.getByRole('textbox', { name: '開いているウィンドウを検索' });
    await waitFor(() => expect(list).toHaveFocus());
    expect(search).not.toHaveFocus();
    act(() => search.focus());
    act(() => deliverSwitch?.('commit'));
    expect(activateWindow).not.toHaveBeenCalled();
    expect(hideOverlay).not.toHaveBeenCalled();
    fireEvent.change(search, { target: { value: previous.title } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    fireEvent.click(screen.getByRole('option'));
    await waitFor(() => expect(activateWindow).toHaveBeenCalledTimes(1));
    expect(activateWindow).toHaveBeenCalledWith(previous.hwnd);
  });

  it('opens settings and toggles sort direction', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'アプリ種別を降順に変更' }));
    expect(screen.getByRole('button', { name: 'アプリ種別を昇順に変更' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '設定 Ctrl + ,' }));
    expect(screen.getByRole('heading', { name: 'ショートカットの設定' })).toBeInTheDocument();
  });
});
