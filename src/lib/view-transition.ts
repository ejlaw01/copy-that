import { flushSync } from "react-dom";

/**
 * Wraps a DOM-mutating callback in the View Transitions API when available.
 * Falls back to running the callback immediately in unsupported browsers.
 *
 * Uses flushSync to force React to commit state updates to the DOM
 * synchronously inside the callback. Without this, React batches
 * setState calls and defers the DOM update — startViewTransition
 * would snapshot the old DOM, run the callback, see no DOM change,
 * and skip the animation entirely.
 *
 * flushSync is normally discouraged because it blocks the main thread,
 * but view transitions are the canonical use case for it — the browser
 * needs the DOM to reflect the new state before it can animate.
 */
export function withViewTransition(callback: () => void): void {
  if (document.startViewTransition) {
    document.startViewTransition(() => {
      flushSync(callback);
    });
  } else {
    callback();
  }
}
