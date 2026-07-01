import type { SortDirection, SortMode, TaskItem } from '../types';

const collator = new Intl.Collator('ja-JP', { numeric: true, sensitivity: 'base' });

export function filterTasks(tasks: TaskItem[], query: string) {
  const normalized = query.trim().toLocaleLowerCase('ja-JP');
  if (!normalized) return tasks;
  return tasks.filter((task) =>
    [task.title, task.appName, task.processName, task.executablePath]
      .some((value) => value.toLocaleLowerCase('ja-JP').includes(normalized)),
  );
}

export function sortTasks(tasks: TaskItem[], mode: SortMode, direction: SortDirection = mode === 'recent' ? 'desc' : 'asc') {
  const multiplier = direction === 'asc' ? 1 : -1;
  return [...tasks].sort((left, right) => {
    let comparison: number;
    if (mode === 'recent') comparison = left.lastActive - right.lastActive || collator.compare(left.title, right.title);
    else if (mode === 'title') comparison = collator.compare(left.title, right.title) || collator.compare(left.id, right.id);
    else comparison = collator.compare(left.appName, right.appName)
      || collator.compare(left.title, right.title)
      || collator.compare(left.id, right.id);
    return comparison * multiplier;
  });
}
