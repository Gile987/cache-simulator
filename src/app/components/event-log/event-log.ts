import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AccessEvent, CacheEvent, InsertEvent, StrategyEvent } from '../../cache-engine/models';

@Component({
  selector: 'app-event-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './event-log.html',
  styleUrl: './event-log.scss',
})
export class EventLog {
  readonly events = input.required<readonly CacheEvent[]>();

  protected summary(event: CacheEvent): string {
    if (event.kind === 'access') {
      return this.accessSummary(event);
    }
    if (event.kind === 'strategy') {
      return this.strategySummary(event);
    }
    return this.insertSummary(event);
  }

  private accessSummary(event: AccessEvent): string {
    const outcome = event.result === 'hit' ? 'hit' : 'miss';
    return `Access "${event.key}": ${outcome}. Usage: ${event.used} / ${event.capacity}.`;
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
