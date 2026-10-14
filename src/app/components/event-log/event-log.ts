import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { CacheEvent, InsertEvent } from '../../cache-engine/models';
import { describeEvent, formatUsage, pluralize, unitLabel } from '../../cache-engine/engine';
import { assertNever } from '../../cache-engine/assert-never';

@Component({
  selector: 'app-event-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './event-log.html',
  styleUrl: './event-log.scss',
})
export class EventLog {
  readonly events = input.required<readonly CacheEvent[]>();

  protected readonly unitLabel = unitLabel;

  protected summary(event: CacheEvent): string {
    switch (event.kind) {
      case 'access':
      case 'strategy':
        return describeEvent(event);
      case 'insert':
        return this.insertSummary(event);
      default:
        return assertNever(event);
    }
  }

  private insertSummary(event: InsertEvent): string {
    const count = event.evictions.length;
    const evictionText =
      count === 0 ? 'No eviction was needed.' : `${count} ${pluralize(count, 'eviction')}.`;
    return `Added "${event.key}" (${event.size} ${unitLabel(event.size)}). ${evictionText} ${formatUsage(event.used, event.capacity)}`;
  }
}
