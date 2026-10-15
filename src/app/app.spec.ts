import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import * as engine from './cache-engine/engine';

function requireElement<T extends Element>(root: HTMLElement, selector: string): T {
  const element = root.querySelector(selector);
  if (element === null) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element as T;
}

function setInputValue(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function clickButton(root: HTMLElement, selector: string): void {
  requireElement<HTMLButtonElement>(root, selector).click();
}

function submitOperation(root: HTMLElement, operation: 'add' | 'access'): Event {
  const form = requireElement<HTMLFormElement>(root, `[data-testid="${operation}-form"]`);
  const event = new Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(event);
  return event;
}

type InitialOperation = 'add' | 'access' | 'strategy';

function prepareOperation(root: HTMLElement, size = '3'): void {
  setInputValue(requireElement<HTMLInputElement>(root, '[data-testid="item-key-input"]'), 'A');
  setInputValue(requireElement<HTMLInputElement>(root, '[data-testid="item-size-input"]'), size);
  setInputValue(
    requireElement<HTMLInputElement>(root, '[data-testid="access-key-input"]'),
    'missing',
  );
}

function performOperation(root: HTMLElement, operation: InitialOperation): void {
  if (operation === 'strategy') {
    const select = requireElement<HTMLSelectElement>(root, '#strategy');
    select.value = 'LFU';
    select.dispatchEvent(new Event('change'));
    return;
  }
  clickButton(root, `[data-testid="${operation}-button"]`);
}

describe('App', () => {
  let fixture: ComponentFixture<App>;
  let root: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
    fixture = TestBed.createComponent(App);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the playground heading and an empty state', () => {
    expect(root.querySelector('h1')?.textContent).toContain('Cache Eviction Playground');
    expect(root.querySelector('[data-testid="empty-state"]')).not.toBeNull();
  });

  it('adds an item and reflects usage and statistics', () => {
    setInputValue(requireElement<HTMLInputElement>(root, '[data-testid="item-key-input"]'), 'A');
    setInputValue(requireElement<HTMLInputElement>(root, '[data-testid="item-size-input"]'), '3');
    clickButton(root, '[data-testid="add-button"]');
    fixture.detectChanges();

    expect(root.querySelectorAll('[data-testid="card"]').length).toBe(1);
    expect(requireElement(root, '[data-testid="usage"]').textContent).toContain('3 / 10');
    expect(requireElement(root, '[data-testid="evictions"]').textContent).toContain('0');
  });

  it('shows a field-specific error and keeps the cache empty for a bad key', () => {
    setInputValue(requireElement<HTMLInputElement>(root, '[data-testid="item-key-input"]'), '   ');
    setInputValue(requireElement<HTMLInputElement>(root, '[data-testid="item-size-input"]'), '3');
    clickButton(root, '[data-testid="add-button"]');
    fixture.detectChanges();

    expect(root.querySelectorAll('[data-testid="card"]').length).toBe(0);
    expect(root.querySelector('.error')?.textContent).toContain('Enter a key');
  });

  it('counts a miss and shows a hit rate', () => {
    setInputValue(
      requireElement<HTMLInputElement>(root, '[data-testid="access-key-input"]'),
      'nope',
    );
    clickButton(root, '[data-testid="access-button"]');
    fixture.detectChanges();

    expect(requireElement(root, '[data-testid="misses"]').textContent).toContain('1');
    expect(requireElement(root, '[data-testid="hit-rate"]').textContent).toContain('0.0%');
  });

  describe.each(['add', 'access'] as const)('%s form submission', (operation) => {
    it('handles a submit event followed by Enter keyup exactly once without navigation', () => {
      prepareOperation(root);
      fixture.detectChanges();
      const input = requireElement<HTMLInputElement>(
        root,
        `[data-testid="${operation === 'add' ? 'item-key' : 'access-key'}-input"]`,
      );
      const button = requireElement<HTMLButtonElement>(root, `[data-testid="${operation}-button"]`);
      expect(button.type).toBe('submit');
      expect(input.form).toBe(button.form);

      const event = submitOperation(root, operation);
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();

      expect(event.defaultPrevented).toBe(true);
      expect(root.querySelectorAll('[data-testid="event-list"] > li')).toHaveLength(1);
      expect(root.querySelector('.error')).toBeNull();
      expect(input.value).toBe('');
      if (operation === 'add') {
        expect(root.querySelectorAll('[data-testid="card"]')).toHaveLength(1);
        expect(
          requireElement<HTMLInputElement>(root, '[data-testid="item-size-input"]').value,
        ).toBe('');
        expect(
          requireElement<HTMLInputElement>(root, '[data-testid="access-key-input"]').value,
        ).toBe('missing');
        expect(requireElement(root, '[data-testid="misses"]').textContent?.trim()).toBe('0');
      } else {
        expect(root.querySelectorAll('[data-testid="card"]')).toHaveLength(0);
        expect(requireElement(root, '[data-testid="misses"]').textContent?.trim()).toBe('1');
        expect(requireElement<HTMLInputElement>(root, '[data-testid="item-key-input"]').value).toBe(
          'A',
        );
        expect(
          requireElement<HTMLInputElement>(root, '[data-testid="item-size-input"]').value,
        ).toBe('3');
      }
    });

    it('clicking submit performs one operation and cancels the native submission', () => {
      prepareOperation(root);
      const form = requireElement<HTMLFormElement>(root, `[data-testid="${operation}-form"]`);
      const submissions: Event[] = [];
      form.addEventListener('submit', (event) => submissions.push(event));

      clickButton(root, `[data-testid="${operation}-button"]`);
      fixture.detectChanges();

      expect(submissions).toHaveLength(1);
      expect(submissions[0]?.defaultPrevented).toBe(true);
      expect(root.querySelectorAll('[data-testid="event-list"] > li')).toHaveLength(1);
      expect(root.querySelector('.error')).toBeNull();
    });

    it('blocks invalid capacity and accepts the retained drafts after correction', () => {
      prepareOperation(root);
      const capacity = requireElement<HTMLInputElement>(root, '[data-testid="capacity-input"]');
      setInputValue(capacity, '0');

      expect(submitOperation(root, operation).defaultPrevented).toBe(true);
      fixture.detectChanges();

      expect(root.querySelector('.error')?.textContent).toContain('Capacity');
      expect(root.querySelector('[data-testid="log-empty"]')).not.toBeNull();
      expect(capacity.disabled).toBe(false);
      expect(requireElement<HTMLInputElement>(root, '[data-testid="item-key-input"]').value).toBe(
        'A',
      );
      expect(requireElement<HTMLInputElement>(root, '[data-testid="item-size-input"]').value).toBe(
        '3',
      );
      expect(requireElement<HTMLInputElement>(root, '[data-testid="access-key-input"]').value).toBe(
        'missing',
      );

      setInputValue(capacity, '20');
      submitOperation(root, operation);
      fixture.detectChanges();

      expect(root.querySelector('.error')).toBeNull();
      expect(root.querySelectorAll('[data-testid="event-list"] > li')).toHaveLength(1);
      expect(capacity.disabled).toBe(true);
      expect(requireElement(root, '[data-testid="usage"]').textContent).toContain('/ 20');
    });

    it('ignores form submission in guided mode and resumes after reset', () => {
      prepareOperation(root);
      clickButton(root, '[data-testid="load-example-button"]');
      fixture.detectChanges();

      expect(
        requireElement<HTMLButtonElement>(root, `[data-testid="${operation}-button"]`).disabled,
      ).toBe(true);
      expect(submitOperation(root, operation).defaultPrevented).toBe(true);
      fixture.detectChanges();

      expect(root.querySelector('[data-testid="log-empty"]')).not.toBeNull();
      expect(root.querySelector('.error')).toBeNull();
      expect(requireElement(root, '[data-testid="status"]').textContent).toContain(
        'Guided example loaded',
      );

      clickButton(root, '[data-testid="reset-button"]');
      fixture.detectChanges();
      prepareOperation(root);
      submitOperation(root, operation);
      fixture.detectChanges();

      expect(
        requireElement<HTMLButtonElement>(root, `[data-testid="${operation}-button"]`).disabled,
      ).toBe(false);
      expect(root.querySelectorAll('[data-testid="event-list"] > li')).toHaveLength(1);
    });
  });

  it.each(['', '0', '101', '1.5'])(
    'shows custom size errors for "%s" and recovers through Add submission',
    (draft) => {
      const key = requireElement<HTMLInputElement>(root, '[data-testid="item-key-input"]');
      const size = requireElement<HTMLInputElement>(root, '[data-testid="item-size-input"]');
      const form = requireElement<HTMLFormElement>(root, '[data-testid="add-form"]');
      setInputValue(key, 'A');
      setInputValue(size, draft);
      expect(form.noValidate).toBe(true);

      clickButton(root, '[data-testid="add-button"]');
      fixture.detectChanges();

      expect(root.querySelector('.error')?.textContent).toContain('Size');
      expect(size.getAttribute('aria-invalid')).toBe('true');
      expect(key.value).toBe('A');
      expect(size.value).toBe(draft);
      expect(root.querySelector('[data-testid="log-empty"]')).not.toBeNull();

      setInputValue(size, '3');
      submitOperation(root, 'add');
      fixture.detectChanges();

      expect(root.querySelector('.error')).toBeNull();
      expect(root.querySelectorAll('[data-testid="card"]')).toHaveLength(1);
      expect(root.querySelectorAll('[data-testid="event-list"] > li')).toHaveLength(1);
    },
  );

  it('shows custom Access key errors and accepts a corrected submission', () => {
    const input = requireElement<HTMLInputElement>(root, '[data-testid="access-key-input"]');
    setInputValue(input, '   ');

    submitOperation(root, 'access');
    fixture.detectChanges();

    expect(root.querySelector('.error')?.textContent).toContain('Enter a key');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.value).toBe('   ');
    expect(root.querySelector('[data-testid="log-empty"]')).not.toBeNull();
    expect(requireElement(root, '[data-testid="misses"]').textContent?.trim()).toBe('0');

    setInputValue(input, 'missing');
    submitOperation(root, 'access');
    fixture.detectChanges();

    expect(root.querySelector('.error')).toBeNull();
    expect(input.value).toBe('');
    expect(requireElement(root, '[data-testid="misses"]').textContent?.trim()).toBe('1');
  });

  it('locks capacity after the first accepted operation and unlocks after reset', () => {
    const capacityInput = requireElement<HTMLInputElement>(root, '[data-testid="capacity-input"]');
    expect(capacityInput.disabled).toBe(false);

    setInputValue(requireElement<HTMLInputElement>(root, '[data-testid="item-key-input"]'), 'A');
    setInputValue(requireElement<HTMLInputElement>(root, '[data-testid="item-size-input"]'), '3');
    clickButton(root, '[data-testid="add-button"]');
    fixture.detectChanges();
    expect(requireElement<HTMLInputElement>(root, '[data-testid="capacity-input"]').disabled).toBe(
      true,
    );

    clickButton(root, '[data-testid="reset-button"]');
    fixture.detectChanges();
    expect(requireElement<HTMLInputElement>(root, '[data-testid="capacity-input"]').disabled).toBe(
      false,
    );
    expect(root.querySelector('[data-testid="empty-state"]')).not.toBeNull();
  });

  describe.each(['add', 'access', 'strategy'] as const)('capacity before %s', (operation) => {
    it.each(['', '0', '101', '1.5'])('rejects the invalid draft "%s"', (draft) => {
      const capacity = requireElement<HTMLInputElement>(root, '[data-testid="capacity-input"]');
      setInputValue(capacity, draft);
      prepareOperation(root);

      performOperation(root, operation);
      fixture.detectChanges();

      expect(capacity.disabled).toBe(false);
      expect(capacity.value).toBe(draft);
      expect(capacity.getAttribute('aria-invalid')).toBe('true');
      expect(root.querySelector('.error')?.textContent).toContain('Capacity');
      expect(root.querySelector('[data-testid="empty-state"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="log-empty"]')).not.toBeNull();
      expect(requireElement(root, '[data-testid="usage"]').textContent).toContain('0 / 10');
      expect(requireElement(root, '[data-testid="misses"]').textContent?.trim()).toBe('0');
      expect(requireElement<HTMLSelectElement>(root, '#strategy').value).toBe('FIFO');
      expect(requireElement<HTMLInputElement>(root, '[data-testid="item-key-input"]').value).toBe(
        'A',
      );
      expect(requireElement<HTMLInputElement>(root, '[data-testid="item-size-input"]').value).toBe(
        '3',
      );
      expect(requireElement<HTMLInputElement>(root, '[data-testid="access-key-input"]').value).toBe(
        'missing',
      );
    });

    it('commits a valid draft without waiting for a change event', () => {
      const capacity = requireElement<HTMLInputElement>(root, '[data-testid="capacity-input"]');
      setInputValue(capacity, '20');
      prepareOperation(root, '15');

      performOperation(root, operation);
      fixture.detectChanges();

      expect(capacity.disabled).toBe(true);
      expect(root.querySelector('.error')).toBeNull();
      expect(requireElement(root, '[data-testid="usage"]').textContent).toContain(
        operation === 'add' ? '15 / 20' : '0 / 20',
      );
      const events = root.querySelectorAll('[data-testid="event-list"] > li');
      expect(events).toHaveLength(1);
      expect(events[0]?.textContent).toContain('Step 1');
      if (operation === 'access') {
        expect(requireElement(root, '[data-testid="misses"]').textContent?.trim()).toBe('1');
      } else if (operation === 'strategy') {
        expect(requireElement<HTMLSelectElement>(root, '#strategy').value).toBe('LFU');
      }
    });

    it('accepts the operation after correcting a previously rejected capacity', () => {
      const capacity = requireElement<HTMLInputElement>(root, '[data-testid="capacity-input"]');
      setInputValue(capacity, '0');
      capacity.dispatchEvent(new Event('change'));
      prepareOperation(root);
      performOperation(root, operation);
      fixture.detectChanges();

      expect(capacity.disabled).toBe(false);
      expect(root.querySelector('[data-testid="log-empty"]')).not.toBeNull();

      setInputValue(capacity, '20');
      performOperation(root, operation);
      fixture.detectChanges();

      expect(capacity.disabled).toBe(true);
      expect(capacity.getAttribute('aria-invalid')).toBe('false');
      expect(root.querySelector('.error')).toBeNull();
      expect(requireElement(root, '[data-testid="usage"]').textContent).toContain('/ 20');
      expect(root.querySelectorAll('[data-testid="event-list"] > li')).toHaveLength(1);
    });
  });

  it('keeps capacity editable when the insertion is rejected after applying the draft', () => {
    const capacity = requireElement<HTMLInputElement>(root, '[data-testid="capacity-input"]');
    setInputValue(capacity, '2');
    setInputValue(requireElement<HTMLInputElement>(root, '[data-testid="item-key-input"]'), 'A');
    setInputValue(requireElement<HTMLInputElement>(root, '[data-testid="item-size-input"]'), '3');

    clickButton(root, '[data-testid="add-button"]');
    fixture.detectChanges();

    expect(capacity.disabled).toBe(false);
    expect(requireElement(root, '[data-testid="usage"]').textContent).toContain('0 / 2');
    expect(root.querySelector('.error')?.textContent).toContain('2-unit capacity');
    expect(root.querySelector('[data-testid="log-empty"]')).not.toBeNull();
  });

  it('uses the committed capacity for later operations and retains it on reset', () => {
    const capacity = requireElement<HTMLInputElement>(root, '[data-testid="capacity-input"]');
    setInputValue(capacity, '20');
    capacity.dispatchEvent(new Event('change'));
    prepareOperation(root, '15');
    performOperation(root, 'add');
    fixture.detectChanges();

    setInputValue(requireElement<HTMLInputElement>(root, '[data-testid="item-key-input"]'), 'B');
    setInputValue(requireElement<HTMLInputElement>(root, '[data-testid="item-size-input"]'), '3');
    performOperation(root, 'add');
    setInputValue(requireElement<HTMLInputElement>(root, '[data-testid="access-key-input"]'), 'A');
    performOperation(root, 'access');
    performOperation(root, 'strategy');
    fixture.detectChanges();

    expect(capacity.disabled).toBe(true);
    expect(root.querySelector('.error')).toBeNull();
    expect(requireElement(root, '[data-testid="usage"]').textContent).toContain('18 / 20');
    expect(requireElement(root, '[data-testid="hits"]').textContent?.trim()).toBe('1');
    expect(requireElement<HTMLSelectElement>(root, '#strategy').value).toBe('LFU');
    expect(root.querySelectorAll('[data-testid="event-list"] > li')).toHaveLength(4);

    clickButton(root, '[data-testid="reset-button"]');
    fixture.detectChanges();

    expect(capacity.disabled).toBe(false);
    expect(capacity.value).toBe('20');
    expect(requireElement(root, '[data-testid="usage"]').textContent).toContain('0 / 20');
    expect(root.querySelector('[data-testid="log-empty"]')).not.toBeNull();
  });

  it('reorders the displayed eviction priority and metrics when the strategy changes', () => {
    const addItem = (key: string): void => {
      setInputValue(requireElement<HTMLInputElement>(root, '[data-testid="item-key-input"]'), key);
      setInputValue(requireElement<HTMLInputElement>(root, '[data-testid="item-size-input"]'), '3');
      clickButton(root, '[data-testid="add-button"]');
      fixture.detectChanges();
    };
    const accessItem = (key: string): void => {
      setInputValue(
        requireElement<HTMLInputElement>(root, '[data-testid="access-key-input"]'),
        key,
      );
      clickButton(root, '[data-testid="access-button"]');
      fixture.detectChanges();
    };
    const changeStrategy = (strategy: 'FIFO' | 'LRU' | 'LFU'): void => {
      const select = requireElement<HTMLSelectElement>(root, '#strategy');
      select.value = strategy;
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };
    const priorityKeys = (): (string | null)[] =>
      [...root.querySelectorAll<HTMLElement>('[data-testid="priority-list"] .priority-key')].map(
        (element) => element.textContent,
      );
    const firstMetric = (): string =>
      requireElement(root, '[data-testid="priority-list"] .metric').textContent ?? '';

    addItem('A');
    addItem('B');
    accessItem('B');
    accessItem('B');
    accessItem('A');

    expect(priorityKeys()).toEqual(['A', 'B']);
    expect(firstMetric()).toBe('inserted step 1');

    changeStrategy('LRU');
    expect(priorityKeys()).toEqual(['B', 'A']);
    expect(firstMetric()).toBe('last access step 4');

    changeStrategy('LFU');
    expect(priorityKeys()).toEqual(['A', 'B']);
    expect(firstMetric()).toBe('1 access');
    expect(
      requireElement(root, '[data-testid="priority-list"] .priority-item .badge').textContent,
    ).toBe('next to evict');
  });

  it('runs the guided example one step at a time and disables manual controls', () => {
    clickButton(root, '[data-testid="load-example-button"]');
    fixture.detectChanges();
    expect(requireElement<HTMLButtonElement>(root, '[data-testid="add-button"]').disabled).toBe(
      true,
    );

    const nextButton = (): HTMLButtonElement =>
      requireElement<HTMLButtonElement>(root, '[data-testid="next-step-button"]');
    expect(nextButton().disabled).toBe(false);

    for (let index = 0; index < 8; index += 1) {
      nextButton().click();
      fixture.detectChanges();
    }

    expect(root.querySelector('[data-testid="example-complete"]')).not.toBeNull();
    expect(nextButton().disabled).toBe(true);
    expect(requireElement(root, '[data-testid="hits"]').textContent).toContain('4');
    expect(requireElement(root, '[data-testid="usage"]').textContent).toContain('10 / 10');
  });

  it('marks each guided step as done, next, or pending with a matching tag', () => {
    clickButton(root, '[data-testid="load-example-button"]');
    fixture.detectChanges();

    const steps = (): HTMLElement[] =>
      Array.from(root.querySelectorAll<HTMLElement>('[data-testid="example-steps"] > li'));
    const statuses = (): (string | null)[] =>
      steps().map((step) => step.getAttribute('data-status'));

    expect(statuses()).toEqual([
      'next',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
    expect(steps()[0]?.querySelector('.step-tag')?.textContent).toBe('next');
    expect(steps()[1]?.querySelector('.step-tag')).toBeNull();

    clickButton(root, '[data-testid="next-step-button"]');
    fixture.detectChanges();

    expect(statuses()[0]).toBe('done');
    expect(statuses()[1]).toBe('next');
    expect(steps()[0]?.querySelector('.step-tag')?.textContent).toBe('done');
    expect(steps()[1]?.querySelector('.step-tag')?.textContent).toBe('next');

    clickButton(root, '[data-testid="reset-button"]');
    fixture.detectChanges();

    expect(statuses()).toEqual([
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
    expect(root.querySelector('.step-tag')).toBeNull();
  });

  it('retains engine-rejected Add drafts and clears only the accepted form after correction', () => {
    prepareOperation(root);
    clickButton(root, '[data-testid="add-button"]');
    fixture.detectChanges();
    const key = requireElement<HTMLInputElement>(root, '[data-testid="item-key-input"]');
    const size = requireElement<HTMLInputElement>(root, '[data-testid="item-size-input"]');
    setInputValue(key, 'A');
    setInputValue(size, '3');
    fixture.detectChanges();

    submitOperation(root, 'add');
    fixture.detectChanges();

    expect(key.value).toBe('A');
    expect(size.value).toBe('3');
    expect(root.querySelector('.error')?.textContent).toContain('already in the cache');
    expect(root.querySelectorAll('[data-testid="card"]')).toHaveLength(1);
    expect(root.querySelectorAll('[data-testid="event-list"] > li')).toHaveLength(1);

    setInputValue(key, 'B');
    submitOperation(root, 'add');
    fixture.detectChanges();

    expect(key.value).toBe('');
    expect(size.value).toBe('');
    expect(root.querySelector('.error')).toBeNull();
    expect(root.querySelectorAll('[data-testid="card"]')).toHaveLength(2);
    expect(root.querySelectorAll('[data-testid="event-list"] > li')).toHaveLength(2);
    expect(requireElement<HTMLInputElement>(root, '[data-testid="access-key-input"]').value).toBe(
      'missing',
    );
  });

  it('keeps an Access draft when accessing a resident through its card', () => {
    prepareOperation(root);
    clickButton(root, '[data-testid="add-button"]');
    fixture.detectChanges();

    clickButton(root, '[data-testid="card"] button');
    fixture.detectChanges();

    expect(requireElement<HTMLInputElement>(root, '[data-testid="access-key-input"]').value).toBe(
      'missing',
    );
    expect(requireElement(root, '[data-testid="hits"]').textContent?.trim()).toBe('1');
    expect(root.querySelectorAll('[data-testid="event-list"] > li')).toHaveLength(2);

    submitOperation(root, 'access');
    fixture.detectChanges();

    expect(requireElement<HTMLInputElement>(root, '[data-testid="access-key-input"]').value).toBe(
      '',
    );
    expect(requireElement(root, '[data-testid="misses"]').textContent?.trim()).toBe('1');
    expect(root.querySelectorAll('[data-testid="event-list"] > li')).toHaveLength(3);
  });

  it('clears rejected drafts and errors on Reset while retaining the last valid capacity', () => {
    const capacity = requireElement<HTMLInputElement>(root, '[data-testid="capacity-input"]');
    setInputValue(capacity, '20');
    capacity.dispatchEvent(new Event('change'));
    setInputValue(capacity, '0');
    prepareOperation(root);
    submitOperation(root, 'add');
    fixture.detectChanges();
    expect(root.querySelector('.error')?.textContent).toContain('Capacity');

    clickButton(root, '[data-testid="reset-button"]');
    fixture.detectChanges();

    expect(capacity.value).toBe('20');
    expect(capacity.disabled).toBe(false);
    expect(root.querySelector('.error')).toBeNull();
    for (const id of ['item-key', 'item-size', 'access-key']) {
      expect(requireElement<HTMLInputElement>(root, `[data-testid="${id}-input"]`).value).toBe('');
    }
    expect(root.querySelector('[data-testid="log-empty"]')).not.toBeNull();
    expect(requireElement(root, '[data-testid="usage"]').textContent).toContain('0 / 20');
  });

  it('loads the guided example with the selected strategy, retained drafts, and cleared errors', () => {
    performOperation(root, 'strategy');
    prepareOperation(root);
    setInputValue(requireElement<HTMLInputElement>(root, '[data-testid="item-size-input"]'), '0');
    submitOperation(root, 'add');
    fixture.detectChanges();
    expect(root.querySelector('.error')?.textContent).toContain('Size');

    clickButton(root, '[data-testid="load-example-button"]');
    fixture.detectChanges();

    expect(requireElement<HTMLSelectElement>(root, '#strategy').value).toBe('LFU');
    expect(requireElement<HTMLInputElement>(root, '[data-testid="capacity-input"]').value).toBe(
      '10',
    );
    expect(requireElement<HTMLInputElement>(root, '[data-testid="item-key-input"]').value).toBe(
      'A',
    );
    expect(requireElement<HTMLInputElement>(root, '[data-testid="item-size-input"]').value).toBe(
      '0',
    );
    expect(requireElement<HTMLInputElement>(root, '[data-testid="access-key-input"]').value).toBe(
      'missing',
    );
    expect(root.querySelector('.error')).toBeNull();
    expect(root.querySelector('[data-testid="log-empty"]')).not.toBeNull();
    expect(requireElement(root, '[data-testid="status"]').textContent).toContain('loaded with LFU');

    for (let index = 0; index < 8; index += 1) {
      clickButton(root, '[data-testid="next-step-button"]');
      fixture.detectChanges();
    }

    expect(root.querySelector('[data-testid="example-complete"]')).not.toBeNull();
    const finalEvent = requireElement(root, '[data-testid="event-list"] > li').textContent;
    expect(finalEvent).toContain('Step 8');
    expect(finalEvent).toContain('Evicted B');
    expect(requireElement(root, '[data-testid="usage"]').textContent).toContain('10 / 10');
  });

  describe('validation feedback while editing', () => {
    it.each([
      ['item-key', '   ', 'A', 'add'],
      ['item-size', '1.5', '3', 'add'],
      ['access-key', '   ', 'missing', 'access'],
      ['capacity', '0', '20', 'add'],
    ] as const)(
      'clears only the %s field error on edit and accepts a corrected submission',
      (id, invalid, corrected, operation) => {
        prepareOperation(root);
        const input = requireElement<HTMLInputElement>(root, `[data-testid="${id}-input"]`);
        setInputValue(input, invalid);
        submitOperation(root, operation);
        fixture.detectChanges();

        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(input.getAttribute('aria-describedby')).toBe(`${id}-error`);
        expect(requireElement(root, `#${id}-error`).textContent).toBe(
          root.querySelector('.error')?.textContent,
        );
        expect(root.querySelectorAll('.error')).toHaveLength(1);
        const before = fixture.componentInstance['snapshot']();
        const saved = structuredClone(before);

        setInputValue(input, corrected);
        fixture.detectChanges();

        expect(fixture.componentInstance['errors']()).toEqual({
          key: null,
          size: null,
          access: null,
          capacity: null,
        });
        expect(input.value).toBe(corrected);
        expect(input.getAttribute('aria-invalid')).toBe('false');
        expect(input.hasAttribute('aria-describedby')).toBe(false);
        expect(root.querySelector(`#${id}-error`)).toBeNull();
        expect(root.querySelector('.error')).toBeNull();
        expect(fixture.componentInstance['snapshot']()).toBe(before);
        expect(before).toEqual(saved);
        expect(root.querySelector('[data-testid="log-empty"]')).not.toBeNull();

        submitOperation(root, operation);
        fixture.detectChanges();

        expect(root.querySelector('.error')).toBeNull();
        expect(root.querySelectorAll('[data-testid="event-list"] > li')).toHaveLength(1);
        expect(
          requireElement<HTMLInputElement>(root, '[data-testid="capacity-input"]').disabled,
        ).toBe(true);
      },
    );

    it('reports both Add errors, clears them independently, and preserves the cache until both fields are valid', () => {
      prepareOperation(root);
      submitOperation(root, 'add');
      fixture.detectChanges();
      const before = fixture.componentInstance['snapshot']();
      const saved = structuredClone(before);
      const key = requireElement<HTMLInputElement>(root, '[data-testid="item-key-input"]');
      const size = requireElement<HTMLInputElement>(root, '[data-testid="item-size-input"]');
      setInputValue(key, '   ');
      setInputValue(size, '0');

      submitOperation(root, 'add');
      fixture.detectChanges();

      expect(fixture.componentInstance['errors']()).toMatchObject({
        key: 'Enter a key.',
        size: 'Size must be between 1 and 100.',
      });
      expect(root.querySelectorAll('.error')).toHaveLength(2);
      expect(root.textContent).toContain('Enter a key.');
      expect(root.textContent).toContain('Size must be between 1 and 100.');
      expect(key.getAttribute('aria-invalid')).toBe('true');
      expect(size.getAttribute('aria-invalid')).toBe('true');
      expect(key.getAttribute('aria-describedby')).toBe('item-key-error');
      expect(size.getAttribute('aria-describedby')).toBe('item-size-error');
      expect(requireElement(root, '#item-key-error').textContent).toContain('Enter a key.');
      expect(requireElement(root, '#item-size-error').textContent).toContain('Size');
      expect(key.value).toBe('   ');
      expect(size.value).toBe('0');
      expect(fixture.componentInstance['snapshot']()).toBe(before);
      expect(before).toEqual(saved);

      setInputValue(key, 'B');
      fixture.detectChanges();

      expect(key.getAttribute('aria-invalid')).toBe('false');
      expect(size.getAttribute('aria-invalid')).toBe('true');
      expect(key.hasAttribute('aria-describedby')).toBe(false);
      expect(root.querySelector('#item-key-error')).toBeNull();
      expect(size.getAttribute('aria-describedby')).toBe('item-size-error');
      expect(requireElement(root, '#item-size-error').textContent).toContain('Size');
      expect(root.querySelectorAll('.error')).toHaveLength(1);
      expect(root.querySelector('.error')?.textContent).toContain('Size');
      expect(fixture.componentInstance['snapshot']()).toBe(before);

      submitOperation(root, 'add');
      fixture.detectChanges();

      expect(fixture.componentInstance['snapshot']()).toBe(before);
      expect(root.querySelectorAll('[data-testid="event-list"] > li')).toHaveLength(1);

      setInputValue(size, '3');
      fixture.detectChanges();

      expect(size.hasAttribute('aria-describedby')).toBe(false);
      expect(root.querySelector('#item-size-error')).toBeNull();
      expect(root.querySelector('.error')).toBeNull();
      expect(fixture.componentInstance['snapshot']()).toBe(before);
      submitOperation(root, 'add');
      fixture.detectChanges();

      expect(root.querySelectorAll('[data-testid="card"]')).toHaveLength(2);
      expect(root.querySelectorAll('[data-testid="event-list"] > li')).toHaveLength(2);
      expect(key.value).toBe('');
      expect(size.value).toBe('');
      expect(before).toEqual(saved);
    });

    it('clears an edited duplicate-key error but rejects a still-duplicate key on resubmission', () => {
      prepareOperation(root);
      submitOperation(root, 'add');
      fixture.detectChanges();
      const before = fixture.componentInstance['snapshot']();
      const key = requireElement<HTMLInputElement>(root, '[data-testid="item-key-input"]');
      const size = requireElement<HTMLInputElement>(root, '[data-testid="item-size-input"]');
      setInputValue(key, 'A');
      setInputValue(size, '3');
      submitOperation(root, 'add');
      fixture.detectChanges();
      expect(root.querySelector('.error')?.textContent).toContain('already in the cache');

      setInputValue(key, ' A ');
      fixture.detectChanges();

      expect(root.querySelector('.error')).toBeNull();
      expect(fixture.componentInstance['snapshot']()).toBe(before);
      submitOperation(root, 'add');
      fixture.detectChanges();

      expect(root.querySelector('.error')?.textContent).toContain('already in the cache');
      expect(fixture.componentInstance['snapshot']()).toBe(before);
      expect(key.value).toBe(' A ');
      expect(size.value).toBe('3');

      setInputValue(key, 'B');
      submitOperation(root, 'add');
      fixture.detectChanges();

      expect(root.querySelector('.error')).toBeNull();
      expect(root.querySelectorAll('[data-testid="card"]')).toHaveLength(2);
      expect(root.querySelectorAll('[data-testid="event-list"] > li')).toHaveLength(2);
    });

    it('revalidates an edited oversized item without evicting until a valid submission', () => {
      setInputValue(requireElement<HTMLInputElement>(root, '[data-testid="capacity-input"]'), '2');
      prepareOperation(root, '2');
      submitOperation(root, 'add');
      fixture.detectChanges();
      const before = fixture.componentInstance['snapshot']();
      const saved = structuredClone(before);
      const key = requireElement<HTMLInputElement>(root, '[data-testid="item-key-input"]');
      const size = requireElement<HTMLInputElement>(root, '[data-testid="item-size-input"]');
      setInputValue(key, 'B');
      setInputValue(size, '3');
      submitOperation(root, 'add');
      fixture.detectChanges();
      expect(root.querySelector('.error')?.textContent).toContain('larger than');

      setInputValue(size, '4');
      fixture.detectChanges();

      expect(root.querySelector('.error')).toBeNull();
      expect(fixture.componentInstance['snapshot']()).toBe(before);
      submitOperation(root, 'add');
      fixture.detectChanges();

      expect(root.querySelector('.error')?.textContent).toContain('larger than');
      expect(size.value).toBe('4');
      expect(fixture.componentInstance['snapshot']()).toBe(before);
      expect(before).toEqual(saved);
      expect(requireElement(root, '[data-testid="evictions"]').textContent?.trim()).toBe('0');

      setInputValue(size, '2');
      submitOperation(root, 'add');
      fixture.detectChanges();

      expect(root.querySelector('.error')).toBeNull();
      expect(root.querySelectorAll('[data-testid="card"]')).toHaveLength(1);
      expect(requireElement(root, '[data-testid="card"]').textContent).toContain('B');
      expect(requireElement(root, '[data-testid="evictions"]').textContent?.trim()).toBe('1');
      expect(root.querySelectorAll('[data-testid="event-list"] > li')).toHaveLength(2);
      expect(before).toEqual(saved);
    });
  });

  it('does not announce an old event when reselecting the active strategy', () => {
    prepareOperation(root);
    clickButton(root, '[data-testid="add-button"]');
    fixture.detectChanges();
    const status = requireElement(root, '[data-testid="status"]').textContent;
    const announce = vi.spyOn(fixture.componentInstance['statusMessage'], 'set');
    const select = requireElement<HTMLSelectElement>(root, '#strategy');

    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(announce).not.toHaveBeenCalled();
    expect(requireElement(root, '[data-testid="status"]').textContent).toBe(status);
    expect(root.querySelectorAll('[data-testid="event-list"] > li')).toHaveLength(1);
  });

  it('retains a rejected guided step and completes it on a successful retry', () => {
    clickButton(root, '[data-testid="load-example-button"]');
    fixture.detectChanges();
    for (let index = 0; index < 7; index += 1) {
      clickButton(root, '[data-testid="next-step-button"]');
      fixture.detectChanges();
    }
    const status = requireElement(root, '[data-testid="status"]').textContent;
    const saved = fixture.componentInstance['snapshot']();
    const conflicting = engine.runCommand(saved, { type: 'add', key: 'D', size: 1 }).snapshot;
    fixture.componentInstance['snapshot'].set(conflicting);
    fixture.detectChanges();
    const announce = vi.spyOn(fixture.componentInstance['statusMessage'], 'set');

    clickButton(root, '[data-testid="next-step-button"]');
    fixture.detectChanges();

    expect(root.querySelector('[data-testid="example-complete"]')).toBeNull();
    expect(
      requireElement<HTMLButtonElement>(root, '[data-testid="next-step-button"]').disabled,
    ).toBe(false);
    expect(
      requireElement(root, '[data-testid="example-steps"] > li:last-child').getAttribute(
        'data-status',
      ),
    ).toBe('next');
    expect(root.querySelectorAll('[data-testid="event-list"] > li')).toHaveLength(8);
    expect(requireElement(root, '[data-testid="usage"]').textContent).toContain('10 / 10');
    expect(fixture.componentInstance['snapshot']()).toBe(conflicting);
    expect(root.querySelector('.error')?.textContent).toContain('already in the cache');
    expect(requireElement(root, '[data-testid="status"]').textContent).toBe(status);
    expect(announce).not.toHaveBeenCalled();

    fixture.componentInstance['snapshot'].set(saved);
    clickButton(root, '[data-testid="next-step-button"]');
    fixture.detectChanges();

    expect(root.querySelector('[data-testid="example-complete"]')).not.toBeNull();
    expect(root.querySelector('.error')).toBeNull();
    expect(root.querySelectorAll('[data-testid="event-list"] > li')).toHaveLength(8);
    expect(requireElement(root, '[data-testid="usage"]').textContent).toContain('10 / 10');
    expect(requireElement(root, '[data-testid="hits"]').textContent?.trim()).toBe('4');
    expect(announce).toHaveBeenCalledOnce();
    expect(requireElement(root, '[data-testid="status"]').textContent).toContain('Added "D"');
  });
});
