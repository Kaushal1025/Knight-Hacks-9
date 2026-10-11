// ==========================================
// Hand-pressable UI: pinch over a button to click it.
// Anything the hand cursor is over that isn't the 3D canvas counts as UI,
// so pinching over a panel never grabs a 3D object hidden behind it.
// Overlays with pointer-events: none (status box, hand skeletons, cursors)
// are ignored automatically by elementFromPoint.
// ==========================================

const CLICKABLE =
  'button, input[type="checkbox"], input[type="radio"], [role="button"], label';

const HOVER_CLASS = 'hand-hover';
const PRESS_CLASS = 'hand-press';
const PRESS_FLASH_MS = 160;

export interface HandUiTarget {
  /** True when the hand is over any page element other than the 3D canvas. */
  overUi: boolean;
  /** The button (or similar) under the hand, if it can be pressed. */
  clickable: HTMLElement | null;
}

const NOTHING: HandUiTarget = { overUi: false, clickable: null };

/** What page element is under the hand? x, y are normalized (0-1) screen coords. */
export function handUiTargetAt(x: number, y: number, canvas: HTMLElement): HandUiTarget {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return NOTHING;
  const el = document.elementFromPoint(x * window.innerWidth, y * window.innerHeight);
  if (!el || el === canvas || canvas.contains(el)) return NOTHING;

  const clickable = el.closest<HTMLElement>(CLICKABLE);
  const usable =
    clickable &&
    !(clickable as HTMLButtonElement | HTMLInputElement).disabled &&
    clickable.getAttribute('aria-disabled') !== 'true';

  // Only count it as UI if it's something that takes pointer input
  // (the app's full-screen wrapper div behind the canvas doesn't).
  if (el === document.body || el === document.documentElement || el.id === 'root') {
    return NOTHING;
  }
  return { overUi: true, clickable: usable ? clickable : null };
}

let hovered: HTMLElement | null = null;

/** Highlight the button under the hand (pass null to clear). */
export function setHandHover(el: HTMLElement | null) {
  if (el === hovered) return;
  hovered?.classList.remove(HOVER_CLASS);
  hovered = el;
  hovered?.classList.add(HOVER_CLASS);
}

/** Click a button with the hand, with a short visual flash. */
export function pressWithHand(el: HTMLElement) {
  el.classList.add(PRESS_CLASS);
  window.setTimeout(() => el.classList.remove(PRESS_CLASS), PRESS_FLASH_MS);
  el.click();
}
