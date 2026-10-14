import { describe, expect, it } from 'vitest';
import { CacheEvent, CacheState, EngineCommand, EngineSnapshot, Strategy } from './models';
import { applyCommand, createInitialState, hitRate, runCommand, usedCapacity } from './engine';
import { comparePriority, priorityOrder } from './priority';
import { GUIDED_CAPACITY, GUIDED_STEPS } from './guided-example';

function runAll(
  commands: readonly EngineCommand[],
  strategy: Strategy = 'FIFO',
  capacity = 10,
): EngineSnapshot {
  let snapshot: EngineSnapshot = { state: createInitialState(strategy, capacity), events: [] };
  for (const command of commands) {
    const outcome = runCommand(snapshot, command);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      throw new Error(JSON.stringify(outcome.issues));
    }
    snapshot = outcome.snapshot;
  }
  return snapshot;
}

function runGuided(strategy: Strategy): EngineSnapshot {
  return runAll(
    GUIDED_STEPS.map((step) => step.command),
    strategy,
    GUIDED_CAPACITY,
  );
}

function keysOf(state: CacheState): readonly string[] {
  return state.entries.map((entry) => entry.key);
}

function lastEvent(snapshot: EngineSnapshot): CacheEvent {
  const event = snapshot.events[0];
  if (event === undefined) {
    throw new Error('Expected at least one event');
  }
  return event;
}

describe('insertion', () => {
  it('inserts without eviction while there is free space', () => {
    const snapshot = runAll([
      { type: 'add', key: 'A', size: 3 },
      { type: 'add', key: 'B', size: 4 },
    ]);
    expect(keysOf(snapshot.state)).toEqual(['A', 'B']);
    expect(usedCapacity(snapshot.state)).toBe(7);
    expect(snapshot.state.evictions).toBe(0);
  });

  it('allows an exact-capacity fit', () => {
    const snapshot = runAll([
      { type: 'add', key: 'A', size: 4 },
      { type: 'add', key: 'B', size: 6 },
    ]);
    expect(usedCapacity(snapshot.state)).toBe(10);
    expect(snapshot.state.evictions).toBe(0);
  });

  it('keeps used capacity at or below capacity', () => {
    const snapshot = runAll(
      [
        { type: 'add', key: 'A', size: 4 },
        { type: 'add', key: 'B', size: 4 },
        { type: 'add', key: 'C', size: 4 },
        { type: 'add', key: 'D', size: 4 },
        { type: 'add', key: 'E', size: 7 },
      ],
      'LRU',
    );
    expect(usedCapacity(snapshot.state)).toBeLessThanOrEqual(snapshot.state.capacity);
  });
});

