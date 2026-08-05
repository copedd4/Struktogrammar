// tests/export.test.js
// Tests for export.js — file I/O helpers and error handling.
// Browser APIs (URL.createObjectURL, document.createElement) are shimmed by vitest/jsdom.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── downloadBlob ──────────────────────────────────────────────────────────────
describe('downloadBlob', () => {
  let appendSpy, createSpy, anchor;

  beforeEach(async () => {
    anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') {return anchor;}
      return document.createElement.wrappedMethod
        ? document.createElement.wrappedMethod(tag)
        : Object.assign(document.createElementNS('http://www.w3.org/1999/xhtml', tag));
    });
    appendSpy = vi.spyOn(document.body, 'append').mockImplementation(() => {});
    global.URL = { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() };
  });

  afterEach(() => {
    createSpy.mockRestore();
    appendSpy.mockRestore();
  });

  it('creates an anchor, sets href+download, clicks, then removes it', async () => {
    const { downloadBlob } = await import('../js/export.js');
    downloadBlob(new Blob(['hello']), 'test.svg');
    expect(anchor.download).toBe('test.svg');
    expect(anchor.href).toBe('blob:fake');
    expect(anchor.click).toHaveBeenCalled();
    expect(anchor.remove).toHaveBeenCalled();
  });
});

// ── openFromFileInput — JSON error handling ───────────────────────────────────
describe('openFromFileInput', () => {
  it('calls showErrorFn on invalid JSON', async () => {
    const { openFromFileInput } = await import('../js/export.js');
    const showError = vi.fn();
    const fakeFile  = { text: async () => '{ this is not json !!!' };
    const event     = { target: { files: [fakeFile] } };
    const store     = {
      snapshot: vi.fn(), dispatch: vi.fn(),
      expandedFnBlocks: new Set(), selectedId: null,
    };
    await openFromFileInput(event, store, vi.fn(), showError);
    expect(showError).toHaveBeenCalledOnce();
    expect(showError.mock.calls[0][0]).toMatch(/valid .stkg/i);
  });

  it('does nothing when no file is selected', async () => {
    const { openFromFileInput } = await import('../js/export.js');
    const showError = vi.fn();
    const store     = { snapshot: vi.fn(), dispatch: vi.fn(), expandedFnBlocks: new Set(), selectedId: null };
    await openFromFileInput({ target: { files: [] } }, store, vi.fn(), showError);
    expect(showError).not.toHaveBeenCalled();
    expect(store.snapshot).not.toHaveBeenCalled();
  });

  it('loads a valid .stkg file and calls afterMutation', async () => {
    const { openFromFileInput } = await import('../js/export.js');
    const afterMutation = vi.fn();
    const validState    = JSON.stringify({
      version: 5,
      settings: { language: 'en', theme: 'light' },
      rootDiagramId: 'root',
      diagrams: { root: { id: 'root', name: 'Main', blocks: [] } },
      functions: {},
    });
    const fakeFile = { text: async () => validState };
    const event    = { target: { files: [fakeFile] } };
    const store    = {
      snapshot: vi.fn(), dispatch: vi.fn(),
      expandedFnBlocks: new Set(), selectedId: null,
    };
    await openFromFileInput(event, store, afterMutation, vi.fn());
    expect(store.snapshot).toHaveBeenCalledOnce();
    expect(afterMutation).toHaveBeenCalledOnce();
  });
});

// ── openProject — cancelled picker ───────────────────────────────────────────
describe('openProject', () => {
  it('does nothing when showOpenFilePicker is absent (falls back to fileInput.click)', async () => {
    const { openProject } = await import('../js/export.js');
    const fileInput = { click: vi.fn() };
    const store     = { snapshot: vi.fn(), dispatch: vi.fn(), expandedFnBlocks: new Set(), selectedId: null };
    // showOpenFilePicker not in window in test env → should call fileInput.click
    delete window.showOpenFilePicker;
    await openProject(store, { fileInput }, vi.fn(), vi.fn());
    expect(fileInput.click).toHaveBeenCalledOnce();
  });
});
