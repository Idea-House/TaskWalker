import { Code24Filled, DocumentTable24Filled, Folder24Filled, Globe24Filled, Window24Filled } from '@fluentui/react-icons';
import { siGooglechrome } from 'simple-icons';
import type { TaskItem } from '../types';

export function AppIcon({ task }: { task: TaskItem }) {
  if (task.iconDataUrl) return <img className="app-icon native-app-icon" src={task.iconDataUrl} alt="" draggable={false} />;
  const icon = task.fallbackIcon;
  if (icon === 'chrome') return <span className="app-icon brand-icon chrome-icon" style={{ color: `#${siGooglechrome.hex}` }}><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d={siGooglechrome.path} /></svg></span>;
  if (icon === 'excel') return <span className="app-icon excel-icon"><DocumentTable24Filled /></span>;
  if (icon === 'edge') return <span className="app-icon edge-icon"><Globe24Filled /></span>;
  if (icon === 'vscode') return <span className="app-icon vscode-icon"><Code24Filled /></span>;
  if (icon === 'terminal') return <span className="app-icon terminal-icon"><Window24Filled /></span>;
  return <span className="app-icon explorer-icon"><Folder24Filled /></span>;
}