describe('eviction ordering', () => {
  it('evicts multiple items in priority order until the item fits', () => {
    const snapshot = runAll([
      { type: 'add', key: 'A', size: 3 },
      { type: 'add', key: 'B', size: 3 },
      { type: 'add', key: 'C', size: 3 },
      { type: 'add', key: 'D', size: 6 },
    ]);
    const event = lastEvent(snapshot);
    expect(event.kind).toBe('insert');
    if (event.kind !== 'insert') {
      return;
    }
    expect(event.evictions.map((eviction) => eviction.key)).toEqual(['A', 'B']);
    expect(usedCapacity(snapshot.state)).toBe(9);
  });

  it('does not select the incoming item as its own victim', () => {
    const snapshot = runAll(
      [
        { type: 'add', key: 'A', size: 5 },
        { type: 'add', key: 'B', size: 5 },
        { type: 'add', key: 'C', size: 10 },
      ],
      'LFU',
    );
    expect(keysOf(snapshot.state)).toEqual(['C']);
  });

  it('uses the same priority order as the next real eviction', () => {
    const base = runAll([
      { type: 'add', key: 'A', size: 3 },
      { type: 'add', key: 'B', size: 3 },
      { type: 'add', key: 'C', size: 3 },
    ]);
    const predicted = priorityOrder(base.state.entries, base.state.strategy)[0];
    const after = runAll(
      [
        { type: 'add', key: 'A', size: 3 },
        { type: 'add', key: 'B', size: 3 },
        { type: 'add', key: 'C', size: 3 },
        { type: 'add', key: 'D', size: 10 },
      ],
      'FIFO',
    );
    const event = lastEvent(after);
    expect(event.kind).toBe('insert');
    if (event.kind !== 'insert') {
      return;
    }
    expect(event.evictions[0]?.key).toBe(predicted?.key);
  });

  it('ignores accesses under FIFO', () => {
    const snapshot = runAll([
      { type: 'add', key: 'A', size: 4 },
      { type: 'add', key: 'B', size: 4 },
      { type: 'access', key: 'A' },
      { type: 'access', key: 'A' },
    ]);
    expect(priorityOrder(snapshot.state.entries, 'FIFO')[0]?.key).toBe('A');
  });

  it('moves accessed entries later in LRU priority', () => {
    const snapshot = runAll([
      { type: 'add', key: 'A', size: 4 },
      { type: 'add', key: 'B', size: 4 },
      { type: 'access', key: 'A' },
    ]);
    expect(priorityOrder(snapshot.state.entries, 'LRU')[0]?.key).toBe('B');
  });

  it('honors LFU frequency and tie-breakers', () => {
    const snapshot = runAll([
      { type: 'add', key: 'A', size: 3 },
      { type: 'add', key: 'B', size: 3 },
      { type: 'add', key: 'C', size: 3 },
      { type: 'access', key: 'C' },
      { type: 'access', key: 'B' },
    ]);
    expect(priorityOrder(snapshot.state.entries, 'LFU')[0]?.key).toBe('A');
    const withoutA = snapshot.state.entries.filter((entry) => entry.key !== 'A');
    expect(priorityOrder(withoutA, 'LFU')[0]?.key).toBe('C');
  });
});

describe('validation', () => {
  const commands: readonly EngineCommand[] = [
    { type: 'add', key: '', size: 3 },
    { type: 'add', key: '   ', size: 3 },
    { type: 'add', key: 'A', size: 0 },
    { type: 'add', key: 'A', size: 101 },
    { type: 'add', key: 'A', size: 11 },
    { type: 'access', key: '' },
  ];

  it.each(commands)('rejects an invalid operation without changing state (%o)', (command) => {
    const before = runAll([{ type: 'add', key: 'A', size: 3 }]);
    const level: EngineSnapshot = { state: before.state, events: before.events };
    const outcome = runCommand(level, command);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      throw new Error('Expected command rejection');
    }
    expect(outcome.issues.length).toBeGreaterThan(0);
    expect(outcome.snapshot).toBe(level);
    expect(outcome.snapshot.state.step).toBe(before.state.step);
    expect(outcome.snapshot.events).toBe(before.events);
  });

  it('rejects a duplicate resident key', () => {
    const before = runAll([{ type: 'add', key: 'A', size: 3 }]);
    const result = applyCommand(before.state, { type: 'add', key: 'A', size: 2 });
    expect(result.ok).toBe(false);
    expect(before.state.entries).toHaveLength(1);
    expect(before.state.step).toBe(1);
  });

  it('treats a rejected oversized insertion as not evicting anything', () => {
    const before = runAll([
      { type: 'add', key: 'A', size: 3 },
      { type: 'add', key: 'B', size: 3 },
    ]);
    const result = applyCommand(before.state, { type: 'add', key: 'C', size: 11 });
    expect(result.ok).toBe(false);
    expect(keysOf(before.state)).toEqual(['A', 'B']);
    expect(before.state.evictions).toBe(0);
  });

  it('handles the key "__proto__" as an ordinary key', () => {
    const snapshot = runAll([
      { type: 'add', key: '__proto__', size: 3 },
      { type: 'access', key: '__proto__' },
    ]);
    expect(keysOf(snapshot.state)).toEqual(['__proto__']);
    expect(snapshot.state.hits).toBe(1);
  });
});

