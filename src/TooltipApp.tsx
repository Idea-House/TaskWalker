import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './tooltip.css';

declare global {
  interface Window {
    taskWalkerTooltip?: {
      onShow: (callback: (notification: TooltipNotification) => void) => () => void;
      ready: () => void;
      reportSize: (size: { id: number; width: number; height: number }) => void;
    };
  }
}

type TooltipNotification = {
  id: number;
  text: string;
  kind: 'title' | 'copy' | 'error';
};

export default function TooltipApp() {
  const [notification, setNotification] = useState<TooltipNotification>(() => ({
    id: 0,
    text: new URLSearchParams(window.location.search).get('title') ?? '',
    kind: 'title',
  }));
  const [theme] = useState<'light' | 'dark'>(() => {
    const forced = new URLSearchParams(window.location.search).get('theme');
    if (forced === 'light' || forced === 'dark') return forced;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = window.taskWalkerTooltip?.onShow(setNotification);
    window.taskWalkerTooltip?.ready();
    return unsubscribe;
  }, []);

  useLayoutEffect(() => {
    if (!notification.text || !labelRef.current) return;
    const label = labelRef.current;
    const width = Math.min(560, Math.max(180, Math.ceil(label.scrollWidth + 28)));
    const height = Math.min(72, Math.max(40, Math.ceil(label.scrollHeight + 18)));
    window.taskWalkerTooltip?.reportSize({ id: notification.id, width, height });
  }, [notification]);

  return <div ref={labelRef} className="active-title-tooltip" data-theme={theme} data-kind={notification.kind} role="tooltip">{notification.text}</div>;
}
