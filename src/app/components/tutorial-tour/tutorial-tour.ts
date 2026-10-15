import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  Injector,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { AfterRenderRef, ElementRef } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { TOUR_STEPS, tourNotes } from './tutorial-steps';
import type { TourContext } from './tutorial-steps';
import { positionTour } from './tutorial-position';
import type { TourLayout, TourRect } from './tutorial-position';

interface SavedStyle {
  readonly element: HTMLElement;
  readonly property: string;
  readonly value: string;
  readonly priority: string;
}

@Component({
  selector: 'app-tutorial-tour',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tutorial-tour.html',
  styleUrl: './tutorial-tour.scss',
})
export class TutorialTour {
  readonly surface = input.required<HTMLElement>();
  readonly context = input.required<TourContext>();

  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('tourDialog');
  private readonly card = viewChild<ElementRef<HTMLElement>>('tourCard');
  private readonly copy = viewChild<ElementRef<HTMLElement>>('tourCopy');
  private readonly heading = viewChild<ElementRef<HTMLElement>>('tourHeading');
  protected readonly activeIndex = signal<number | null>(null);
  protected readonly step = computed(() => {
    const index = this.activeIndex();
    return index === null ? null : (TOUR_STEPS[index] ?? null);
  });
  protected readonly notes = computed(() => {
    const step = this.step();
    return step === null ? [] : tourNotes(step.id, this.context());
  });
  protected readonly count = TOUR_STEPS.length;
  protected readonly layout = signal<TourLayout | null>(null);
  protected readonly fallback = signal(false);
  private renderRef: AfterRenderRef | null = null;
  private frame: number | null = null;
  private shouldScroll = false;
  private observer: ResizeObserver | null = null;
  private observedTarget: HTMLElement | null = null;
  private readonly listeners: (() => void)[] = [];
  private readonly savedStyles: SavedStyle[] = [];
  private returnFocus: HTMLElement | null = null;
  private previousScroll = { x: 0, y: 0 };
  private modal = false;

  constructor() {
    afterNextRender(() => this.start());
    this.destroyRef.onDestroy(() => this.close(false));
  }

  start(): void {
    if (this.activeIndex() !== null || this.destroyRef.destroyed) return;
    const active = this.document.activeElement;
    this.returnFocus =
      active instanceof HTMLElement && this.surface().contains(active)
        ? active
        : this.surface().querySelector<HTMLElement>('[data-tour-launch]');
    this.activeIndex.set(0);
    this.queueStep();
  }

  protected next(): void {
    const index = this.activeIndex();
    if (index === null) return;
    if (index === this.count - 1) {
      this.close();
      return;
    }
    this.activeIndex.set(index + 1);
    this.queueStep();
  }

  protected back(): void {
    const index = this.activeIndex();
    if (index === null || index === 0) return;
    this.activeIndex.set(index - 1);
    this.queueStep();
  }

  protected dismiss(event?: Event): void {
    event?.preventDefault();
    this.close();
  }

  protected nativeClosed(): void {
    if (this.modal && !this.dialog().nativeElement.open) this.close();
  }

  private queueStep(): void {
    this.renderRef?.destroy();
    this.layout.set(null);
    this.renderRef = afterNextRender(
      () => {
        this.renderRef = null;
        if (this.activeIndex() === null || this.destroyRef.destroyed) return;
        const dialog = this.dialog().nativeElement;
        if (!dialog.open) this.openDialog(dialog);
        this.heading()?.nativeElement.focus({ preventScroll: true });
        this.schedule(true);
      },
      { injector: this.injector },
    );
  }

