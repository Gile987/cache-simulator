import {
  AccessEvent,
  CacheEntry,
  CacheEvent,
  CacheState,
  EngineCommand,
  EngineResult,
  EngineSnapshot,
  EvictionRecord,
  InsertEvent,
  Strategy,
  ValidationIssue,
} from './models';
import { evictionReason, priorityOrder } from './priority';
import { MAX_KEY_LENGTH, MAX_VALUE, MIN_VALUE, normalizeKey, validateKey } from './validation';
import { assertNever } from './assert-never';

export const MAX_EVENTS = 50;

export function createInitialState(strategy: Strategy = 'FIFO', capacity = 10): CacheState {
  return { strategy, capacity, step: 0, entries: [], hits: 0, misses: 0, evictions: 0 };
}

export function usedCapacity(state: CacheState): number {
  return state.entries.reduce((total, entry) => total + entry.size, 0);
}

export function hitRate(state: CacheState): number | null {
  const total = state.hits + state.misses;
  if (total === 0) {
    return null;
  }
  return state.hits / total;
}

export function appendEvent(
  events: readonly CacheEvent[],
  event: CacheEvent | null,
): readonly CacheEvent[] {
  if (event === null) {
    return events;
  }
  return [event, ...events].slice(0, MAX_EVENTS);
}

function applyAdd(state: CacheState, rawKey: string, size: number): EngineResult {
  const keyIssue = validateKey(rawKey);
  if (keyIssue !== null) {
    return { ok: false, state, issues: [keyIssue] };
  }
  const key = normalizeKey(rawKey);

  if (!Number.isSafeInteger(size) || size < MIN_VALUE || size > MAX_VALUE) {
    const message = `Size must be a whole number between ${MIN_VALUE} and ${MAX_VALUE}.`;
    return { ok: false, state, issues: [{ field: 'size', message }] };
  }
  if (size > state.capacity) {
    return {
      ok: false,
      state,
      issues: [
        { field: 'size', message: `Item is larger than the ${state.capacity}-unit capacity.` },
      ],
    };
  }
  if (state.entries.some((entry) => entry.key === key)) {
    return {
      ok: false,
      state,
      issues: [{ field: 'key', message: `"${key}" is already in the cache.` }],
    };
  }

  const operationStep = state.step + 1;
  const residents = [...state.entries];
  const evictions: EvictionRecord[] = [];
  let used = residents.reduce((total, entry) => total + entry.size, 0);

  while (used + size > state.capacity) {
    const victim = priorityOrder(residents, state.strategy)[0];
    if (victim === undefined) {
      break;
    }
    const index = residents.findIndex((entry) => entry.key === victim.key);
    residents.splice(index, 1);
    used -= victim.size;
    evictions.push({
      key: victim.key,
      size: victim.size,
      reason: evictionReason(state.strategy, victim),
      accessCount: victim.accessCount,
      insertionStep: victim.insertionStep,
      lastAccessStep: victim.lastAccessStep,
    });
  }

  const inserted: CacheEntry = {
    key,
    size,
    insertionStep: operationStep,
    lastAccessStep: operationStep,
    accessCount: 0,
  };
  residents.push(inserted);

  const nextState: CacheState = {
    ...state,
    step: operationStep,
    entries: residents,
    evictions: state.evictions + evictions.length,
  };

  const event: InsertEvent = {
    kind: 'insert',
    step: operationStep,
    key,
    size,
    evictions,
    used: used + size,
    capacity: state.capacity,
  };

  return { ok: true, state: nextState, event };
}

function applyAccess(state: CacheState, rawKey: string): EngineResult {
  const keyIssue = validateKey(rawKey);
  if (keyIssue !== null) {
    return { ok: false, state, issues: [{ ...keyIssue, field: 'access' }] };
  }
  const key = normalizeKey(rawKey);
  const operationStep = state.step + 1;
  const index = state.entries.findIndex((entry) => entry.key === key);

  if (index === -1) {
    const nextState: CacheState = { ...state, step: operationStep, misses: state.misses + 1 };
    const event: AccessEvent = {
      kind: 'access',
      step: operationStep,
      key,
      result: 'miss',
      used: usedCapacity(state),
      capacity: state.capacity,
    };
    return { ok: true, state: nextState, event };
  }

  const target = state.entries[index];
  const updated: CacheEntry = {
    ...target,
    lastAccessStep: operationStep,
    accessCount: target.accessCount + 1,
  };
  const entries = [...state.entries];
  entries[index] = updated;

  const nextState: CacheState = { ...state, step: operationStep, entries, hits: state.hits + 1 };
  const event: AccessEvent = {
    kind: 'access',
    step: operationStep,
    key,
    result: 'hit',
    used: usedCapacity(nextState),
    capacity: state.capacity,
  };
  return { ok: true, state: nextState, event };
}

