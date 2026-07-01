const modifierKeys = new Set(['Control', 'Shift', 'Alt', 'Meta']);
const reservedKeys = new Set(['Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

function normalizedKey(key: string) {
  if (key === ' ') return 'Space';
  if (key.length === 1 && /[a-z]/i.test(key)) return key.toUpperCase();
  return key;
}

export function eventToAccelerator(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>) {
  if (modifierKeys.has(event.key) || reservedKeys.has(event.key)) return null;
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Control');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Super');
  parts.push(normalizedKey(event.key));
  return parts.join('+');
}

export function matchesShortcut(event: KeyboardEvent, accelerator: string) {
  const actual = eventToAccelerator(event);
  return actual?.toLocaleLowerCase() === accelerator.toLocaleLowerCase();
}

export function validateShortcutSet<T extends object>(shortcuts: T) {
  const values = Object.values(shortcuts as Record<string, string>).map((item) => item.toLocaleLowerCase());
  return new Set(values).size === values.length;
}
