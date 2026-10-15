export interface TourRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TourLayout {
  readonly card: TourRect;
  readonly spotlight: TourRect | null;
  readonly panels: readonly TourRect[];
  readonly mode: 'floating' | 'sheet' | 'centered';
}

const MARGIN = 16;
const GAP = 16;

function valid(rect: TourRect): boolean {
  return Object.values(rect).every(Number.isFinite) && rect.width > 0 && rect.height > 0;
}

export function clipRect(rect: TourRect, bounds: TourRect): TourRect | null {
  if (!valid(rect) || !valid(bounds)) return null;
  const x = Math.max(rect.x, bounds.x);
  const y = Math.max(rect.y, bounds.y);
  const width = Math.min(rect.x + rect.width, bounds.x + bounds.width) - x;
  const height = Math.min(rect.y + rect.height, bounds.y + bounds.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, high));
}

function panelsAround(hole: TourRect | null, viewport: TourRect): readonly TourRect[] {
  if (hole === null) return [viewport];
  return [
    { x: viewport.x, y: viewport.y, width: viewport.width, height: hole.y - viewport.y },
    { x: viewport.x, y: hole.y, width: hole.x - viewport.x, height: hole.height },
    {
      x: hole.x + hole.width,
      y: hole.y,
      width: viewport.x + viewport.width - hole.x - hole.width,
      height: hole.height,
    },
    {
      x: viewport.x,
      y: hole.y + hole.height,
      width: viewport.width,
      height: viewport.y + viewport.height - hole.y - hole.height,
    },
  ];
}

export function positionTour(
  target: TourRect | null,
  cardSize: { readonly width: number; readonly height: number },
  viewport: TourRect,
): TourLayout {
  const bounds = valid(viewport) ? viewport : { x: 0, y: 0, width: 320, height: 480 };
  const margin = Math.min(MARGIN, bounds.width / 4, bounds.height / 4);
  const width = Math.min(
    Number.isFinite(cardSize.width) && cardSize.width > 0 ? cardSize.width : 380,
    bounds.width - margin * 2,
  );
  const height = Math.min(
    Number.isFinite(cardSize.height) && cardSize.height > 0 ? cardSize.height : 300,
    bounds.height - margin * 2,
  );
  const inner = {
    x: bounds.x + margin,
    y: bounds.y + margin,
    width: bounds.width - margin * 2,
    height: bounds.height - margin * 2,
  };
  const centered = {
    x: bounds.x + (bounds.width - width) / 2,
    y: bounds.y + (bounds.height - height) / 2,
    width,
    height,
  };
  if (target === null || !valid(target)) {
    return { card: centered, spotlight: null, panels: [bounds], mode: 'centered' };
  }
  const padded = {
    x: target.x - 8,
    y: target.y - 8,
    width: target.width + 16,
    height: target.height + 16,
  };
  const hole = clipRect(padded, inner);
  if (hole !== null && bounds.width >= 640) {
    const y = clamp(hole.y, inner.y, inner.y + inner.height - height);
    const x = clamp(hole.x, inner.x, inner.x + inner.width - width);
    const candidates = [
      { x: hole.x + hole.width + GAP, y, width, height },
      { x: hole.x - GAP - width, y, width, height },
      { x, y: hole.y + hole.height + GAP, width, height },
      { x, y: hole.y - GAP - height, width, height },
    ];
    const card = candidates.find(
      (candidate) =>
        candidate.x >= inner.x &&
        candidate.y >= inner.y &&
        candidate.x + width <= inner.x + inner.width &&
        candidate.y + height <= inner.y + inner.height,
    );
    if (card !== undefined)
      return { card, spotlight: hole, panels: panelsAround(hole, bounds), mode: 'floating' };
  }
  const sheetHeight = Math.min(height, Math.max(bounds.height * 0.55, Math.min(200, inner.height)));
  const card = {
    ...centered,
    y: bounds.y + bounds.height - margin - sheetHeight,
    height: sheetHeight,
  };
  const spotlight = clipRect(padded, { ...inner, height: Math.max(0, card.y - GAP - inner.y) });
  if (spotlight === null) {
    return { card: centered, spotlight: null, panels: [bounds], mode: 'centered' };
  }
  return { card, spotlight, panels: panelsAround(spotlight, bounds), mode: 'sheet' };
}
