import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  CacheEntry,
  CacheState,
  EngineCommand,
  EngineSnapshot,
  STRATEGIES,
  STRATEGY_INFO,
  ValidationIssue,
} from './cache-engine/models';
import {
  createInitialState,
  describeEvent,
  hitRate,
  runCommand,
  usedCapacity,
} from './cache-engine/engine';
import { priorityOrder } from './cache-engine/priority';
import { GUIDED_CAPACITY, GUIDED_STEPS } from './cache-engine/guided-example';
import { parseIntegerField, validateKey } from './cache-engine/validation';
import { CacheView } from './components/cache-view/cache-view';
import { EventLog } from './components/event-log/event-log';
import { readInputValue } from './ui/dom';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CacheView, EventLog],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly strategies = STRATEGIES;
  protected readonly exampleSteps = GUIDED_STEPS;

  protected readonly snapshot = signal<EngineSnapshot>({
    state: createInitialState('FIFO', 10),
    events: [],
  });

  protected readonly itemKey = signal('');
  protected readonly itemSize = signal('');
  protected readonly accessKey = signal('');
  protected readonly capacityDraft = signal('10');

  protected readonly addKeyError = signal<string | null>(null);
  protected readonly addSizeError = signal<string | null>(null);
  protected readonly accessError = signal<string | null>(null);
  protected readonly capacityError = signal<string | null>(null);
  protected readonly statusMessage = signal('');

  protected readonly exampleActive = signal(false);
  protected readonly exampleCursor = signal(0);

  protected readonly state = computed(() => this.snapshot().state);
  protected readonly events = computed(() => this.snapshot().events);
  protected readonly used = computed(() => usedCapacity(this.state()));
  protected readonly priority = computed<readonly CacheEntry[]>(() =>
    priorityOrder(this.state().entries, this.state().strategy),
  );
  protected readonly strategyInfo = computed(() => STRATEGY_INFO[this.state().strategy]);
  protected readonly rateLabel = computed(() => {
    const rate = hitRate(this.state());
    return rate === null ? '—' : `${(rate * 100).toFixed(1)}%`;
  });
  protected readonly canEditCapacity = computed(
    () => this.state().step === 0 && !this.exampleActive(),
  );
  protected readonly exampleComplete = computed(
    () => this.exampleActive() && this.exampleCursor() >= GUIDED_STEPS.length,
  );

  protected onStrategyChange(event: Event): void {
    if (this.exampleActive()) {
      return;
    }
    const value = readInputValue(event);
    const strategy = STRATEGIES.find((candidate) => candidate === value);
    if (strategy === undefined) {
      return;
    }
    if (!this.applyCapacity()) {
      const target = event.target;
      if (target instanceof HTMLSelectElement) {
        target.value = this.state().strategy;
      }
      return;
    }
    this.apply({ type: 'setStrategy', strategy });
  }

  protected onItemKeyInput(event: Event): void {
    this.itemKey.set(readInputValue(event));
  }

  protected onItemSizeInput(event: Event): void {
    this.itemSize.set(readInputValue(event));
  }

  protected onAccessKeyInput(event: Event): void {
    this.accessKey.set(readInputValue(event));
  }

  protected onCapacityInput(event: Event): void {
    this.capacityDraft.set(readInputValue(event));
  }

  protected addItem(): void {
    if (this.exampleActive() || !this.applyCapacity()) {
      return;
    }
    this.addKeyError.set(null);
    this.addSizeError.set(null);

    const sizeResult = parseIntegerField(this.itemSize(), 'size', 'Size');
    if (sizeResult.issue !== null || sizeResult.value === null) {
      this.addSizeError.set(sizeResult.issue?.message ?? 'Size is invalid.');
      return;
    }
    const keyIssue = validateKey(this.itemKey());
    if (keyIssue !== null) {
      this.addKeyError.set(keyIssue.message);
      return;
    }

    this.apply({ type: 'add', key: this.itemKey(), size: sizeResult.value });
    if (this.addKeyError() === null && this.addSizeError() === null) {
      this.itemKey.set('');
      this.itemSize.set('');
    }
  }

  protected accessItem(key?: string): void {
    if (this.exampleActive() || !this.applyCapacity()) {
      return;
    }
    this.accessError.set(null);
    const rawKey = key ?? this.accessKey();
    this.apply({ type: 'access', key: rawKey });
    if (this.accessError() === null && key === undefined) {
      this.accessKey.set('');
    }
  }

  protected applyCapacity(): boolean {
    if (!this.canEditCapacity()) {
      return true;
    }
    this.capacityError.set(null);
    const result = parseIntegerField(this.capacityDraft(), 'capacity', 'Capacity');
    if (result.issue !== null || result.value === null) {
      this.capacityError.set(result.issue?.message ?? 'Capacity is invalid.');
      return false;
    }
    this.apply({ type: 'setCapacity', capacity: result.value });
    return this.capacityError() === null;
  }

  protected reset(): void {
    const outcome = this.run({ type: 'reset' });
    this.exampleActive.set(false);
    this.exampleCursor.set(0);
    this.itemKey.set('');
    this.itemSize.set('');
    this.accessKey.set('');
    this.capacityDraft.set(String(outcome.capacity));
    this.clearErrors();
    this.statusMessage.set('Simulation reset. Manual playground ready.');
  }

  protected loadExample(): void {
    const strategy = this.state().strategy;
    this.snapshot.set({ state: createInitialState(strategy, GUIDED_CAPACITY), events: [] });
    this.exampleActive.set(true);
    this.exampleCursor.set(0);
    this.capacityDraft.set(String(GUIDED_CAPACITY));
    this.clearErrors();
    this.statusMessage.set(`Guided example loaded with ${strategy}. Use Next step to run it.`);
  }

  protected nextExampleStep(): void {
    if (!this.exampleActive()) {
      return;
    }
    const step = GUIDED_STEPS[this.exampleCursor()];
    if (step === undefined) {
      return;
    }
    this.apply(step.command);
    if (this.exampleActive()) {
      this.exampleCursor.update((cursor) => cursor + 1);
    }
  }

  protected stepStatus(index: number): 'done' | 'next' | 'pending' {
    if (!this.exampleActive()) {
      return 'pending';
    }
    if (index < this.exampleCursor()) {
      return 'done';
    }
    if (index === this.exampleCursor()) {
      return 'next';
    }
    return 'pending';
  }

  private run(command: EngineCommand): CacheState {
    const snapshot = this.snapshot();
    const result = runCommand(snapshot, command);
    this.snapshot.set(result.snapshot);
    const event = result.snapshot.events[0];
    if (event !== undefined) {
      this.statusMessage.set(describeEvent(event));
    }
    return result.snapshot.state;
  }

  private apply(command: EngineCommand): void {
    const snapshot = this.snapshot();
    const result = runCommand(snapshot, command);
    if (result.issues.length > 0) {
      this.routeIssues(result.issues);
      return;
    }
    this.snapshot.set(result.snapshot);
    const event = result.snapshot.events[0];
    if (event !== undefined) {
      this.statusMessage.set(describeEvent(event));
    }
  }

  private routeIssues(issues: readonly ValidationIssue[]): void {
    for (const issue of issues) {
      if (issue.field === 'key') {
        this.addKeyError.set(issue.message);
      } else if (issue.field === 'size') {
        this.addSizeError.set(issue.message);
      } else if (issue.field === 'access') {
        this.accessError.set(issue.message);
      } else {
        this.capacityError.set(issue.message);
      }
    }
  }

  private clearErrors(): void {
    this.addKeyError.set(null);
    this.addSizeError.set(null);
    this.accessError.set(null);
    this.capacityError.set(null);
  }
}
