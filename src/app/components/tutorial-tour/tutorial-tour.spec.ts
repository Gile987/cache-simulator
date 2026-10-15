import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TutorialTour } from './tutorial-tour';
import { TOUR_STEPS, TOUR_TARGETS } from './tutorial-steps';

function requireElement<T extends Element>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing element: ${selector}`);
  return element;
}

describe('TutorialTour', () => {
  let fixture: ComponentFixture<TutorialTour>;
  let root: HTMLElement;
  let surface: HTMLElement;
  let launch: HTMLButtonElement;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  let savedShow: PropertyDescriptor | undefined;
  let savedClose: PropertyDescriptor | undefined;
  let savedRequest: PropertyDescriptor | undefined;
  let savedCancel: PropertyDescriptor | undefined;
  let scroll: ReturnType<typeof vi.spyOn>;
  const observers: Observer[] = [];

  class Observer implements ResizeObserver {
    readonly observe = vi.fn();
    readonly unobserve = vi.fn();
    readonly disconnect = vi.fn();
    constructor(readonly callback: ResizeObserverCallback) {
      observers.push(this);
    }
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
    fixture.detectChanges();
  }

  async function click(action: 'next' | 'back' | 'skip'): Promise<void> {
    requireElement<HTMLButtonElement>(root, `[data-testid="tour-${action}"]`).click();
    await settle();
  }

  function restore(object: object, key: string, descriptor: PropertyDescriptor | undefined): void {
    if (descriptor === undefined) Reflect.deleteProperty(object, key);
    else Object.defineProperty(object, key, descriptor);
  }

  beforeEach(async () => {
    frames = new Map();
    nextFrame = 0;
    observers.length = 0;
    savedShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
    savedClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
    savedRequest = Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame');
    savedCancel = Object.getOwnPropertyDescriptor(window, 'cancelAnimationFrame');
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute('open');
        this.dispatchEvent(new Event('close'));
      },
    });
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        frames.set(++nextFrame, callback);
        return nextFrame;
      },
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      value: (id: number) => frames.delete(id),
    });
    vi.stubGlobal('ResizeObserver', Observer);
    scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.classList.contains('tour-card')
        ? new DOMRect(0, 0, 380, 300)
        : new DOMRect(60, 50, 300, 100);
    });
    surface = document.createElement('div');
    launch = document.createElement('button');
    launch.setAttribute('data-tour-launch', '');
    launch.textContent = 'Take a tour';
    surface.append(launch);
    for (const target of TOUR_TARGETS) {
      const element = document.createElement('section');
      element.dataset['tour'] = target;
      surface.append(element);
    }
    document.body.append(surface);
    launch.focus();
    await TestBed.configureTestingModule({ imports: [TutorialTour] }).compileComponents();
    fixture = TestBed.createComponent(TutorialTour);
    root = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('surface', surface);
    fixture.componentRef.setInput('context', {
      capacityEditable: true,
      exampleActive: false,
      cacheEmpty: true,
    });
    await settle();
  });

  afterEach(() => {
    fixture.destroy();
    surface.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    restore(HTMLDialogElement.prototype, 'showModal', savedShow);
    restore(HTMLDialogElement.prototype, 'close', savedClose);
    restore(window, 'requestAnimationFrame', savedRequest);
    restore(window, 'cancelAnimationFrame', savedCancel);
  });

  it('opens once, focuses its heading, skips, and starts replay from the welcome', async () => {
    const dialog = requireElement<HTMLDialogElement>(root, 'dialog');
    expect(dialog.open).toBe(true);
    expect(document.activeElement?.id).toBe('tour-title');
    expect(root.textContent).toContain('Step 1 of 14');
    expect(root.querySelector('.mascot')?.getAttribute('aria-hidden')).toBe('true');
    await click('skip');
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(launch);
    await settle();
    expect(dialog.open).toBe(false);
    fixture.componentInstance.start();
    await settle();
    expect(root.querySelector('[data-step="welcome"]')).not.toBeNull();
  });

  it('uses every target in order, supports Back, and finishes at the boundary', async () => {
    for (let index = 0; index < TOUR_STEPS.length; index++) {
      const step = TOUR_STEPS[index];
      if (step === undefined) throw new Error('Missing step');
      expect(root.querySelector('.tour-card')?.getAttribute('data-step')).toBe(step.id);
      if (step.kind === 'target') {
        expect(observers[0]?.observe).toHaveBeenCalledWith(
          surface.querySelector(`[data-tour="${step.target}"]`),
        );
        expect(root.querySelector('.spotlight')).not.toBeNull();
      } else {
        expect(root.querySelector('.spotlight')).toBeNull();
      }
      if (index === 1) {
        await click('back');
        expect(root.querySelector('[data-step="welcome"]')).not.toBeNull();
        await click('next');
      }
      await click('next');
    }
    expect(requireElement<HTMLDialogElement>(root, 'dialog').open).toBe(false);
    expect(root.querySelector('.tour-card')).toBeNull();
    expect(document.activeElement).toBe(launch);
  });

  it('recovers from a missing or hidden target without losing navigation', async () => {
    surface.querySelector('[data-tour="strategy"]')?.remove();
    await click('next');
    expect(root.querySelector('.tour-card')?.getAttribute('data-placement')).toBe('centered');
    expect(root.querySelector('.spotlight')).toBeNull();
    const capacity = requireElement<HTMLElement>(surface, '[data-tour="capacity"]');
    capacity.hidden = true;
    await click('next');
    expect(root.querySelector('.spotlight')).toBeNull();
    await click('next');
    expect(root.querySelector('[data-step="add"]')).not.toBeNull();
    expect(root.querySelector('.spotlight')).not.toBeNull();
  });

  it('adds context for guided mode, capacity locking, and empty item cards', async () => {
    fixture.componentRef.setInput('context', {
      capacityEditable: false,
      exampleActive: true,
      cacheEmpty: true,
    });
    await click('next');
    expect(root.textContent).toContain('manual controls are disabled');
    await click('next');
    expect(root.textContent).toContain(
      'Capacity is currently locked because the guided example is loaded.',
    );
    for (let index = 0; index < 4; index++) await click('next');
    expect(root.textContent).toContain('This area is empty until you add an item.');
  });

  it('dismisses on Escape or native cancellation and restores the saved scroll styles', async () => {
    await click('skip');
    document.documentElement.style.setProperty('overflow', 'clip', 'important');
    document.body.style.paddingBottom = '7px';
    fixture.componentInstance.start();
    await settle();
    const dialog = requireElement<HTMLDialogElement>(root, 'dialog');
    const event = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(event);
    await settle();
    expect(event.defaultPrevented).toBe(true);
    expect(document.documentElement.style.overflow).toBe('clip');
    expect(document.documentElement.style.getPropertyPriority('overflow')).toBe('important');
    expect(document.body.style.paddingBottom).toBe('7px');
    expect(scroll).toHaveBeenCalled();
    document.documentElement.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-bottom');
    fixture.componentInstance.start();
    await settle();
    dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    await settle();
    expect(dialog.open).toBe(false);
  });

  it('coalesces resize work without stealing focus and removes observers and listeners on close', async () => {
    const next = requireElement<HTMLButtonElement>(root, '[data-testid="tour-next"]');
    next.focus();
    for (let index = 0; index < 5; index++) window.dispatchEvent(new Event('resize'));
    expect(frames.size).toBe(1);
    await settle();
    expect(document.activeElement).toBe(next);
    await click('skip');
    const count = scroll.mock.calls.length;
    window.dispatchEvent(new Event('resize'));
    expect(frames.size).toBe(0);
    expect(observers.every((observer) => observer.disconnect.mock.calls.length > 0)).toBe(true);
    expect(scroll.mock.calls.length).toBe(count);
  });

  it('cleans up a queued frame on destruction and restores focus to a surviving launch button', async () => {
    const original = document.createElement('button');
    surface.append(original);
    await click('skip');
    original.focus();
    fixture.componentInstance.start();
    await settle();
    original.remove();
    await click('skip');
    expect(document.activeElement).toBe(launch);
    fixture.componentInstance.start();
    await settle();
    window.dispatchEvent(new Event('resize'));
    expect(frames.size).toBe(1);
    fixture.destroy();
    expect(frames.size).toBe(0);
    expect(document.documentElement.style.overflow).not.toBe('hidden');
  });

  it('falls back to ordinary help if native modality is unavailable and can still finish', async () => {
    await click('skip');
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    fixture.componentInstance.start();
    await settle();
    expect(root.querySelector('dialog')?.classList.contains('fallback')).toBe(true);
    expect(root.querySelector('dialog')?.hasAttribute('aria-modal')).toBe(false);
    expect(root.querySelector('.shade')).toBeNull();
    expect(document.documentElement.style.overflow).not.toBe('hidden');
    for (let index = 0; index < TOUR_STEPS.length; index++) await click('next');
    expect(requireElement<HTMLDialogElement>(root, 'dialog').open).toBe(false);
  });

  it('handles refused modal opening without locking the page or losing dismissal', async () => {
    await click('skip');
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: () => {
        throw new DOMException('Modal opening refused');
      },
    });
    fixture.componentInstance.start();
    await settle();
    expect(root.querySelector('dialog')?.classList.contains('fallback')).toBe(true);
    expect(document.documentElement.style.overflow).not.toBe('hidden');
    await click('skip');
    expect(root.querySelector('.tour-card')).toBeNull();
  });

  it('cancels pending navigation when skipped and ignores stale close events during replay', async () => {
    requireElement<HTMLButtonElement>(root, '[data-testid="tour-next"]').click();
    requireElement<HTMLButtonElement>(root, '[data-testid="tour-skip"]').click();
    fixture.componentInstance.start();
    requireElement(root, 'dialog').dispatchEvent(new Event('close'));
    await settle();
    expect(root.querySelector('[data-step="welcome"]')).not.toBeNull();
    expect(requireElement<HTMLDialogElement>(root, 'dialog').open).toBe(true);
    requireElement(root, 'dialog').dispatchEvent(new Event('close'));
    await settle();
    expect(root.querySelector('[data-step="welcome"]')).not.toBeNull();
  });

  it('cleans up when a native dialog closes outside the navigation handlers', async () => {
    requireElement<HTMLDialogElement>(root, 'dialog').close();
    await settle();
    expect(root.querySelector('.tour-card')).toBeNull();
    expect(document.documentElement.style.overflow).not.toBe('hidden');
    fixture.componentInstance.start();
    await settle();
    expect(requireElement<HTMLDialogElement>(root, 'dialog').open).toBe(true);
  });

  it('returns focus to a visible fallback if the original control is hidden', async () => {
    await click('skip');
    const original = document.createElement('button');
    surface.append(original);
    original.focus();
    fixture.componentInstance.start();
    await settle();
    original.style.display = 'none';
    await click('skip');
    expect(document.activeElement).toBe(launch);

    fixture.componentInstance.start();
    await settle();
    launch.hidden = true;
    const heading = document.createElement('h1');
    heading.textContent = 'Playground';
    surface.append(heading);
    await click('skip');
    expect(document.activeElement).toBe(heading);
    expect(heading.hasAttribute('tabindex')).toBe(false);
  });
});
