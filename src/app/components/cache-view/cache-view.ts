import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CacheEntry, CacheState } from '../../cache-engine/models';
import { usedCapacity } from '../../cache-engine/engine';

interface Segment {
  readonly key: string;
  readonly size: number;
  readonly percent: number;
  readonly color: string;
}

@Component({
  selector: 'app-cache-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cache-view.html',
  styleUrl: './cache-view.scss',
})
export class CacheView {
  readonly state = input.required<CacheState>();
  readonly priority = input.required<readonly CacheEntry[]>();
  readonly interactive = input(true);
  readonly access = output<string>();

  protected readonly used = computed(() => usedCapacity(this.state()));

  protected readonly segments = computed<readonly Segment[]>(() => {
    const state = this.state();
    return state.entries.map((entry, index) => ({
      key: entry.key,
      size: entry.size,
      percent: (entry.size / state.capacity) * 100,
      color: `hsl(${(index * 137.5) % 360} 62% 52%)`,
    }));
  });

  protected readonly barLabel = computed(() => {
    const state = this.state();
    return `${this.used()} of ${state.capacity} capacity units in use`;
  });

  protected metric(entry: CacheEntry): string {
    const strategy = this.state().strategy;
    if (strategy === 'FIFO') {
      return `inserted step ${entry.insertionStep}`;
    }
    if (strategy === 'LRU') {
      return `last access step ${entry.lastAccessStep}`;
    }
    return `${entry.accessCount} ${entry.accessCount === 1 ? 'access' : 'accesses'}`;
  }
}
