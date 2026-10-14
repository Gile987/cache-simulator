export type Strategy = 'FIFO' | 'LRU' | 'LFU';

export const STRATEGIES: readonly Strategy[] = ['FIFO', 'LRU', 'LFU'];

export const STRATEGY_INFO: Readonly<Record<Strategy, string>> = {
  FIFO: 'First In, First Out: the item added earliest is evicted first. Accesses do not change eviction priority.',
  LRU: 'Least Recently Used: the item whose last access is oldest is evicted first. Insertion counts as the initial access.',
  LFU: 'Least Frequently Used: the item with the fewest accesses is evicted first, breaking ties by oldest access.',
};

export interface CacheEntry {
  readonly key: string;
  readonly size: number;
  readonly insertionStep: number;
  readonly lastAccessStep: number;
  readonly accessCount: number;
}

export interface CacheState {
  readonly strategy: Strategy;
  readonly capacity: number;
  readonly step: number;
  readonly entries: readonly CacheEntry[];
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
}

export interface EvictionRecord {
  readonly key: string;
  readonly size: number;
  readonly reason: string;
  readonly accessCount: number;
  readonly insertionStep: number;
  readonly lastAccessStep: number;
}

export interface InsertEvent {
  readonly kind: 'insert';
  readonly step: number;
  readonly key: string;
  readonly size: number;
  readonly evictions: readonly EvictionRecord[];
  readonly used: number;
  readonly capacity: number;
}

export interface AccessEvent {
  readonly kind: 'access';
  readonly step: number;
  readonly key: string;
  readonly result: 'hit' | 'miss';
  readonly used: number;
  readonly capacity: number;
}

export interface StrategyEvent {
  readonly kind: 'strategy';
  readonly step: number;
  readonly from: Strategy;
  readonly to: Strategy;
}

export type CacheEvent = InsertEvent | AccessEvent | StrategyEvent;

export type ValidationField = 'key' | 'size' | 'capacity' | 'access';

export interface ValidationIssue {
  readonly field: ValidationField;
  readonly message: string;
}

export type EngineCommand =
  | { readonly type: 'add'; readonly key: string; readonly size: number }
  | { readonly type: 'access'; readonly key: string }
  | { readonly type: 'setStrategy'; readonly strategy: Strategy }
  | { readonly type: 'setCapacity'; readonly capacity: number }
  | { readonly type: 'reset' };

export type EngineResult =
  | { readonly ok: true; readonly state: CacheState; readonly event: CacheEvent | null }
  | { readonly ok: false; readonly state: CacheState; readonly issues: readonly ValidationIssue[] };

export interface EngineSnapshot {
  readonly state: CacheState;
  readonly events: readonly CacheEvent[];
}
