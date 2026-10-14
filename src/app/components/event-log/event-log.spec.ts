import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { EventLog } from './event-log';
import { describeEvent } from '../../cache-engine/engine';
import type { CacheEvent } from '../../cache-engine/models';

function requireElement<T extends Element>(root: HTMLElement, selector: string): T {
  const element = root.querySelector(selector);
  if (element === null) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element as T;
}

describe('EventLog', () => {
  let fixture: ComponentFixture<EventLog>;
  let root: HTMLElement;

  function render(events: readonly CacheEvent[]): void {
    fixture.componentRef.setInput('events', events);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [EventLog] }).compileComponents();
    fixture = TestBed.createComponent(EventLog);
    root = fixture.nativeElement as HTMLElement;
  });

  it('reuses the engine description for access and strategy events', () => {
    const events: readonly CacheEvent[] = [
      { kind: 'access', step: 1, key: 'A', result: 'hit', used: 3, capacity: 10 },
      { kind: 'access', step: 2, key: 'missing', result: 'miss', used: 3, capacity: 10 },
      { kind: 'strategy', step: 3, from: 'FIFO', to: 'LFU' },
    ];
    render(events);

    const summaries = [...root.querySelectorAll('.text')].map((element) => element.textContent);
    expect(summaries).toEqual(events.map((event) => describeEvent(event)));
  });

  it('keeps structured eviction details and pluralizes a single-unit eviction', () => {
    const events: readonly CacheEvent[] = [
      {
        kind: 'insert',
        step: 2,
        key: 'D',
        size: 4,
        evictions: [
          {
            key: 'A',
            size: 1,
            reason: 'oldest insertion',
            accessCount: 0,
            insertionStep: 1,
            lastAccessStep: 1,
          },
        ],
        used: 4,
        capacity: 10,
      },
    ];
    render(events);

    const summary = requireElement(root, '.text').textContent ?? '';
    expect(summary).toContain('1 eviction.');
    expect(summary).not.toContain('Evicted');
    expect(summary).not.toContain('oldest insertion');

    const eviction = requireElement(root, '[data-testid="eviction-list"] li');
    expect(eviction.textContent).toContain('A');
    expect(eviction.textContent).toContain('oldest insertion');
    expect(eviction.textContent).toContain('(1 unit)');
    expect(eviction.textContent).not.toContain('1 units');
  });

  it('pluralizes multiple evictions and their units', () => {
    const events: readonly CacheEvent[] = [
      {
        kind: 'insert',
        step: 3,
        key: 'D',
        size: 4,
        evictions: [
          {
            key: 'A',
            size: 2,
            reason: 'oldest insertion',
            accessCount: 0,
            insertionStep: 1,
            lastAccessStep: 1,
          },
          {
            key: 'B',
            size: 3,
            reason: 'second oldest insertion',
            accessCount: 0,
            insertionStep: 2,
            lastAccessStep: 2,
          },
        ],
        used: 4,
        capacity: 10,
      },
    ];
    render(events);

    const summary = requireElement(root, '.text').textContent ?? '';
    expect(summary).toContain('2 evictions.');
    expect(summary).not.toContain('Evicted');
    expect(summary).not.toContain('oldest insertion');

    const details = [...root.querySelectorAll('[data-testid="eviction-list"] li')].map(
      (element) => element.textContent ?? '',
    );
    expect(details[0]).toContain('A');
    expect(details[0]).toContain('oldest insertion');
    expect(details[0]).toContain('(2 units)');
    expect(details[1]).toContain('B');
    expect(details[1]).toContain('second oldest insertion');
    expect(details[1]).toContain('(3 units)');
  });
});
