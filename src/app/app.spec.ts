import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './app';

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
});
