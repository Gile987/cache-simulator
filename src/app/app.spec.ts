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
