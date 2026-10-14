import { CacheEntry, Strategy } from './models';

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
  if (strategy === 'FIFO') {
    return a.insertionStep - b.insertionStep || compareKeys(a.key, b.key);
  }
  if (strategy === 'LRU') {
    return (
      a.lastAccessStep - b.lastAccessStep ||
      a.insertionStep - b.insertionStep ||
      compareKeys(a.key, b.key)
    );
  }
  return (
    a.accessCount - b.accessCount ||
    a.lastAccessStep - b.lastAccessStep ||
    a.insertionStep - b.insertionStep ||
    compareKeys(a.key, b.key)
  );
}

export function priorityOrder(
  entries: readonly CacheEntry[],
  strategy: Strategy,
): readonly CacheEntry[] {
  return [...entries].sort((a, b) => comparePriority(strategy, a, b));
}

export function evictionReason(strategy: Strategy, entry: CacheEntry): string {
  if (strategy === 'FIFO') {
    return 'it was added before every other resident item';
  }
  if (strategy === 'LRU') {
    return 'it was the least recently accessed item';
  }
  return `it had the fewest accesses (${entry.accessCount})`;
}
