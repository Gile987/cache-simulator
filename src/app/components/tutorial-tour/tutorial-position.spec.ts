import { describe, expect, it } from 'vitest';
import { clipRect, positionTour } from './tutorial-position';
import type { TourRect } from './tutorial-position';

const viewport = { x: 0, y: 0, width: 1200, height: 800 };
const size = { width: 300, height: 240 };

function overlaps(a: TourRect, b: TourRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

describe('tour placement', () => {
  it.each([
    [{ x: 400, y: 100, width: 200, height: 200 }, 'right'],
    [{ x: 900, y: 100, width: 180, height: 200 }, 'left'],
    [{ x: 16, y: 16, width: 1168, height: 100 }, 'below'],
    [{ x: 16, y: 500, width: 1168, height: 260 }, 'above'],
  ] as const)('fits a card without obscuring its target (%j, %s)', (target, side) => {
    const layout = positionTour(target, size, viewport);
    expect(layout.mode).toBe('floating');
    expect(layout.spotlight).not.toBeNull();
    expect(overlaps(layout.card, target)).toBe(false);
    if (side === 'right') expect(layout.card.x).toBeGreaterThan(target.x + target.width);
    if (side === 'left') expect(layout.card.x + layout.card.width).toBeLessThan(target.x);
    if (side === 'below') expect(layout.card.y).toBeGreaterThan(target.y + target.height);
    if (side === 'above') expect(layout.card.y + layout.card.height).toBeLessThan(target.y);
  });

  it.each([
    { x: 0, y: 0, width: 390, height: 700 },
    { x: 30, y: 90, width: 390, height: 320 },
    { x: 0, y: 0, width: 240, height: 200 },
  ])('reserves a sheet and clips tall targets to the visible viewport (%j)', (bounds) => {
    const layout = positionTour(
      { x: 0, y: 0, width: 1200, height: 3000 },
      { width: 380, height: 900 },
      bounds,
    );
    expect(layout.mode).toBe(bounds.height < 240 ? 'centered' : 'sheet');
    expect(layout.card.x).toBeGreaterThanOrEqual(bounds.x);
    expect(layout.card.y).toBeGreaterThanOrEqual(bounds.y);
    expect(layout.card.x + layout.card.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    expect(layout.card.y + layout.card.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    const hole = layout.spotlight;
    if (bounds.height >= 240) {
      expect(hole).not.toBeNull();
    } else {
      expect(hole).toBeNull();
    }
    if (hole !== null) expect(overlaps(hole, layout.card)).toBe(false);
    const area = layout.panels.reduce(
      (sum, panel) => {
        expect(panel.width).toBeGreaterThanOrEqual(0);
        expect(panel.height).toBeGreaterThanOrEqual(0);
        return sum + panel.width * panel.height;
      },
      hole === null ? 0 : hole.width * hole.height,
    );
    expect(area).toBeCloseTo(bounds.width * bounds.height);
  });

  it.each([null, { x: NaN, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 0, height: 10 }])(
    'centers explanations for unavailable targets (%j)',
    (target) => {
      const layout = positionTour(target, size, viewport);
      expect(layout.mode).toBe('centered');
      expect(layout.spotlight).toBeNull();
      expect(layout.panels).toEqual([viewport]);
      expect(layout.card).toEqual({ x: 450, y: 280, ...size });
    },
  );

  it('clips partially visible rectangles without adding document scroll offsets', () => {
    expect(
      clipRect(
        { x: -20, y: 70, width: 100, height: 90 },
        { x: 10, y: 80, width: 200, height: 100 },
      ),
    ).toEqual({ x: 10, y: 80, width: 70, height: 80 });
    expect(
      clipRect({ x: 900, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: 390, height: 700 }),
    ).toBeNull();
  });

  it('leaves enough sheet height for navigation and readable scrolling copy on short screens', () => {
    const layout = positionTour(
      { x: 16, y: 20, width: 358, height: 500 },
      { width: 380, height: 400 },
      { x: 0, y: 0, width: 390, height: 320 },
    );
    expect(layout.card.height).toBeGreaterThanOrEqual(200);
    expect(layout.spotlight).not.toBeNull();
  });

  it('recovers from invalid viewport or card measurements with finite geometry', () => {
    const layout = positionTour(
      null,
      { width: NaN, height: Infinity },
      { x: 0, y: 0, width: 0, height: 0 },
    );
    expect(Object.values(layout.card).every(Number.isFinite)).toBe(true);
    expect(layout.card.width).toBeGreaterThan(0);
    expect(layout.card.height).toBeGreaterThan(0);
  });
});
