/**
 * Minimal "something changed" signal so the wizard header (step progress)
 * can refresh after a page mutates IndexedDB, without a global state library.
 */
const EVENT = "anomia:data-changed";

export function notifyDataChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

export function onDataChanged(handler: () => void): () => void {
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
