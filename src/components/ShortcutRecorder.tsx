import { useState, type KeyboardEvent } from 'react';
import { Dismiss16Regular, Keyboard24Regular } from '@fluentui/react-icons';

interface Props {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function ShortcutRecorder({ label, description, value, onChange, error }: Props) {
  const [recording, setRecording] = useState(false);

  function record(event: KeyboardEvent<HTMLButtonElement>) {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      setRecording(false);
      return;
    }
    const candidate = windowEventToAccelerator(event.nativeEvent);
    if (candidate) {
      onChange(candidate);
      setRecording(false);
    }
  }

  return (
    <div className={`shortcut-row ${error ? 'has-error' : ''}`}>
      <div className="shortcut-copy">
        <span className="setting-label">{label}</span>
        <span className="setting-description">{description}</span>
      </div>
      <button
        type="button"
        className={`shortcut-recorder ${recording ? 'is-recording' : ''}`}
        onClick={() => setRecording(true)}
        onKeyDown={record}
        aria-label={`${label}のショートカット。現在は${value}`}
      >
        {recording ? <><Keyboard24Regular />キーを入力…<Dismiss16Regular /></> : value.split('+').map((key) => <kbd key={key}>{key}</kbd>)}
      </button>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

function windowEventToAccelerator(event: globalThis.KeyboardEvent) {
  const forbidden = ['Control', 'Shift', 'Alt', 'Meta', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'];
  if (forbidden.includes(event.key)) return null;
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Control');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Super');
  const key = event.key === ' ' ? 'Space' : event.key.length === 1 && /[a-z]/i.test(event.key) ? event.key.toUpperCase() : event.key;
  parts.push(key);
  return parts.join('+');
}
