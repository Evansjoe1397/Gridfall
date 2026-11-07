import { CARD_REFERENCES } from './card-references.ts';
import { cardTextHtml } from './card-typography.ts';

/** Delegation covers Cards inserted by every render, including nested references. */
export function installCardReferencePopup(renderCard: (id: string) => string): void {
  const entries: { referenceId: string; anchor: HTMLElement; popup: HTMLDivElement }[] = [];
  let nextPopupId = 0;
  let pinned = false;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  const cancelClose = () => clearTimeout(closeTimer);
  const hide = () => {
    cancelClose();
    for (const { anchor, popup } of entries) {
      anchor.removeAttribute('aria-expanded');
      anchor.removeAttribute('aria-controls');
      popup.remove();
    }
    entries.length = 0;
    pinned = false;
  };
  const scheduleClose = () => {
    cancelClose();
    if (pinned) return;
    closeTimer = setTimeout(hide, 240);
  };
  const referenceAt = (target: EventTarget | null) => target instanceof Element
    ? target.closest<HTMLElement>('[data-card-reference]') : null;
  const insidePopup = (target: EventTarget | null) => target instanceof Node
    && entries.some(({ popup }) => popup.contains(target));
  const show = (element: HTMLElement) => {
    cancelClose();
    if (entries.some(({ anchor }) => anchor === element)) return;
    const reference = CARD_REFERENCES.find((entry) => entry.id === element.dataset.cardReference);
    if (!reference) return;
    // Deduplicate by content, not by link: self-references and A → B → A
    // cycles must not create more copies of an already visible Card/effect.
    if (entries.some(({ referenceId }) => referenceId === reference.id)) return;
    // Following new nested references preserves every ancestor.
    const parent = entries.find(({ popup }) => popup.contains(element));
    if (!parent) hide();
    const rect = (parent?.popup ?? element).getBoundingClientRect();
    const popup = document.createElement('div');
    popup.className = 'card-reference-popup';
    popup.id = `cardReferencePopup-${++nextPopupId}`;
    popup.setAttribute('role', 'region');
    popup.setAttribute('aria-label', reference.name);
    popup.style.zIndex = String(10000 + entries.length);
    element.setAttribute('aria-expanded', 'true');
    element.setAttribute('aria-controls', popup.id);
    popup.innerHTML = reference.cardId ? renderCard(reference.cardId)
      : `<article class="effect-reference"><strong>${reference.name}</strong><p>${cardTextHtml(reference.description ?? '')}</p></article>`;
    document.body.append(popup);
    const { width, height } = popup.getBoundingClientRect();
    // Prefer space beside the parent, then above/below. On a narrow viewport,
    // choose the position covering the least area of the existing chain.
    const candidates = [
      { left: rect.right + 10, top: rect.top },
      { left: rect.left - width - 10, top: rect.top },
      { left: rect.left, top: rect.bottom + 10 },
      { left: rect.left, top: rect.top - height - 10 },
    ].map(({ left, top }) => ({
      left: Math.max(12, Math.min(window.innerWidth - width - 12, left)),
      top: Math.max(12, Math.min(window.innerHeight - height - 12, top)),
    }));
    const overlap = ({ left, top }: { left: number; top: number }) => entries.reduce((area, entry) => {
      const other = entry.popup.getBoundingClientRect();
      return area + Math.max(0, Math.min(left + width, other.right) - Math.max(left, other.left))
        * Math.max(0, Math.min(top + height, other.bottom) - Math.max(top, other.top));
    }, 0);
    const position = candidates.reduce((best, candidate) => overlap(candidate) < overlap(best) ? candidate : best);
    popup.style.left = `${position.left}px`;
    popup.style.top = `${position.top}px`;
    entries.push({ referenceId: reference.id, anchor: element, popup });
  };
  document.addEventListener('pointerover', (event) => {
    const reference = referenceAt(event.target);
    if (reference) show(reference);
    else if (insidePopup(event.target)) cancelClose();
  });
  document.addEventListener('pointerout', (event) => {
    if (referenceAt(event.target) || insidePopup(event.target)) scheduleClose();
  });
  document.addEventListener('focusin', (event) => {
    const reference = referenceAt(event.target);
    if (reference) show(reference);
    else if (!insidePopup(event.target)) hide();
  });
  document.addEventListener('focusout', scheduleClose);
  // Intercept link activation before a containing Card button can play/discard it.
  for (const type of ['pointerdown', 'click'] as const) {
    document.addEventListener(type, (event) => {
      const reference = referenceAt(event.target);
      if (reference) {
        event.preventDefault();
        event.stopImmediatePropagation();
        show(reference);
        if (event instanceof PointerEvent && event.pointerType !== 'mouse') pinned = true;
      } else if (type === 'pointerdown' && !insidePopup(event.target)) hide();
    }, true);
  }
  document.addEventListener('keydown', (event) => {
    const reference = referenceAt(event.target);
    if (reference && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      show(reference);
      pinned = true;
    } else if (event.key === 'Escape' && entries.length > 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
      hide();
    }
  }, true);
  window.addEventListener('resize', hide);
  document.addEventListener('scroll', (event) => {
    if (!insidePopup(event.target)) hide();
  }, true);
}
