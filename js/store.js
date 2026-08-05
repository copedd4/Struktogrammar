// ── Store — pub/sub state manager ─────────────────────────────────────────────
// Replaces the global mutable `app` object.
// All diagram mutations go through snapshot() + dispatch() so undo/redo is
// always consistent.

import { STORAGE_KEY, RECOVERY_KEY } from './constants.js';
import { deepClone, normalizeState } from './state.js';

export class Store {
  // Private state
  #state;
  #history = [];
  #future  = [];
  #listeners = new Set();

  // UI-only ephemeral (not persisted to localStorage)
  selectedId       = null;
  clipboard        = null;
  zoom             = 1;
  fileHandle       = null;
  saveTimer        = null;
  expandedFnBlocks = new Set();
  contextMenu      = null;
  dragBlockType    = null;
  dragMoveId       = null;

  /**
   * @param {import('./state.js').AppState} initialState
   */
  constructor(initialState) {
    this.#state = initialState;
  }

  // ── Read ────────────────────────────────────────────────────────────────────

  /** @returns {import('./state.js').AppState} */
  getState() {
    return this.#state;
  }

  /** @returns {boolean} */
  canUndo() { return this.#history.length > 0; }

  /** @returns {boolean} */
  canRedo() { return this.#future.length > 0; }

  // ── Write ───────────────────────────────────────────────────────────────────

  /**
   * Apply an updater function that receives the current state and returns a new
   * (or mutated) state, then notify all subscribers.
   *
   * @param {function(import('./state.js').AppState): import('./state.js').AppState} updater
   */
  dispatch(updater) {
    this.#state = updater(this.#state);
    this.#notify();
  }

  /**
   * Subscribe to state changes.
   *
   * @param {function(import('./state.js').AppState): void} fn
   * @returns {function(): void}  Unsubscribe function.
   */
  subscribe(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  // ── History ─────────────────────────────────────────────────────────────────

  /**
   * Push the current state onto the undo stack and clear the redo stack.
   * Call this BEFORE any mutation that should be undoable.
   */
  snapshot() {
    this.#history.push(deepClone(this.#state));
    if (this.#history.length > 150) {this.#history.shift();}
    this.#future = [];
  }

  /**
   * Undo the last snapshotted mutation.
   *
   * @returns {boolean}  true if an undo was performed.
   */
  undo() {
    if (!this.#history.length) {return false;}
    this.#future.push(deepClone(this.#state));
    this.#state = normalizeState(this.#history.pop());
    this.#notify();
    return true;
  }

  /**
   * Redo the last undone mutation.
   *
   * @returns {boolean}  true if a redo was performed.
   */
  redo() {
    if (!this.#future.length) {return false;}
    this.#history.push(deepClone(this.#state));
    this.#state = normalizeState(this.#future.pop());
    this.#notify();
    return true;
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  /**
   * Persist the current state to localStorage.
   *
   * @param {boolean} [silent=false]  When true, skip the autosave status flash.
   * @param {object}  [el]            DOM element cache (needed for status text).
   * @param {Function} [trFn]         tr() translation helper.
   */
  persist(silent = false, el, trFn) {
    const json = JSON.stringify(this.#state);
    localStorage.setItem(STORAGE_KEY,  json);
    localStorage.setItem(RECOVERY_KEY, json);
    if (!silent && el && trFn) {
      const lang = this.#state.settings.language;
      const t = trFn(lang);
      el.autosaveStatus.textContent = t.autosaved;
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => {
        el.autosaveStatus.textContent = t.unsaved;
      }, 1600);
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  #notify() {
    this.#listeners.forEach((fn) => fn(this.#state));
  }
}
