import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft20Regular, ArrowSortDown20Regular, ArrowSort20Regular, ArrowSortUp20Regular, Checkmark16Regular, Dismiss16Regular, Search20Regular, Settings20Regular, Window20Regular } from '@fluentui/react-icons';
import { AppIcon } from './components/AppIcon';
import { ShortcutRecorder } from './components/ShortcutRecorder';
import { initialTasks } from './data/mockTasks';
import { matchesShortcut, validateShortcutSet } from './lib/shortcut-utils';
import { filterTasks, sortTasks } from './lib/task-utils';
import type { AppSettings, NativeWindowError, ShortcutName, SortDirection, SortMode, SwitchEvent, TaskItem, ViewName } from './types';
import './styles.css';

export const defaultSettings: AppSettings = {
  sortMode: 'type', sortDirections: { type: 'asc', recent: 'desc', title: 'asc' },
  shortcuts: { activate: 'Enter', close: 'Control+Enter', settings: 'Control+,' },
};

const sortLabels: Record<SortMode, string> = { type: 'アプリ種別', recent: '最近使用', title: 'ウィンドウ名' };
const shortcutLabels: Array<{ key: ShortcutName; label: string; description: string }> = [
  { key: 'activate', label: '選択したタスクへ切り替え', description: '選択中のウィンドウを開きます' },
  { key: 'close', label: '選択したタスクを閉じる', description: '対象ウィンドウへ終了を要求します' },
  { key: 'settings', label: '設定を表示', description: 'この設定画面を開きます' },
];

const errorText = (error: NativeWindowError) => {
  if (error === 'native-restarting') return 'Windows連携機能を再起動しています。しばらくしてから再試行してください。';
  if (error === 'native-restart-failed') return 'Windows連携機能を再起動できませんでした。Task Walkerを再起動してください。';
  return ({
  'window-not-found': '対象のウィンドウはすでに閉じられています。',
  'access-denied': 'このウィンドウを操作する権限がありません。',
  'activation-failed': 'ウィンドウを前面に切り替えられませんでした。',
  'native-unavailable': 'Windows連携機能を起動できませんでした。',
  'native-timeout': 'Windowsからの応答がありませんでした。',
  'native-error': 'Windows連携でエラーが発生しました。',
  }[error]);
};

