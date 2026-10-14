import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AccessEvent, CacheEvent, InsertEvent, StrategyEvent } from '../../cache-engine/models';
import { assertNever } from '../../cache-engine/assert-never';

@Component({
  selector: 'app-event-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './event-log.html',
  styleUrl: './event-log.scss',
})
export class EventLog {
  readonly events = input.required<readonly CacheEvent[]>();

  protected summary(event: CacheEvent): string {
    switch (event.kind) {
      case 'access':
        return this.accessSummary(event);
      case 'strategy':
        return this.strategySummary(event);
      case 'insert':
        return this.insertSummary(event);
      default:
        return assertNever(event);
    }
  }

  private accessSummary(event: AccessEvent): string {
    switch (event.result) {
      case 'hit':
      case 'miss':
        return `Access "${event.key}": ${event.result}. Usage: ${event.used} / ${event.capacity}.`;
      default:
        return assertNever(event.result);
    }
  }

  private strategySummary(event: StrategyEvent): string {
    return `Strategy changed from ${event.from} to ${event.to}.`;
  }

  private insertSummary(event: InsertEvent): string {
    const unit = event.size === 1 ? 'unit' : 'units';
    const head = `Added "${event.key}" (${event.size} ${unit}).`;
    const tail = `Usage: ${event.used} / ${event.capacity}.`;
    if (event.evictions.length === 0) {
      return `${head} No eviction was needed. ${tail}`;
    }
    return `${head} ${event.evictions.length} eviction${event.evictions.length === 1 ? '' : 's'}. ${tail}`;
  }
}
