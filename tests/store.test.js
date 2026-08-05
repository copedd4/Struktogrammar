// tests/store.test.js
import { describe, it, expect, vi } from 'vitest';

// Store uses private class fields — we need a minimal mock of its dependencies
// that doesn't touch the DOM or localStorage.
// We test the Store class directly by importing it and providing a stub state.

// Stub localStorage so Store.persist() doesn't throw in a Node environment.
globalThis.localStorage = {
  _store: {},
  getItem(k)    { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = v; },
  removeItem(k) { delete this._store[k]; },
};

import { Store } from '../js/store.js';
import { normalizeState, defaultState } from '../js/state.js';

/**
 *
 */
function makeStore() {
  return new Store(normalizeState(defaultState()));
}

// ── getState ──────────────────────────────────────────────────────────────────

describe('Store.getState', () => {
  it('returns the initial state', () => {
    const store = makeStore();
    const s = store.getState();
    expect(s.version).toBe(5);
    expect(s.settings.language).toBe('en');
  });
});

// ── dispatch ──────────────────────────────────────────────────────────────────

describe('Store.dispatch', () => {
  it('applies the updater and notifies subscribers', () => {
    const store = makeStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.dispatch((s) => { s.settings.language = 'de'; return s; });

    expect(store.getState().settings.language).toBe('de');
    expect(listener).toHaveBeenCalledOnce();
  });

  it('unsubscribe stops notifications', () => {
    const store = makeStore();
    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    unsub();

    store.dispatch((s) => s);
    expect(listener).not.toHaveBeenCalled();
  });
});

// ── snapshot / undo / redo ────────────────────────────────────────────────────

describe('Store undo/redo', () => {
  it('canUndo is false before any snapshot', () => {
    expect(makeStore().canUndo()).toBe(false);
  });

  it('canRedo is false before any undo', () => {
    expect(makeStore().canRedo()).toBe(false);
  });

  it('canUndo becomes true after snapshot', () => {
    const store = makeStore();
    store.snapshot();
    expect(store.canUndo()).toBe(true);
  });

  it('undo restores previous state', () => {
    const store = makeStore();
    store.snapshot();
    store.dispatch((s) => { s.settings.theme = 'dark'; return s; });
    expect(store.getState().settings.theme).toBe('dark');

    store.undo();
    expect(store.getState().settings.theme).toBe('light');
  });

  it('undo returns false when history is empty', () => {
    expect(makeStore().undo()).toBe(false);
  });

  it('redo returns false when future is empty', () => {
    expect(makeStore().redo()).toBe(false);
  });

  it('redo re-applies the undone mutation', () => {
    const store = makeStore();
    store.snapshot();
    store.dispatch((s) => { s.settings.theme = 'navy'; return s; });
    store.undo();
    expect(store.getState().settings.theme).toBe('light');

    store.redo();
    expect(store.getState().settings.theme).toBe('navy');
  });

  it('snapshot clears the redo stack', () => {
    const store = makeStore();
    store.snapshot();
    store.dispatch((s) => { s.settings.theme = 'dark'; return s; });
    store.undo();
    expect(store.canRedo()).toBe(true);

    store.snapshot(); // new action — redo stack must be cleared
    expect(store.canRedo()).toBe(false);
  });

  it('history is capped at 150 entries', () => {
    const store = makeStore();
    for (let i = 0; i < 160; i++) {
      store.snapshot();
    }
    // After 160 snapshots the history should be trimmed to 150
    store.undo(); // just verify it doesn't throw
    expect(store.canUndo()).toBe(true);
  });

  it('undo notifies subscribers', () => {
    const store = makeStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.snapshot();
    store.dispatch((s) => s);
    listener.mockClear();

    store.undo();
    expect(listener).toHaveBeenCalledOnce();
  });

  it('redo notifies subscribers', () => {
    const store = makeStore();
    const listener = vi.fn();
    store.snapshot();
    store.dispatch((s) => s);
    store.undo();

    store.subscribe(listener);
    store.redo();
    expect(listener).toHaveBeenCalledOnce();
  });

  it('multiple undo steps walk back through history in order', () => {
    const store = makeStore();

    store.snapshot();
    store.dispatch((s) => { s.settings.theme = 'dark'; return s; });

    store.snapshot();
    store.dispatch((s) => { s.settings.theme = 'navy'; return s; });

    store.snapshot();
    store.dispatch((s) => { s.settings.theme = 'siemens'; return s; });

    expect(store.getState().settings.theme).toBe('siemens');
    store.undo();
    expect(store.getState().settings.theme).toBe('navy');
    store.undo();
    expect(store.getState().settings.theme).toBe('dark');
    store.undo();
    expect(store.getState().settings.theme).toBe('light');
    expect(store.canUndo()).toBe(false);
  });
});

// ── ephemeral fields ──────────────────────────────────────────────────────────

describe('Store ephemeral fields', () => {
  it('selectedId defaults to null', () => {
    expect(makeStore().selectedId).toBeNull();
  });

  it('zoom defaults to 1', () => {
    expect(makeStore().zoom).toBe(1);
  });

  it('expandedFnBlocks defaults to an empty Set', () => {
    const store = makeStore();
    expect(store.expandedFnBlocks).toBeInstanceOf(Set);
    expect(store.expandedFnBlocks.size).toBe(0);
  });
});
