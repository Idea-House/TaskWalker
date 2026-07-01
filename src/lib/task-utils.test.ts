import { describe, expect, it } from 'vitest';
import { initialTasks } from '../data/mockTasks';
import { filterTasks, sortTasks } from './task-utils';

describe('task utilities', () => {
  it('filters by title, app name, and process name', () => {
    expect(filterTasks(initialTasks, '交通費')).toHaveLength(1);
    expect(filterTasks(initialTasks, 'Google Chrome')).toHaveLength(1);
    expect(filterTasks(initialTasks, 'explorer.exe')).toHaveLength(2);
  });

  it('sorts by recent activity', () => {
    expect(sortTasks(initialTasks, 'recent', 'desc')[0].id).toBe('excel-1');
    expect(sortTasks(initialTasks, 'recent', 'asc')[0].id).toBe('excel-3');
  });

  it('keeps tasks from the same app adjacent in type mode', () => {
    const excel = sortTasks(initialTasks, 'type', 'asc').filter((task) => task.appName === 'Excel');
    expect(excel).toHaveLength(3);
  });

  it('reverses title and application sorting independently', () => {
    const titleAsc = sortTasks(initialTasks, 'title', 'asc');
    const titleDesc = sortTasks(initialTasks, 'title', 'desc');
    expect(titleDesc.map((task) => task.id)).toEqual([...titleAsc].reverse().map((task) => task.id));

    const typeAsc = sortTasks(initialTasks, 'type', 'asc');
    const typeDesc = sortTasks(initialTasks, 'type', 'desc');
    expect(typeDesc.map((task) => task.id)).toEqual([...typeAsc].reverse().map((task) => task.id));
  });
});
