import { describe, expect, it } from 'vitest';
import type { CacheEntry } from './models';
import { comparePriority, evictionReason, priorityOrder } from './priority';

type EntryOverrides = Partial<Omit<CacheEntry, 'key'>> & { readonly key: string };

function entry({ key, ...overrides }: EntryOverrides): CacheEntry {
  return {
    key,
    size: 1,
    insertionStep: 1,
    lastAccessStep: 1,
    accessCount: 0,
    ...overrides,
  };
}

describe('comparePriority', () => {
  it('orders FIFO by insertion step and breaks ties by key', () => {
    const earlier = entry({ key: 'Z', insertionStep: 1 });
    const later = entry({ key: 'A', insertionStep: 2 });
    expect(comparePriority('FIFO', earlier, later)).toBeLessThan(0);
    expect(comparePriority('FIFO', later, earlier)).toBeGreaterThan(0);

    const keyA = entry({ key: 'A', insertionStep: 1 });
    const keyB = entry({ key: 'B', insertionStep: 1 });
    expect(comparePriority('FIFO', keyA, keyB)).toBeLessThan(0);
    expect(comparePriority('FIFO', keyB, keyA)).toBeGreaterThan(0);
    expect(comparePriority('FIFO', keyA, keyA)).toBe(0);
  });

  it('orders LRU by last access, then insertion step, then key', () => {
    const olderAccess = entry({ key: 'A', insertionStep: 2, lastAccessStep: 1 });
    const newerAccess = entry({ key: 'B', insertionStep: 1, lastAccessStep: 2 });
    expect(comparePriority('LRU', olderAccess, newerAccess)).toBeLessThan(0);

    const insertedEarlier = entry({ key: 'Z', insertionStep: 1, lastAccessStep: 5 });
    const insertedLater = entry({ key: 'A', insertionStep: 2, lastAccessStep: 5 });
    expect(comparePriority('LRU', insertedEarlier, insertedLater)).toBeLessThan(0);

    const keyA = entry({ key: 'A', insertionStep: 1, lastAccessStep: 5 });
    const keyB = entry({ key: 'B', insertionStep: 1, lastAccessStep: 5 });
    expect(comparePriority('LRU', keyA, keyB)).toBeLessThan(0);
  });

  it('orders LFU by access count, then last access, then insertion step, then key', () => {
    const fewerAccesses = entry({ key: 'Z', accessCount: 1, lastAccessStep: 9, insertionStep: 9 });
    const moreAccesses = entry({ key: 'A', accessCount: 2, lastAccessStep: 1, insertionStep: 1 });
    expect(comparePriority('LFU', fewerAccesses, moreAccesses)).toBeLessThan(0);

    const olderAccess = entry({ key: 'Z', accessCount: 0, lastAccessStep: 1, insertionStep: 9 });
    const newerAccess = entry({ key: 'A', accessCount: 0, lastAccessStep: 2, insertionStep: 1 });
    expect(comparePriority('LFU', olderAccess, newerAccess)).toBeLessThan(0);

    const insertedEarlier = entry({
      key: 'Z',
      accessCount: 0,
      lastAccessStep: 1,
      insertionStep: 1,
    });
    const insertedLater = entry({ key: 'A', accessCount: 0, lastAccessStep: 1, insertionStep: 2 });
    expect(comparePriority('LFU', insertedEarlier, insertedLater)).toBeLessThan(0);

    const keyA = entry({ key: 'A', accessCount: 0, lastAccessStep: 1, insertionStep: 1 });
    const keyB = entry({ key: 'B', accessCount: 0, lastAccessStep: 1, insertionStep: 1 });
    expect(comparePriority('LFU', keyA, keyB)).toBeLessThan(0);
  });
});

describe('priorityOrder', () => {
  it('sorts ascending without mutating or returning the caller-owned array', () => {
    const entries: readonly CacheEntry[] = [
      entry({ key: 'B', insertionStep: 2 }),
      entry({ key: 'A', insertionStep: 1 }),
    ];
    const saved = structuredClone(entries);

    const ordered = priorityOrder(entries, 'FIFO');

    expect(ordered.map((candidate) => candidate.key)).toEqual(['A', 'B']);
    expect(ordered).not.toBe(entries);
    expect(entries).toEqual(saved);
  });
});

describe('evictionReason', () => {
  it('explains the strategy-specific reason', () => {
    expect(evictionReason('FIFO', entry({ key: 'A' }))).toBe(
      'it was added before every other resident item',
    );
    expect(evictionReason('LRU', entry({ key: 'A' }))).toBe(
      'it was the least recently accessed item',
    );
    expect(evictionReason('LFU', entry({ key: 'A', accessCount: 3 }))).toBe(
      'it had the fewest accesses (3)',
    );
  });
});
