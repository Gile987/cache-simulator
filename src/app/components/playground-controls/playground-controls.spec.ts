import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlaygroundControls } from './playground-controls';
import type { ControlDrafts, ControlRequest, DraftChange } from './playground-controls';
import { STRATEGIES } from '../../cache-engine/models';
import { MAX_KEY_LENGTH, MAX_VALUE, MIN_VALUE } from '../../cache-engine/validation';

function requireElement<T extends Element>(root: HTMLElement, selector: string): T {
  const element = root.querySelector(selector);
  if (element === null) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element as T;
}

describe('PlaygroundControls', () => {
  let fixture: ComponentFixture<PlaygroundControls>;
  let root: HTMLElement;
  let requests: ControlRequest[];
  let changes: DraftChange[];
  const drafts: ControlDrafts = Object.freeze({
    itemKey: 'A',
    itemSize: '3',
    accessKey: 'missing',
    capacity: '10',
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PlaygroundControls] }).compileComponents();
    fixture = TestBed.createComponent(PlaygroundControls);
    root = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('drafts', drafts);
    fixture.componentRef.setInput(
      'errors',
      Object.freeze({ key: null, size: null, access: null, capacity: null }),
    );
    fixture.componentRef.setInput('strategy', 'FIFO');
    fixture.componentRef.setInput('canEditCapacity', true);
    fixture.componentRef.setInput('exampleActive', false);
    requests = [];
    changes = [];
    fixture.componentInstance.operation.subscribe((request) => requests.push(request));
    fixture.componentInstance.draftChange.subscribe((change) => changes.push(change));
    fixture.detectChanges();
  });

  it.each([
    ['item-key', 'itemKey', '   A  '],
    ['item-size', 'itemSize', '1e1'],
    ['access-key', 'accessKey', ''],
    ['capacity', 'capacity', '1.5'],
  ] as const)('emits the raw %s draft without changing caller-owned values', (id, field, value) => {
    const input = requireElement<HTMLInputElement>(root, `[data-testid="${id}-input"]`);
    input.value = value;
    input.dispatchEvent(new Event('input'));

    expect(changes).toEqual([{ field, value }]);
    expect(fixture.componentInstance.drafts()).toBe(drafts);
    expect(requests).toEqual([]);
  });

  it('renders form limits and strategy options from the shared engine constants', () => {
    for (const id of ['capacity', 'item-size']) {
      const input = requireElement<HTMLInputElement>(root, `[data-testid="${id}-input"]`);
      expect(input.getAttribute('min')).toBe(String(MIN_VALUE));
      expect(input.getAttribute('max')).toBe(String(MAX_VALUE));
    }
    for (const id of ['item-key', 'access-key']) {
      const input = requireElement<HTMLInputElement>(root, `[data-testid="${id}-input"]`);
      expect(input.getAttribute('maxlength')).toBe(String(MAX_KEY_LENGTH));
    }
    const options = [...root.querySelectorAll<HTMLOptionElement>('#strategy option')];
    expect(options.map((option) => option.value)).toEqual([...STRATEGIES]);
  });

  describe.each(['add', 'access'] as const)('%s form', (operation) => {
    it('emits one request per click or submit and prevents navigation', () => {
      const form = requireElement<HTMLFormElement>(root, `[data-testid="${operation}-form"]`);
      const button = requireElement<HTMLButtonElement>(root, `[data-testid="${operation}-button"]`);
      const submissions: Event[] = [];
      form.addEventListener('submit', (event) => submissions.push(event));
      expect(button.form).toBe(form);
      expect(button.type).toBe('submit');
      expect(form.noValidate).toBe(true);

      button.click();
      expect(requests).toEqual([{ type: operation }]);
      expect(submissions).toHaveLength(1);
      expect(submissions[0]?.defaultPrevented).toBe(true);

      const event = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(event);
      requireElement<HTMLInputElement>(form, 'input').dispatchEvent(
        new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }),
      );

      expect(event.defaultPrevented).toBe(true);
      expect(requests).toEqual([{ type: operation }, { type: operation }]);
      expect(changes).toEqual([]);
      expect(fixture.componentInstance.drafts()).toBe(drafts);
    });
  });

  it.each([
    ['item-key', 'key'],
    ['item-size', 'size'],
    ['access-key', 'access'],
    ['capacity', 'capacity'],
  ] as const)('associates the %s input only with its rendered error', (id, field) => {
    const input = requireElement<HTMLInputElement>(root, `[data-testid="${id}-input"]`);
    const errorId = `${id}-error`;
    const errors = { key: null, size: null, access: null, capacity: null };

    expect(input.hasAttribute('aria-describedby')).toBe(false);
    expect(root.querySelector(`#${errorId}`)).toBeNull();

    for (const message of ['Enter a valid value.', 'Try another value.']) {
      fixture.componentRef.setInput('errors', { ...errors, [field]: message });
      fixture.detectChanges();

      expect(input.getAttribute('aria-describedby')).toBe(errorId);
      const error = requireElement(root, `#${errorId}`);
      expect(error.getAttribute('role')).toBe('alert');
      expect(error.textContent).toBe(message);
      expect(root.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
      for (const other of root.querySelectorAll('input')) {
        if (other !== input) {
          expect(other.hasAttribute('aria-describedby')).toBe(false);
        }
      }
    }

    for (const message of ['', null]) {
      fixture.componentRef.setInput('errors', { ...errors, [field]: message });
      fixture.detectChanges();

      expect(input.hasAttribute('aria-describedby')).toBe(false);
      expect(root.querySelector(`#${errorId}`)).toBeNull();
    }
  });

  it('displays rejection feedback and preserves drafts until the parent supplies accepted values', () => {
    requireElement<HTMLButtonElement>(root, '[data-testid="add-button"]').click();
    fixture.componentRef.setInput('errors', {
      key: 'Already resident.',
      size: null,
      access: null,
      capacity: null,
    });
    fixture.detectChanges();

    const key = requireElement<HTMLInputElement>(root, '[data-testid="item-key-input"]');
    const size = requireElement<HTMLInputElement>(root, '[data-testid="item-size-input"]');
    expect(key.value).toBe('A');
    expect(size.value).toBe('3');
    expect(key.getAttribute('aria-invalid')).toBe('true');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Already resident.');

    fixture.componentRef.setInput('drafts', { ...drafts, itemKey: '', itemSize: '' });
    fixture.componentRef.setInput('errors', {
      key: null,
      size: null,
      access: null,
      capacity: null,
    });
    fixture.detectChanges();

    expect(key.value).toBe('');
    expect(size.value).toBe('');
    expect(key.getAttribute('aria-invalid')).toBe('false');
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(requireElement<HTMLInputElement>(root, '[data-testid="access-key-input"]').value).toBe(
      'missing',
    );
  });

  it('requests a strategy change and retains the accepted selection until the parent updates it', () => {
    const select = requireElement<HTMLSelectElement>(root, '#strategy');
    select.value = 'LRU';
    select.dispatchEvent(new Event('change'));

    expect(requests).toEqual([{ type: 'setStrategy', strategy: 'LRU' }]);
    expect(select.value).toBe('FIFO');

    fixture.componentRef.setInput('strategy', 'LRU');
    fixture.detectChanges();

    expect(select.value).toBe('LRU');
    expect(root.querySelector('.help')?.textContent).toContain('Least Recently Used');
  });

  it('requests capacity application on change and ignores edits or changes when locked', () => {
    const capacity = requireElement<HTMLInputElement>(root, '[data-testid="capacity-input"]');
    capacity.dispatchEvent(new Event('change'));
    expect(requests).toEqual([{ type: 'setCapacity' }]);

    fixture.componentRef.setInput('canEditCapacity', false);
    fixture.detectChanges();
    expect(capacity.disabled).toBe(true);
    expect(root.textContent).toContain('Reset to change capacity.');

    capacity.value = '20';
    capacity.dispatchEvent(new Event('input'));
    capacity.dispatchEvent(new Event('change'));

    expect(requests).toHaveLength(1);
    expect(changes).toEqual([]);
  });

  it('blocks manual events in guided mode while retaining Reset and Load guided example', () => {
    fixture.componentRef.setInput('exampleActive', true);
    fixture.componentRef.setInput('canEditCapacity', false);
    fixture.detectChanges();

    for (const input of root.querySelectorAll<HTMLInputElement>('input')) {
      expect(input.disabled).toBe(true);
      input.value = '5';
      input.dispatchEvent(new Event('input'));
    }
    const select = requireElement<HTMLSelectElement>(root, '#strategy');
    expect(select.disabled).toBe(true);
    select.value = 'LFU';
    select.dispatchEvent(new Event('change'));
    for (const operation of ['add', 'access']) {
      expect(
        requireElement<HTMLButtonElement>(root, `[data-testid="${operation}-button"]`).disabled,
      ).toBe(true);
      const event = new Event('submit', { bubbles: true, cancelable: true });
      requireElement<HTMLFormElement>(root, `[data-testid="${operation}-form"]`).dispatchEvent(
        event,
      );
      expect(event.defaultPrevented).toBe(true);
    }
    requireElement<HTMLInputElement>(root, '[data-testid="capacity-input"]').dispatchEvent(
      new Event('change'),
    );

    expect(requests).toEqual([]);
    expect(changes).toEqual([]);
    expect(select.value).toBe('FIFO');

    requireElement<HTMLButtonElement>(root, '[data-testid="reset-button"]').click();
    requireElement<HTMLButtonElement>(root, '[data-testid="load-example-button"]').click();
    expect(requests).toEqual([{ type: 'reset' }, { type: 'loadExample' }]);
  });
});
