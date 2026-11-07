export type OverlayBounds = { left: number; right: number; top: number; bottom: number; width: number; height: number };
type Observer = Pick<ResizeObserver, 'observe' | 'unobserve'>;

/** Layout reports intrinsic sizes asynchronously; animation only reads this cache. */
export class OverlayMeasurements {
  private readonly sizes = new WeakMap<Element, { width: number; height: number }>();
  private readonly observer: Observer;

  constructor(createObserver: (callback: ResizeObserverCallback) => Observer = callback => new ResizeObserver(callback)) {
    this.observer = createObserver(entries => {
      for (const entry of entries) {
        const border = entry.borderBoxSize?.[0];
        const width = border?.inlineSize ?? entry.contentRect.width;
        const height = border?.blockSize ?? entry.contentRect.height;
        if (width > 0 && height > 0) this.sizes.set(entry.target, { width, height });
      }
    });
  }

  observe(element: Element) {
    if (this.sizes.has(element)) return;
    this.sizes.set(element, { width: 0, height: 0 });
    this.observer.observe(element, { box: 'border-box' });
  }

  forget(element: Element) {
    this.observer.unobserve(element);
    this.sizes.delete(element);
  }

  width(element: Element) { return this.sizes.get(element)?.width ?? 0; }

  statusBounds(element: Element, x: number, y: number, scale: number): OverlayBounds | undefined {
    const size = this.sizes.get(element);
    if (!size?.width || !size.height) return undefined;
    return statusOverlayBounds(x, y, scale, size.width, size.height);
  }
}

/** Mirrors the status row's bottom-center transform origin and 9px anchor gap. */
export function statusOverlayBounds(x: number, y: number, scale: number, intrinsicWidth: number, intrinsicHeight: number): OverlayBounds {
  const width = intrinsicWidth * scale, height = intrinsicHeight * scale;
  return { left: x - width / 2, right: x + width / 2, top: y - 9 - height, bottom: y - 9, width, height };
}

export function positionOverlay(element: HTMLElement, x: number, y: number) {
  element.style.setProperty('--overlay-x', `${x}px`);
  element.style.setProperty('--overlay-y', `${y}px`);
}