function applyStrategy(state: CacheState, strategy: Strategy): EngineResult {
  if (strategy === state.strategy) {
    return { ok: true, state, event: null };
  }
  const operationStep = state.step + 1;
  const nextState: CacheState = { ...state, strategy, step: operationStep };
  return {
    ok: true,
    state: nextState,
    event: { kind: 'strategy', step: operationStep, from: state.strategy, to: strategy },
  };
}

function applyCapacity(state: CacheState, capacity: number): EngineResult {
  if (state.step !== 0) {
    return {
      ok: false,
      state,
      issues: [{ field: 'capacity', message: 'Reset to change capacity.' }],
    };
  }
  if (!Number.isSafeInteger(capacity) || capacity < MIN_VALUE || capacity > MAX_VALUE) {
    const message = `Capacity must be a whole number between ${MIN_VALUE} and ${MAX_VALUE}.`;
    return { ok: false, state, issues: [{ field: 'capacity', message }] };
  }
  return { ok: true, state: { ...state, capacity }, event: null };
}

function applyReset(state: CacheState): EngineResult {
  return { ok: true, state: createInitialState(state.strategy, state.capacity), event: null };
}

export function applyCommand(state: CacheState, command: EngineCommand): EngineResult {
  switch (command.type) {
    case 'add':
      return applyAdd(state, command.key, command.size);
    case 'access':
      return applyAccess(state, command.key);
    case 'setStrategy':
      return applyStrategy(state, command.strategy);
    case 'setCapacity':
      return applyCapacity(state, command.capacity);
    case 'reset':
      return applyReset(state);
    default:
      return assertNever(command);
  }
}

export type CommandOutcome =
  | {
      readonly ok: true;
      readonly snapshot: EngineSnapshot;
      readonly event: CacheEvent | null;
    }
  | {
      readonly ok: false;
      readonly snapshot: EngineSnapshot;
      readonly issues: readonly ValidationIssue[];
    };

export function runCommand(snapshot: EngineSnapshot, command: EngineCommand): CommandOutcome {
  const result = applyCommand(snapshot.state, command);
  if (!result.ok) {
    return { ok: false, snapshot, issues: result.issues };
  }
  let events: readonly CacheEvent[];
  switch (command.type) {
    case 'add':
    case 'access':
    case 'setStrategy':
    case 'setCapacity':
      events = appendEvent(snapshot.events, result.event);
      break;
    case 'reset':
      events = [];
      break;
    default:
      return assertNever(command);
  }
  return {
    ok: true,
    snapshot: { state: result.state, events },
    event: result.event,
  };
}

export function describeEvent(event: CacheEvent): string {
  switch (event.kind) {
    case 'access':
      switch (event.result) {
        case 'hit':
        case 'miss':
          return `Access "${event.key}": ${event.result}. Usage: ${event.used} / ${event.capacity}.`;
        default:
          return assertNever(event.result);
      }
    case 'strategy':
      return `Strategy changed from ${event.from} to ${event.to}.`;
    case 'insert': {
      const unit = (size: number): string => (size === 1 ? 'unit' : 'units');
      const evictionText =
        event.evictions.length === 0
          ? 'No eviction was needed.'
          : event.evictions
              .map(
                (eviction) =>
                  `Evicted "${eviction.key}" (${eviction.size} ${unit(eviction.size)}) because ${eviction.reason}.`,
              )
              .join(' ');
      return `Added "${event.key}" (${event.size} ${unit(event.size)}). ${evictionText} Usage: ${event.used} / ${event.capacity}.`;
    }
    default:
      return assertNever(event);
  }
}