describe('access', () => {
  it('counts a resident access as a hit and updates recency and frequency', () => {
    const snapshot = runAll([
      { type: 'add', key: 'A', size: 3 },
      { type: 'access', key: 'A' },
    ]);
    expect(snapshot.state.hits).toBe(1);
    expect(snapshot.state.misses).toBe(0);
    const entry = snapshot.state.entries[0];
    expect(entry?.accessCount).toBe(1);
    expect(entry?.lastAccessStep).toBe(2);
    expect(entry?.insertionStep).toBe(1);
  });

  it('counts a missing access as a miss without inserting anything', () => {
    const snapshot = runAll([
      { type: 'add', key: 'A', size: 3 },
      { type: 'access', key: 'Z' },
    ]);
    expect(snapshot.state.misses).toBe(1);
    expect(snapshot.state.hits).toBe(0);
    expect(keysOf(snapshot.state)).toEqual(['A']);
  });

  it('updates frequency and recency under every strategy', () => {
    const snapshot = runAll(
      [
        { type: 'add', key: 'A', size: 3 },
        { type: 'add', key: 'B', size: 3 },
        { type: 'access', key: 'A' },
      ],
      'FIFO',
    );
    const entry = snapshot.state.entries.find((candidate) => candidate.key === 'A');
    expect(entry?.accessCount).toBe(1);
    expect(entry?.lastAccessStep).toBe(3);
  });

  it('gives an evicted-and-reinserted key fresh metadata', () => {
    const snapshot = runAll([
      { type: 'add', key: 'A', size: 6 },
      { type: 'add', key: 'B', size: 5 },
      { type: 'add', key: 'A', size: 5 },
    ]);
    const entry = snapshot.state.entries.find((candidate) => candidate.key === 'A');
    expect(entry?.insertionStep).toBe(3);
    expect(entry?.accessCount).toBe(0);
  });
});

describe('strategy changes', () => {
  it('preserves entries and counters while recalculating priority', () => {
    const snapshot = runAll([
      { type: 'add', key: 'A', size: 3 },
      { type: 'add', key: 'B', size: 3 },
      { type: 'access', key: 'A' },
      { type: 'setStrategy', strategy: 'LRU' },
    ]);
    expect(snapshot.state.strategy).toBe('LRU');
    expect(keysOf(snapshot.state)).toEqual(['A', 'B']);
    expect(snapshot.state.hits).toBe(1);
    expect(snapshot.state.step).toBe(4);
    expect(priorityOrder(snapshot.state.entries, 'LRU')[0]?.key).toBe('B');
  });

  it('is a no-op when selecting the current strategy', () => {
    const before = runAll([{ type: 'add', key: 'A', size: 3 }]);
    const outcome = runCommand(before, { type: 'setStrategy', strategy: 'FIFO' });
    expect(outcome.snapshot.state.step).toBe(before.state.step);
    expect(outcome.snapshot.events).toBe(before.events);
  });

  it('locks capacity after the first accepted operation and allows it after reset', () => {
    const advanced = runAll([{ type: 'add', key: 'A', size: 3 }]);
    const locked = applyCommand(advanced.state, { type: 'setCapacity', capacity: 20 });
    expect(locked.ok).toBe(false);

    const reset = applyCommand(advanced.state, { type: 'reset' });
    expect(reset.ok).toBe(true);
    if (!reset.ok) {
      return;
    }
    const applied = applyCommand(reset.state, { type: 'setCapacity', capacity: 20 });
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    expect(applied.state.capacity).toBe(20);
  });
});

describe('hit rate', () => {
  it('is null before the first access and a value afterward', () => {
    const initial = createInitialState();
    expect(hitRate(initial)).toBeNull();
    const afterAccess = runAll([
      { type: 'add', key: 'A', size: 3 },
      { type: 'access', key: 'A' },
      { type: 'access', key: 'Z' },
    ]);
    expect(hitRate(afterAccess.state)).toBe(0.5);
  });
});

