import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { STRATEGIES, STRATEGY_INFO } from '../../cache-engine/models';
import type { Strategy, ValidationField } from '../../cache-engine/models';
import { assertNever } from '../../cache-engine/assert-never';

export interface ControlDrafts {
  readonly itemKey: string;
  readonly itemSize: string;
  readonly accessKey: string;
  readonly capacity: string;
}

export type ControlErrors = Readonly<Record<ValidationField, string | null>>;

export interface DraftChange {
  readonly field: keyof ControlDrafts;
  readonly value: string;
}

export type ControlRequest =
  | { readonly type: 'add' }
  | { readonly type: 'access' }
  | { readonly type: 'setStrategy'; readonly strategy: Strategy }
  | { readonly type: 'setCapacity' }
  | { readonly type: 'reset' }
  | { readonly type: 'loadExample' };

@Component({
  selector: 'app-playground-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './playground-controls.html',
  styleUrl: './playground-controls.scss',
})
export class PlaygroundControls {
  readonly drafts = input.required<ControlDrafts>();
  readonly errors = input.required<ControlErrors>();
  readonly strategy = input.required<Strategy>();
  readonly canEditCapacity = input.required<boolean>();
  readonly exampleActive = input.required<boolean>();

  readonly draftChange = output<DraftChange>();
  readonly operation = output<ControlRequest>();

  protected readonly strategies = STRATEGIES;
  protected readonly strategyInfo = computed(() => STRATEGY_INFO[this.strategy()]);

  protected editDraft(field: keyof ControlDrafts, value: string): void {
    if (this.exampleActive() || (field === 'capacity' && !this.canEditCapacity())) {
      return;
    }
    this.draftChange.emit({ field, value });
  }

  protected requestOperation(request: ControlRequest): void {
    switch (request.type) {
      case 'reset':
      case 'loadExample':
        break;
      case 'add':
      case 'access':
      case 'setStrategy':
        if (this.exampleActive()) {
          return;
        }
        break;
      case 'setCapacity':
        if (this.exampleActive() || !this.canEditCapacity()) {
          return;
        }
        break;
      default:
        assertNever(request);
    }
    this.operation.emit(request);
  }

  protected changeStrategy(select: HTMLSelectElement): void {
    const strategy = STRATEGIES.find((candidate) => candidate === select.value);
    if (strategy !== undefined) {
      this.requestOperation({ type: 'setStrategy', strategy });
    }
    select.value = this.strategy();
  }
}