export default function App() {
  const nativeMode = Boolean(window.taskWalker?.listWindows);
  const [tasks, setTasks] = useState<TaskItem[]>(nativeMode ? [] : initialTasks);
  const [settings, setSettings] = useState(defaultSettings);
  const [view, setView] = useState<ViewName>('list');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(nativeMode ? '' : initialTasks[0].id);
  const [sortOpen, setSortOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(nativeMode);
  const [listError, setListError] = useState<string | null>(null);
  const [draft, setDraft] = useState(defaultSettings);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [switchSession, setSwitchSession] = useState({ active: false, offset: 0, commit: false });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const forced = new URLSearchParams(window.location.search).get('theme');
    if (forced === 'light' || forced === 'dark') return forced;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const shouldFocusSearchRef = useRef(true);
  const shouldSelectActiveRef = useRef(true);
  const shouldRevealSelectionRef = useRef(true);
  const refreshInFlightRef = useRef(false);
  const taskListRef = useRef<HTMLElement>(null);
  const pendingScrollTopRef = useRef<number | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const switchCommittedRef = useRef(false);

  const visibleTasks = useMemo(() => switchSession.active
    ? sortTasks(tasks, 'recent', 'desc')
    : sortTasks(filterTasks(tasks, query), settings.sortMode, settings.sortDirections[settings.sortMode]),
  [tasks, query, settings.sortMode, settings.sortDirections, switchSession.active]);
  const selectedTask = visibleTasks.find((task) => task.id === selectedId) ?? visibleTasks[0];

  const refreshTasks = useCallback(async () => {
    if (!window.taskWalker?.listWindows || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const result = await window.taskWalker.listWindows();
      setLoading(false);
      if (result.ok) {
        pendingScrollTopRef.current = taskListRef.current?.scrollTop ?? null;
        setTasks((current) => result.windows.map((task) => ({
          ...task,
          iconDataUrl: task.iconDataUrl ?? current.find((item) => item.hwnd === task.hwnd && item.executablePath === task.executablePath)?.iconDataUrl,
        })));
        setListError(null);
        if (shouldSelectActiveRef.current) {
          const active = result.windows.find((task) => task.isActive);
          if (active) {
            shouldRevealSelectionRef.current = true;
            setSelectedId(active.id);
          }
          shouldSelectActiveRef.current = false;
        }
      }
      else setListError(errorText(result.error));
    } finally {
      refreshInFlightRef.current = false;
    }
  }, []);

  const openView = useCallback((nextView: ViewName) => {
    setView(nextView); setSortOpen(false); setSaveError(null);
    if (nextView === 'list') requestAnimationFrame(() => {
      if (shouldFocusSearchRef.current) inputRef.current?.focus();
    });
    else setDraft(settings);
  }, [settings]);

  const focusTaskListForSwitch = useCallback(() => {
    const focusList = () => taskListRef.current?.focus();
    focusList();
    requestAnimationFrame(focusList);
    window.setTimeout(focusList, 25);
    window.setTimeout(focusList, 75);
  }, []);

  useEffect(() => { window.taskWalker?.getSettings().then((stored) => { setSettings(stored); setDraft(stored); }); }, []);
  useEffect(() => {
    const dispose = window.taskWalker?.onThemeChanged(setTheme);
    if (window.taskWalker) return dispose;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setTheme(media.matches ? 'dark' : 'light');
    media.addEventListener('change', update); return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => window.taskWalker?.onWindowIcon?.((update) => {
    setTasks((current) => current.map((task) => (
      task.hwnd === update.hwnd && task.executablePath === update.executablePath
        ? { ...task, iconDataUrl: update.iconDataUrl }
        : task
    )));
  }), []);
  useEffect(() => window.taskWalker?.onOpenView((next) => {
    if (next === 'list') {
      shouldFocusSearchRef.current = true;
      shouldSelectActiveRef.current = true;
    }
    openView(next);
    if (next === 'list') void refreshTasks();
  }), [openView, refreshTasks]);
  useEffect(() => window.taskWalker?.onSwitchEvent?.((event: SwitchEvent) => {
    if (event === 'begin-forward' || event === 'begin-backward') {
      shouldFocusSearchRef.current = false;
      shouldSelectActiveRef.current = false;
      switchCommittedRef.current = false;
      setQuery('');
      setLoading(true);
      openView('list');
      setSwitchSession({ active: true, offset: event === 'begin-forward' ? 1 : -1, commit: false });
      focusTaskListForSwitch();
      void refreshTasks();
      return;
    }
    if (event === 'next' || event === 'previous') {
      setSwitchSession((current) => current.active
        ? { ...current, offset: current.offset + (event === 'next' ? 1 : -1) }
        : current);
      return;
    }
    if (event === 'commit') {
      setSwitchSession((current) => current.active ? { ...current, commit: true } : current);
      return;
    }
    switchCommittedRef.current = false;
    setSwitchSession({ active: false, offset: 0, commit: false });
    window.taskWalker?.hideOverlay();
  }), [focusTaskListForSwitch, openView, refreshTasks]);
  useEffect(() => {
    if (!nativeMode || view !== 'list') return;
    let timer: number | undefined;
    const updatePolling = () => {
      window.clearInterval(timer);
      if (document.visibilityState === 'visible') { void refreshTasks(); timer = window.setInterval(refreshTasks, 1_000); }
    };
    updatePolling(); document.addEventListener('visibilitychange', updatePolling);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', updatePolling); };
  }, [nativeMode, refreshTasks, view]);
  useEffect(() => { if (view === 'list') requestAnimationFrame(() => {
    if (shouldFocusSearchRef.current) inputRef.current?.focus();
  }); }, [view]);
  useEffect(() => {
    if (visibleTasks.length && !visibleTasks.some((task) => task.id === selectedId)) {
      shouldRevealSelectionRef.current = false;
      setSelectedId(visibleTasks[0].id);
    }
    if (!visibleTasks.length && selectedId) {
      shouldRevealSelectionRef.current = false;
      setSelectedId('');
    }
  }, [visibleTasks, selectedId]);
  useLayoutEffect(() => {
    if (pendingScrollTopRef.current === null || !taskListRef.current) return;
    taskListRef.current.scrollTop = pendingScrollTopRef.current;
    pendingScrollTopRef.current = null;
  }, [tasks]);
  useEffect(() => {
    if (!shouldRevealSelectionRef.current) return;
    shouldRevealSelectionRef.current = false;
    const row = rowRefs.current.get(selectedId);
    if (typeof row?.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);
  useEffect(() => {
    if (!switchSession.active) return;
    const hasSwitchTarget = visibleTasks.some((task) => !task.isActive);
    if ((!visibleTasks.length || !hasSwitchTarget) && switchSession.commit && !loading) {
      setSwitchSession({ active: false, offset: 0, commit: false });
      window.taskWalker?.hideOverlay();
      return;
    }
    if (!visibleTasks.length || !hasSwitchTarget) return;
    const activeIndex = visibleTasks.findIndex((task) => task.isActive);
    const start = activeIndex >= 0 ? activeIndex : 0;
    const index = ((start + switchSession.offset) % visibleTasks.length + visibleTasks.length) % visibleTasks.length;
    const candidate = visibleTasks[index];
    if (selectedId !== candidate.id) {
      shouldRevealSelectionRef.current = true;
      setSelectedId(candidate.id);
      return;
    }
    if (!switchSession.commit || loading || switchCommittedRef.current) return;
    switchCommittedRef.current = true;
    setSwitchSession({ active: false, offset: 0, commit: false });
    void window.taskWalker?.activateWindow(candidate.hwnd).then((result) => {
      if (result.ok) window.taskWalker?.hideOverlay();
      else { switchCommittedRef.current = false; setToast(errorText(result.error)); }
    });
  }, [loading, selectedId, switchSession, visibleTasks]);

  async function activateTask(task: TaskItem) {
    if (!window.taskWalker?.activateWindow) {
      setToast(`「${task.title}」に切り替えました（ブラウザープレビュー）`);
      window.setTimeout(() => setToast(null), 900); return;
    }
    const result = await window.taskWalker.activateWindow(task.hwnd);
    if (result.ok) window.taskWalker.hideOverlay();
    else setToast(errorText(result.error));
  }

  async function closeTask(task: TaskItem) {
    if (!window.taskWalker?.closeWindow) { setTasks((current) => current.filter((item) => item.id !== task.id)); return; }
    const result = await window.taskWalker.closeWindow(task.hwnd);
    if (!result.ok) setToast(errorText(result.error));
    else { setToast('ウィンドウへ終了を要求しました'); window.setTimeout(() => { setToast(null); void refreshTasks(); }, 350); }
  }

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); view === 'settings' ? openView('list') : window.taskWalker?.hideOverlay(); return; }
      if (view !== 'list') return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); if (!visibleTasks.length) return;
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        if (switchSession.active) {
          setSwitchSession((current) => current.active ? { ...current, offset: current.offset + delta } : current);
          return;
        }
        const current = Math.max(0, visibleTasks.findIndex((task) => task.id === selectedTask?.id));
        shouldRevealSelectionRef.current = true;
        setSelectedId(visibleTasks[(current + delta + visibleTasks.length) % visibleTasks.length].id); return;
      }
      if (matchesShortcut(event, settings.shortcuts.close)) { event.preventDefault(); if (selectedTask) void closeTask(selectedTask); }
      else if (matchesShortcut(event, settings.shortcuts.settings)) { event.preventDefault(); openView('settings'); }
      else if (matchesShortcut(event, settings.shortcuts.activate)) { event.preventDefault(); if (selectedTask) void activateTask(selectedTask); }
    }
    window.addEventListener('keydown', handleKeyboard); return () => window.removeEventListener('keydown', handleKeyboard);
  }, [openView, selectedTask, settings, switchSession.active, view, visibleTasks]);

  function changeSort(sortMode: SortMode) { const next = { ...settings, sortMode }; setSettings(next); setDraft(next); setSortOpen(false); void window.taskWalker?.saveSettings(next); }
  function toggleSortDirection() {
    const direction: SortDirection = settings.sortDirections[settings.sortMode] === 'asc' ? 'desc' : 'asc';
    const next = { ...settings, sortDirections: { ...settings.sortDirections, [settings.sortMode]: direction } };
    setSettings(next); setDraft(next); void window.taskWalker?.saveSettings(next);
  }
  function updateShortcut(name: ShortcutName, value: string) { setDraft((current) => ({ ...current, shortcuts: { ...current.shortcuts, [name]: value } })); setSaveError(null); }
  async function saveDraft() {
    if (!validateShortcutSet(draft.shortcuts)) { setSaveError('同じショートカットが重複しています。'); return; }
    const result = window.taskWalker ? await window.taskWalker.saveSettings(draft) : { ok: true as const, settings: draft };
    if (!result.ok) { setSaveError(result.message); return; }
    setSettings(result.settings); setDraft(result.settings); setToast('設定を保存しました'); setTimeout(() => setToast(null), 1_800);
  }

  const emptyCopy = loading ? ['ウィンドウを読み込んでいます…', ''] : listError ? ['ウィンドウ一覧を取得できません', listError] : query ? ['一致するウィンドウがありません', '別のキーワードで検索してください。'] : ['表示できるウィンドウがありません', 'ウィンドウを開くと自動的に表示されます。'];

  return <main className="app-shell" data-theme={theme}>
    {view === 'list' ? <>
      <header className="search-header">
        <button className="icon-button back-button" aria-label="閉じる" onClick={() => window.taskWalker?.hideOverlay()}><ArrowLeft20Regular /></button>
        <Window20Regular className="window-glyph" aria-hidden="true" /><Search20Regular className="search-glyph" aria-hidden="true" />
        <input
          ref={inputRef}
          value={query}
          onFocus={() => {
            shouldFocusSearchRef.current = true;
            switchCommittedRef.current = false;
            setSwitchSession((current) => current.active ? { active: false, offset: 0, commit: false } : current);
          }}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="開いているウィンドウを検索してください…"
          aria-label="開いているウィンドウを検索"
          spellCheck={false}
        />
        {query && <button className="icon-button clear-button" aria-label="検索を消去" onClick={() => setQuery('')}><Dismiss16Regular /></button>}
        <div className="sort-control">
          <button className="sort-button sort-mode-button" onClick={() => setSortOpen((open) => !open)} aria-haspopup="menu" aria-expanded={sortOpen}><ArrowSort20Regular /><span>{sortLabels[settings.sortMode]}</span></button>
          <button className="sort-button direction-button" onClick={toggleSortDirection} aria-label={`${sortLabels[settings.sortMode]}を${settings.sortDirections[settings.sortMode] === 'asc' ? '降順' : '昇順'}に変更`} title={settings.sortDirections[settings.sortMode] === 'asc' ? '昇順' : '降順'}>{settings.sortDirections[settings.sortMode] === 'asc' ? <ArrowSortUp20Regular /> : <ArrowSortDown20Regular />}</button>
          {sortOpen && <div className="sort-menu" role="menu">{(Object.keys(sortLabels) as SortMode[]).map((mode) => <button key={mode} role="menuitemradio" aria-checked={settings.sortMode === mode} onClick={() => changeSort(mode)}><span>{sortLabels[mode]}</span><span className="sort-menu-state">{settings.sortDirections[mode] === 'asc' ? <ArrowSortUp20Regular /> : <ArrowSortDown20Regular />}{settings.sortMode === mode && <Checkmark16Regular />}</span></button>)}</div>}
        </div>
      </header>
      <section ref={taskListRef} className="task-list" role="listbox" aria-label="開いているタスク" tabIndex={-1}>
        {visibleTasks.length ? visibleTasks.map((task) => <div
          role="option"
          aria-selected={task.id === selectedTask?.id}
          aria-label={`${task.title}、実行中: ${task.processName}${task.isActive ? '、現在表示中' : ''}`}
          key={task.id}
          ref={(element) => { if (element) rowRefs.current.set(task.id, element); else rowRefs.current.delete(task.id); }}
          className={`task-row ${task.id === selectedTask?.id ? 'selected' : ''} ${switchSession.active && task.id === selectedTask?.id ? 'switch-target' : ''} ${task.isActive ? 'active-window' : ''}`}
          onMouseEnter={() => {
            if (switchSession.active) return;
            shouldRevealSelectionRef.current = false;
            setSelectedId(task.id);
          }}
          onClick={() => void activateTask(task)}
        >
          <AppIcon task={task} /><span className="task-title">{task.title}</span><span className="process-name">実行中: {task.processName}</span>
          {task.isActive && <span className="active-status">表示中</span>}
          <button type="button" className="row-close" aria-label={`${task.title}を閉じる`} onClick={(event) => { event.stopPropagation(); void closeTask(task); }}><Dismiss16Regular /></button>
        </div>) : <div className="empty-state"><Search20Regular /><strong>{emptyCopy[0]}</strong>{emptyCopy[1] && <span>{emptyCopy[1]}</span>}{listError && <button className="secondary-button" onClick={() => { setLoading(true); void refreshTasks(); }}>再試行</button>}</div>}
      </section>
      <footer className="command-footer"><span className="brand-name">Task Walker</span><div className="command-list">
        <button onClick={() => selectedTask && void activateTask(selectedTask)}>切り替え <ShortcutBadge value={settings.shortcuts.activate} /></button>
        <button onClick={() => selectedTask && void closeTask(selectedTask)}>ウィンドウを閉じる <ShortcutBadge value={settings.shortcuts.close} /></button>
        <button onClick={() => openView('settings')}><Settings20Regular /> 設定 <ShortcutBadge value={settings.shortcuts.settings} /></button>
      </div></footer>
    </> : <SettingsView draft={draft} saveError={saveError} onBack={() => openView('list')} onChange={updateShortcut} onReset={() => { setDraft(defaultSettings); setSaveError(null); }} onSave={() => void saveDraft()} />}
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;
}

