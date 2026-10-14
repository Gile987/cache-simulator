import type { CacheEntry, Strategy } from './models';
import { assertNever } from './assert-never';

function compareKeys(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

export function comparePriority(strategy: Strategy, a: CacheEntry, b: CacheEntry): number {
  switch (strategy) {
    case 'FIFO':
      return a.insertionStep - b.insertionStep || compareKeys(a.key, b.key);
    case 'LRU':
      return (
        a.lastAccessStep - b.lastAccessStep ||
        a.insertionStep - b.insertionStep ||
        compareKeys(a.key, b.key)
      );
    case 'LFU':
      return (
        a.accessCount - b.accessCount ||
        a.lastAccessStep - b.lastAccessStep ||
        a.insertionStep - b.insertionStep ||
        compareKeys(a.key, b.key)
      );
    default:
      return assertNever(strategy);
  }
}

export function priorityOrder(
  entries: readonly CacheEntry[],
  strategy: Strategy,
): readonly CacheEntry[] {
  return [...entries].sort((a, b) => comparePriority(strategy, a, b));
}

export function evictionReason(strategy: Strategy, entry: CacheEntry): string {
  switch (strategy) {
    case 'FIFO':
      return 'it was added before every other resident item';
    case 'LRU':
      return 'it was the least recently accessed item';
    case 'LFU':
      return `it had the fewest accesses (${entry.accessCount})`;
    default:
      return assertNever(strategy);
  }
}
