import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './tooltip.css';

declare global {
  interface Window {
    taskWalkerTooltip?: {
      onShow: (callback: (title: string) => void) => () => void;
      reportSize: (size: { width: number; height: number }) => void;
    };
  }
}

export default function TooltipApp() {
  const [title, setTitle] = useState(() => new URLSearchParams(window.location.search).get('title') ?? '');
  const [theme] = useState<'light' | 'dark'>(() => {
    const forced = new URLSearchParams(window.location.search).get('theme');
    if (forced === 'light' || forced === 'dark') return forced;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => window.taskWalkerTooltip?.onShow(setTitle), []);

  useLayoutEffect(() => {
    if (!title || !labelRef.current) return;
    const label = labelRef.current;
    const width = Math.min(560, Math.max(180, Math.ceil(label.scrollWidth + 28)));
    const height = Math.min(72, Math.max(40, Math.ceil(label.scrollHeight + 18)));
    window.taskWalkerTooltip?.reportSize({ width, height });
  }, [title]);

  return <div ref={labelRef} className="active-title-tooltip" data-theme={theme} role="tooltip">{title}</div>;
}