function ShortcutBadge({ value }: { value: string }) { return <span className="shortcut-badge">{value.replace('Control', 'Ctrl').replaceAll('+', ' + ')}</span>; }

function SettingsView({ draft, saveError, onBack, onChange, onReset, onSave }: { draft: AppSettings; saveError: string | null; onBack: () => void; onChange: (name: ShortcutName, value: string) => void; onReset: () => void; onSave: () => void; }) {
  const duplicate = !validateShortcutSet(draft.shortcuts);
  return <section className="settings-view"><header className="settings-header"><button className="icon-button" onClick={onBack} aria-label="一覧に戻る"><ArrowLeft20Regular /></button><Settings20Regular /><div><h1>ショートカットの設定</h1><p>Task Walkerの主要操作に使うキーを変更できます。</p></div></header>
    <div className="settings-body">{shortcutLabels.map(({ key, label, description }) => <ShortcutRecorder key={key} label={label} description={description} value={draft.shortcuts[key]} onChange={(value) => onChange(key, value)} error={duplicate ? 'ほかの操作と重複しています' : undefined} />)}{saveError && <div className="save-error" role="alert"><Dismiss16Regular />{saveError}</div>}</div>
    <footer className="settings-footer"><button className="secondary-button" onClick={onReset}>既定に戻す</button><button className="primary-button" onClick={onSave} disabled={duplicate}>保存</button></footer>
  </section>;
}