describe('reset and immutability', () => {
  it('does not mutate the input state', () => {
    const before = runAll([
      { type: 'add', key: 'A', size: 3 },
      { type: 'add', key: 'B', size: 3 },
    ]);
    const entriesBefore = before.state.entries;
    const firstBefore = before.state.entries[0];
    applyCommand(before.state, { type: 'add', key: 'C', size: 3 });
    expect(before.state.entries).toBe(entriesBefore);
    expect(before.state.entries[0]).toBe(firstBefore);
    expect(keysOf(before.state)).toEqual(['A', 'B']);
  });

  it('clears state but keeps strategy and capacity on reset', () => {
    const before = runAll([{ type: 'add', key: 'A', size: 3 }], 'LFU', 12);
    const outcome = runCommand(before, { type: 'reset' });
    expect(outcome).toMatchObject({ ok: true, event: null });
    expect(outcome.snapshot.state.entries).toEqual([]);
    expect(outcome.snapshot.state.step).toBe(0);
    expect(outcome.snapshot.state.hits).toBe(0);
    expect(outcome.snapshot.state.evictions).toBe(0);
    expect(outcome.snapshot.state.strategy).toBe('LFU');
    expect(outcome.snapshot.state.capacity).toBe(12);
    expect(outcome.snapshot.events).toEqual([]);
  });

  it('keeps only the latest 50 events without resetting lifetime counters', () => {
    const commands: EngineCommand[] = [];
    for (let index = 0; index < 60; index += 1) {
      commands.push({ type: 'access', key: `missing-${index}` });
    }
    const snapshot = runAll(commands);
    expect(snapshot.events).toHaveLength(50);
    expect(snapshot.events[0]?.step).toBe(60);
    expect(snapshot.state.misses).toBe(60);
    expect(snapshot.state.step).toBe(60);
  });
});

describe('guided example', () => {
  it('produces the expected outcomes under FIFO', () => {
    const snapshot = runGuided('FIFO');
    const event = lastEvent(snapshot);
    expect(event.kind).toBe('insert');
    if (event.kind !== 'insert') {
      return;
    }
    expect(event.evictions.map((eviction) => eviction.key)).toEqual(['A']);
    expect(usedCapacity(snapshot.state)).toBe(10);
  });

  it('produces the expected outcomes under LRU', () => {
    const snapshot = runGuided('LRU');
    const event = lastEvent(snapshot);
    expect(event.kind).toBe('insert');
    if (event.kind !== 'insert') {
      return;
    }
    expect(event.evictions.map((eviction) => eviction.key)).toEqual(['A']);
    expect(keysOf(snapshot.state)).toEqual(['B', 'C', 'D']);
  });

  it('produces the expected outcomes under LFU', () => {
    const snapshot = runGuided('LFU');
    const event = lastEvent(snapshot);
    expect(event.kind).toBe('insert');
    if (event.kind !== 'insert') {
      return;
    }
    expect(event.evictions.map((eviction) => eviction.key)).toEqual(['B']);
    expect(keysOf(snapshot.state)).toEqual(['A', 'C', 'D']);
  });

  it.each(['FIFO', 'LRU', 'LFU'] as const)(
    'reports 4 hits, 0 misses and 100%% under %s',
    (strategy) => {
      const snapshot = runGuided(strategy);
      expect(snapshot.state.hits).toBe(4);
      expect(snapshot.state.misses).toBe(0);
      expect(hitRate(snapshot.state)).toBe(1);
      expect(snapshot.state.evictions).toBe(1);
      expect(usedCapacity(snapshot.state)).toBe(10);
    },
  );
});