  private openDialog(dialog: HTMLDialogElement): void {
    try {
      if (typeof dialog.showModal !== 'function' || typeof dialog.close !== 'function') {
        this.openFallback(dialog);
        return;
      }
      dialog.showModal();
    } catch {
      this.openFallback(dialog);
      return;
    }
    this.modal = true;
    const window = this.document.defaultView;
    if (window === null) return;
    this.previousScroll = { x: window.scrollX, y: window.scrollY };
    const root = this.document.documentElement;
    const body = this.document.body;
    const scrollbar = root.clientWidth > 0 ? Math.max(0, window.innerWidth - root.clientWidth) : 0;
    const style = window.getComputedStyle(body);
    this.saveStyle(root, 'overflow', 'hidden');
    this.saveStyle(body, 'overflow', 'hidden');
    this.saveStyle(
      body,
      'padding-bottom',
      `calc(${style.paddingBottom || '0px'} + ${window.innerHeight}px)`,
    );
    if (scrollbar > 0)
      this.saveStyle(
        body,
        'padding-right',
        `calc(${style.paddingRight || '0px'} + ${scrollbar}px)`,
      );
    this.listen(window, 'resize', () => this.schedule(true));
    this.listen(window, 'scroll', () => this.schedule(), true);
    if (window.visualViewport !== null && window.visualViewport !== undefined) {
      this.listen(window.visualViewport, 'resize', () => this.schedule(true));
      this.listen(window.visualViewport, 'scroll', () => this.schedule());
    }
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.schedule());
    }
  }

  private openFallback(dialog: HTMLDialogElement): void {
    this.fallback.set(true);
    dialog.setAttribute('open', '');
  }

  private saveStyle(element: HTMLElement, property: string, value: string): void {
    this.savedStyles.push({
      element,
      property,
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property),
    });
    element.style.setProperty(property, value);
  }

  private listen(target: EventTarget, type: string, handler: () => void, capture = false): void {
    target.addEventListener(type, handler, capture);
    this.listeners.push(() => target.removeEventListener(type, handler, capture));
  }

  private schedule(scroll = false): void {
    const window = this.document.defaultView;
    if (window === null || this.activeIndex() === null || this.fallback()) return;
    this.shouldScroll ||= scroll;
    if (this.frame !== null) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = null;
      if (this.activeIndex() !== null) this.measure();
    });
  }

  private measure(): void {
    const window = this.document.defaultView;
    const card = this.card()?.nativeElement;
    const step = this.step();
    if (window === null || card === undefined || step === null) return;
    const viewport = window.visualViewport;
    const bounds = {
      x: viewport?.offsetLeft ?? 0,
      y: viewport?.offsetTop ?? 0,
      width: viewport?.width ?? window.innerWidth,
      height: viewport?.height ?? window.innerHeight,
    };
    const target =
      step.kind === 'target'
        ? this.surface().querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
        : null;
    if (target !== this.observedTarget || this.layout() === null) {
      this.observer?.disconnect();
      this.observer?.observe(card);
      if (target !== null) this.observer?.observe(target);
      this.observedTarget = target;
    }
    let rect = this.targetRect(target);
    if (this.shouldScroll && rect !== null) {
      const top = Math.max(0, window.scrollY + rect.y - bounds.y - 24);
      if (Math.abs(top - window.scrollY) > 1) window.scrollTo({ top, behavior: 'instant' });
      rect = this.targetRect(target);
    }
    this.shouldScroll = false;
    const measured = card.getBoundingClientRect();
    const copy = this.copy()?.nativeElement;
    const hiddenCopy = copy === undefined ? 0 : Math.max(0, copy.scrollHeight - copy.clientHeight);
    const height = Math.max(measured.height, card.scrollHeight) + hiddenCopy;
    const layout = positionTour(rect, { width: 380, height }, bounds);
    if (JSON.stringify(layout) !== JSON.stringify(this.layout())) this.layout.set(layout);
  }

  private targetRect(target: HTMLElement | null): TourRect | null {
    if (target === null || !target.isConnected || target.closest('[hidden]') !== null) return null;
    const style = this.document.defaultView?.getComputedStyle(target);
    if (style?.display === 'none' || style?.visibility === 'hidden') return null;
    const rect = target.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0
      ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      : null;
  }

  private canRestoreFocus(element: HTMLElement | null): element is HTMLElement {
    if (
      element === null ||
      !element.isConnected ||
      element.matches(':disabled, [aria-disabled="true"]')
    )
      return false;
    for (let parent: HTMLElement | null = element; parent !== null; parent = parent.parentElement) {
      const style = this.document.defaultView?.getComputedStyle(parent);
      if (
        parent.hidden ||
        parent.hasAttribute('inert') ||
        style?.display === 'none' ||
        style?.visibility === 'hidden'
      )
        return false;
    }
    return true;
  }

  private close(restoreFocus = true): void {
    if (this.activeIndex() === null) return;
    this.activeIndex.set(null);
    this.renderRef?.destroy();
    this.renderRef = null;
    const window = this.document.defaultView;
    if (this.frame !== null) window?.cancelAnimationFrame(this.frame);
    this.frame = null;
    this.shouldScroll = false;
    this.observer?.disconnect();
    this.observer = null;
    this.observedTarget = null;
    for (const remove of this.listeners.splice(0)) remove();
    for (const saved of this.savedStyles.splice(0)) {
      if (saved.value === '') saved.element.style.removeProperty(saved.property);
      else saved.element.style.setProperty(saved.property, saved.value, saved.priority);
    }
    const dialog = this.dialog().nativeElement;
    if (this.modal && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
    if (this.modal)
      window?.scrollTo({
        left: this.previousScroll.x,
        top: this.previousScroll.y,
        behavior: 'instant',
      });
    this.modal = false;
    this.fallback.set(false);
    this.layout.set(null);
    if (restoreFocus) {
      const saved = this.returnFocus;
      const launch = this.surface().querySelector<HTMLElement>('[data-tour-launch]');
      const target = this.canRestoreFocus(saved) ? saved : launch;
      if (this.canRestoreFocus(target)) target.focus();
      else {
        const heading = this.surface().querySelector<HTMLElement>('h1');
        if (this.canRestoreFocus(heading)) {
          const previous = heading.getAttribute('tabindex');
          heading.setAttribute('tabindex', '-1');
          heading.focus();
          if (previous === null) heading.removeAttribute('tabindex');
          else heading.setAttribute('tabindex', previous);
        }
      }
    }
    this.returnFocus = null;
  }
}
