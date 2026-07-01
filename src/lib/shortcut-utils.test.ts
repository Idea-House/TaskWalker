import { describe, expect, it } from 'vitest';
import { eventToAccelerator, validateShortcutSet } from './shortcut-utils';

describe('shortcut utilities', () => {
  it('normalizes keyboard input into an Electron accelerator', () => {
    expect(eventToAccelerator({ key: 'w', ctrlKey: false, altKey: true, shiftKey: false, metaKey: false })).toBe('Alt+W');
  });

  it('rejects modifier-only and reserved navigation keys', () => {
    expect(eventToAccelerator({ key: 'Control', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })).toBeNull();
    expect(eventToAccelerator({ key: 'ArrowDown', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBeNull();
  });

  it('detects duplicate shortcut assignments', () => {
    expect(validateShortcutSet({ one: 'Enter', two: 'enter' })).toBe(false);
  });
});