describe('command outcomes', () => {
  it('returns only the newly produced event when the history is already capped', () => {
    const before = runAll(
      Array.from({ length: 51 }, (_, index): EngineCommand => ({
        type: 'access',
        key: `missing-${index}`,
      })),
    );
    const outcome = runCommand(before, { type: 'add', key: 'A', size: 3 });

    expect(outcome).toMatchObject({
      ok: true,
      event: { kind: 'insert', key: 'A', step: 52 },
    });
    expect(outcome.snapshot.events).toHaveLength(50);
    if (!outcome.ok) {
      throw new Error('Expected command success');
    }
    expect(outcome.event).toBe(outcome.snapshot.events[0]);
    expect(before.events[0]?.step).toBe(51);
  });

  it('returns no event for an accepted strategy no-op with existing history', () => {
    const before = runAll([{ type: 'add', key: 'A', size: 3 }]);
    const outcome = runCommand(before, { type: 'setStrategy', strategy: 'FIFO' });

    expect(outcome).toMatchObject({ ok: true, event: null });
    expect(outcome.snapshot.state).toBe(before.state);
    expect(outcome.snapshot.events).toBe(before.events);
  });

  it('reports successful capacity application without producing an event', () => {
    const before: EngineSnapshot = { state: createInitialState(), events: [] };
    const outcome = runCommand(before, { type: 'setCapacity', capacity: 20 });

    expect(outcome).toMatchObject({ ok: true, event: null });
    expect(outcome.snapshot.state.capacity).toBe(20);
    expect(outcome.snapshot.state.step).toBe(0);
    expect(outcome.snapshot.events).toBe(before.events);
    expect(before.state.capacity).toBe(10);
  });

  it.each([
    { type: 'add', key: 'A', size: 3 },
    { type: 'add', key: 'C', size: 11 },
    { type: 'access', key: '' },
  ] satisfies readonly EngineCommand[])(
    'reports rejection without mutating a frozen snapshot and permits recovery (%o)',
    (command) => {
      const initial = runAll([
        { type: 'add', key: 'A', size: 5 },
        { type: 'add', key: 'B', size: 5 },
      ]);
      const before: EngineSnapshot = Object.freeze({
        state: Object.freeze({
          ...initial.state,
          entries: Object.freeze(initial.state.entries.map((entry) => Object.freeze(entry))),
        }),
        events: Object.freeze(initial.events),
      });
      const saved = structuredClone(before);
      const outcome = runCommand(before, command);

      expect(outcome).toMatchObject({ ok: false, issues: expect.any(Array) });
      expect(outcome.snapshot).toBe(before);
      expect(before).toEqual(saved);
      expect(before.state.evictions).toBe(0);

      const recovered = runCommand(outcome.snapshot, { type: 'access', key: 'A' });
      expect(recovered).toMatchObject({
        ok: true,
        event: { kind: 'access', key: 'A', result: 'hit', step: 3 },
      });
      expect(recovered.snapshot.state.hits).toBe(1);
      expect(recovered.snapshot.events).toHaveLength(3);
      expect(before).toEqual(saved);
    },
  );
});

describe('unhandled union members', () => {
  it('throws for an unknown command without resetting caller-owned state and allows a valid command afterward', () => {
    const before = runAll([{ type: 'add', key: 'A', size: 3 }]);
    const saved = structuredClone(before);

    expect(() =>
      Reflect.apply(applyCommand, undefined, [before.state, { type: 'unknown' }]),
    ).toThrow();
    expect(before).toEqual(saved);

    const recovered = runCommand(before, { type: 'access', key: 'A' });
    expect(recovered).toMatchObject({
      ok: true,
      event: { kind: 'access', result: 'hit', step: 2 },
    });
    expect(recovered.snapshot.state.entries).toHaveLength(1);
    expect(before).toEqual(saved);
  });

  it('throws for an unknown strategy instead of applying LFU and preserves valid priority behavior', () => {
    const before = runAll([
      { type: 'add', key: 'A', size: 3 },
      { type: 'add', key: 'B', size: 3 },
      { type: 'access', key: 'A' },
    ]);
    const first = before.state.entries[0];
    const second = before.state.entries[1];
    if (first === undefined || second === undefined) {
      throw new Error('Expected two resident entries');
    }
    const saved = structuredClone(before);

    expect(() => Reflect.apply(comparePriority, undefined, ['unknown', first, second])).toThrow();
    expect(before).toEqual(saved);
    expect(comparePriority('FIFO', first, second)).toBeLessThan(0);
    expect(comparePriority('LRU', first, second)).toBeGreaterThan(0);
    expect(comparePriority('LFU', first, second)).toBeGreaterThan(0);
  });
});
