import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { CacheEntry, EngineCommand, EngineSnapshot, ValidationIssue } from './cache-engine/models';
import { createInitialState, describeEvent, hitRate, runCommand } from './cache-engine/engine';
import type { CommandOutcome } from './cache-engine/engine';
import { assertNever } from './cache-engine/assert-never';
import { priorityOrder } from './cache-engine/priority';
import { GUIDED_CAPACITY, GUIDED_STEPS } from './cache-engine/guided-example';
import { parseIntegerField, validateKey } from './cache-engine/validation';
import { CacheView } from './components/cache-view/cache-view';
import { EventLog } from './components/event-log/event-log';
import { PlaygroundControls } from './components/playground-controls/playground-controls';
import type {
  ControlDrafts,
  ControlErrors,
  ControlRequest,
  DraftChange,
} from './components/playground-controls/playground-controls';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CacheView, EventLog, PlaygroundControls],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly exampleSteps = GUIDED_STEPS;

  protected readonly snapshot = signal<EngineSnapshot>({
    state: createInitialState('FIFO', 10),
    events: [],
  });

  protected readonly drafts = signal<ControlDrafts>({
    itemKey: '',
    itemSize: '',
    accessKey: '',
    capacity: '10',
  });
  protected readonly errors = signal<ControlErrors>({
    key: null,
    size: null,
    access: null,
    capacity: null,
  });
  protected readonly statusMessage = signal('');

  protected readonly exampleActive = signal(false);
  protected readonly exampleCursor = signal(0);

  protected readonly state = computed(() => this.snapshot().state);
  protected readonly events = computed(() => this.snapshot().events);
  protected readonly priority = computed<readonly CacheEntry[]>(() =>
    priorityOrder(this.state().entries, this.state().strategy),
  );
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

  protected onDraftChange(change: DraftChange): void {
    if (this.exampleActive() || (change.field === 'capacity' && !this.canEditCapacity())) {
      return;
    }
    this.drafts.update((drafts) => ({ ...drafts, [change.field]: change.value }));
  }

  protected onControlRequest(request: ControlRequest): void {
    if (request.type !== 'reset' && request.type !== 'loadExample' && this.exampleActive()) {
      return;
    }
    switch (request.type) {
      case 'add':
        this.addItem();
        break;
      case 'access':
        this.accessItem();
        break;
      case 'setStrategy':
        if (this.applyCapacity()) {
          this.execute({ type: 'setStrategy', strategy: request.strategy });
        }
        break;
      case 'setCapacity':
        this.applyCapacity();
        break;
      case 'reset':
        this.reset();
        break;
      case 'loadExample':
        this.loadExample();
        break;
      default:
        assertNever(request);
    }
  }

  protected addItem(): void {
    if (this.exampleActive() || !this.applyCapacity()) {
      return;
    }
    this.errors.update((errors) => ({ ...errors, key: null, size: null }));

    const drafts = this.drafts();
    const sizeResult = parseIntegerField(drafts.itemSize, 'size', 'Size');
    if (!sizeResult.ok) {
      this.errors.update((errors) => ({
        ...errors,
        size: sizeResult.issue.message,
      }));
      return;
    }
    const keyIssue = validateKey(drafts.itemKey);
    if (keyIssue !== null) {
      this.errors.update((errors) => ({ ...errors, key: keyIssue.message }));
      return;
    }

    const outcome = this.execute({ type: 'add', key: drafts.itemKey, size: sizeResult.value });
    if (outcome.ok) {
      this.drafts.update((drafts) => ({ ...drafts, itemKey: '', itemSize: '' }));
    }
  }

  protected accessItem(key?: string): void {
    if (this.exampleActive() || !this.applyCapacity()) {
      return;
    }
    this.errors.update((errors) => ({ ...errors, access: null }));
    const outcome = this.execute({ type: 'access', key: key ?? this.drafts().accessKey });
    if (outcome.ok && key === undefined) {
      this.drafts.update((drafts) => ({ ...drafts, accessKey: '' }));
    }
  }

  protected applyCapacity(): boolean {
    if (!this.canEditCapacity()) {
      return true;
    }
    this.errors.update((errors) => ({ ...errors, capacity: null }));
    const result = parseIntegerField(this.drafts().capacity, 'capacity', 'Capacity');
    if (!result.ok) {
      this.errors.update((errors) => ({
        ...errors,
        capacity: result.issue.message,
      }));
      return false;
    }
    return this.execute({ type: 'setCapacity', capacity: result.value }).ok;
  }

  protected reset(): void {
    const outcome = this.execute({ type: 'reset' });
    if (!outcome.ok) {
      return;
    }
    this.exampleActive.set(false);
    this.exampleCursor.set(0);
    this.drafts.set({
      itemKey: '',
      itemSize: '',
      accessKey: '',
      capacity: String(outcome.snapshot.state.capacity),
    });
    this.clearErrors();
    this.statusMessage.set('Simulation reset. Manual playground ready.');
  }

  protected loadExample(): void {
    const strategy = this.state().strategy;
    this.snapshot.set({ state: createInitialState(strategy, GUIDED_CAPACITY), events: [] });
    this.exampleActive.set(true);
    this.exampleCursor.set(0);
    this.drafts.update((drafts) => ({ ...drafts, capacity: String(GUIDED_CAPACITY) }));
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
    this.clearErrors();
    const outcome = this.execute(step.command);
    if (outcome.ok) {
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

  private execute(command: EngineCommand): CommandOutcome {
    const result = runCommand(this.snapshot(), command);
    if (!result.ok) {
      this.routeIssues(result.issues);
      return result;
    }
    this.snapshot.set(result.snapshot);
    if (result.event !== null) {
      this.statusMessage.set(describeEvent(result.event));
    }
    return result;
  }

  private routeIssues(issues: readonly ValidationIssue[]): void {
    for (const issue of issues) {
      const field = issue.field;
      switch (field) {
        case 'key':
        case 'size':
        case 'access':
        case 'capacity':
          this.errors.update((errors) => ({ ...errors, [field]: issue.message }));
          break;
        default:
          assertNever(field);
      }
    }
  }

  private clearErrors(): void {
    this.errors.set({ key: null, size: null, access: null, capacity: null });
  }
}
