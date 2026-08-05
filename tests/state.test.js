// tests/state.test.js
import { describe, it, expect } from 'vitest';
import {
  uid,
  deepClone,
  escapeHtml,
  defaultState,
  defaultCases,
  normalizeBlock,
  normalizeState,
  flattenBlocks,
  rekeyBlockTree,
} from '../js/state.js';

// ── uid ───────────────────────────────────────────────────────────────────────

describe('uid', () => {
  it('uses the supplied prefix', () => {
    expect(uid('block')).toMatch(/^block-/);
  });

  it('defaults to "id" prefix', () => {
    expect(uid()).toMatch(/^id-/);
  });

  it('produces unique values', () => {
    const ids = new Set(Array.from({ length: 200 }, () => uid('x')));
    expect(ids.size).toBe(200);
  });
});

// ── deepClone ─────────────────────────────────────────────────────────────────

describe('deepClone', () => {
  it('returns a structurally equal but distinct object', () => {
    const obj = { a: 1, b: { c: [2, 3] } };
    const clone = deepClone(obj);
    expect(clone).toEqual(obj);
    expect(clone).not.toBe(obj);
    expect(clone.b).not.toBe(obj.b);
  });
});

// ── escapeHtml ────────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes all five special characters', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('handles null / undefined gracefully', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

// ── defaultState ──────────────────────────────────────────────────────────────

describe('defaultState', () => {
  it('has version 5', () => {
    expect(defaultState().version).toBe(5);
  });

  it('defaults to English light theme', () => {
    const s = defaultState();
    expect(s.settings.language).toBe('en');
    expect(s.settings.theme).toBe('light');
  });

  it('has empty diagrams and functions', () => {
    const s = defaultState();
    expect(s.diagrams).toEqual({});
    expect(s.functions).toEqual({});
  });
});

// ── defaultCases ──────────────────────────────────────────────────────────────

describe('defaultCases', () => {
  it('returns exactly three cases', () => {
    expect(defaultCases()).toHaveLength(3);
  });

  it('last case is the Default case', () => {
    const cases = defaultCases();
    expect(cases[cases.length - 1].isDefault).toBe(true);
  });

  it('first two cases are not default', () => {
    const [a, b] = defaultCases();
    expect(a.isDefault).toBe(false);
    expect(b.isDefault).toBe(false);
  });
});

// ── normalizeBlock ────────────────────────────────────────────────────────────

describe('normalizeBlock', () => {
  it('does nothing to null / undefined', () => {
    expect(() => normalizeBlock(null)).not.toThrow();
    expect(() => normalizeBlock(undefined)).not.toThrow();
  });

  it('adds thenBlocks and elseBlocks to an ifElse block that lacks them', () => {
    const b = { id: 'x', type: 'ifElse', condition: '' };
    normalizeBlock(b);
    expect(Array.isArray(b.thenBlocks)).toBe(true);
    expect(Array.isArray(b.elseBlocks)).toBe(true);
  });

  it('preserves existing thenBlocks / elseBlocks', () => {
    const child = { id: 'c', type: 'statement', text: 'x' };
    const b = { id: 'x', type: 'ifElse', condition: '', thenBlocks: [child], elseBlocks: [] };
    normalizeBlock(b);
    expect(b.thenBlocks).toHaveLength(1);
    expect(b.thenBlocks[0]).toBe(child);
  });

  it('adds body to a whileDo block that lacks it', () => {
    const b = { id: 'x', type: 'whileDo', condition: '' };
    normalizeBlock(b);
    expect(Array.isArray(b.body)).toBe(true);
  });

  it('adds body to doWhile and forLoop', () => {
    ['doWhile', 'forLoop'].forEach((type) => {
      const b = { id: 'x', type };
      normalizeBlock(b);
      expect(Array.isArray(b.body)).toBe(true);
    });
  });

  it('adds default cases to a switchCase that has none', () => {
    const b = { id: 'x', type: 'switchCase', expression: '', cases: [] };
    normalizeBlock(b);
    expect(b.cases.length).toBeGreaterThanOrEqual(1);
    expect(b.cases.some((c) => c.isDefault)).toBe(true);
  });

  it('injects a Default case when none exists', () => {
    const b = {
      id: 'x', type: 'switchCase', expression: '',
      cases: [{ id: 'c1', name: 'A', blocks: [], isDefault: false }],
    };
    normalizeBlock(b);
    expect(b.cases.some((c) => c.isDefault)).toBe(true);
  });

  it('does not add a second Default when one already exists', () => {
    const b = {
      id: 'x', type: 'switchCase', expression: '',
      cases: [
        { id: 'c1', name: 'A',       blocks: [], isDefault: false },
        { id: 'c2', name: 'Default', blocks: [], isDefault: true  },
      ],
    };
    normalizeBlock(b);
    expect(b.cases.filter((c) => c.isDefault)).toHaveLength(1);
  });
});

// ── normalizeState ────────────────────────────────────────────────────────────

describe('normalizeState', () => {
  it('returns a valid state when called with no argument', () => {
    const s = normalizeState();
    expect(s.version).toBe(5);
    expect(s.settings).toBeDefined();
    expect(s.diagrams).toBeDefined();
    expect(s.functions).toBeDefined();
  });

  it('fills in missing settings', () => {
    const s = normalizeState({ version: 5, rootDiagramId: 'd1', diagrams: {}, functions: {} });
    expect(s.settings.language).toBe('en');
    expect(s.settings.theme).toBe('light');
  });

  it('creates the root diagram when missing', () => {
    const raw = defaultState();
    delete raw.diagrams[raw.rootDiagramId];
    const s = normalizeState(raw);
    expect(s.diagrams[s.rootDiagramId]).toBeDefined();
    expect(Array.isArray(s.diagrams[s.rootDiagramId].blocks)).toBe(true);
  });

  it('normalizes blocks inside every diagram', () => {
    const raw = defaultState();
    const diagId = raw.rootDiagramId;
    raw.diagrams[diagId] = {
      id: diagId, name: 'Main',
      blocks: [{ id: 'b1', type: 'ifElse', condition: 'x > 0' }],
    };
    const s = normalizeState(raw);
    const block = s.diagrams[diagId].blocks[0];
    expect(Array.isArray(block.thenBlocks)).toBe(true);
    expect(Array.isArray(block.elseBlocks)).toBe(true);
  });
});

// ── flattenBlocks ─────────────────────────────────────────────────────────────

describe('flattenBlocks', () => {
  it('returns an empty array for an empty list', () => {
    expect(flattenBlocks([])).toEqual([]);
  });

  it('returns top-level blocks', () => {
    const blocks = [
      { id: 'a', type: 'statement', text: '' },
      { id: 'b', type: 'statement', text: '' },
    ];
    expect(flattenBlocks(blocks)).toHaveLength(2);
  });

  it('recurses into ifElse branches', () => {
    const child = { id: 'c', type: 'statement', text: '' };
    const blocks = [{
      id: 'p', type: 'ifElse', condition: '',
      thenBlocks: [child], elseBlocks: [],
    }];
    const flat = flattenBlocks(blocks);
    expect(flat).toHaveLength(2);
    expect(flat[1]).toBe(child);
  });

  it('recurses into loop bodies', () => {
    const child = { id: 'c', type: 'statement', text: '' };
    const blocks = [{ id: 'p', type: 'whileDo', condition: '', body: [child] }];
    expect(flattenBlocks(blocks)).toHaveLength(2);
  });

  it('recurses into switchCase cases', () => {
    const child = { id: 'c', type: 'statement', text: '' };
    const blocks = [{
      id: 'p', type: 'switchCase', expression: '',
      cases: [{ id: 'k1', name: 'A', blocks: [child], isDefault: false }],
    }];
    expect(flattenBlocks(blocks)).toHaveLength(2);
  });
});

// ── rekeyBlockTree ────────────────────────────────────────────────────────────

describe('rekeyBlockTree', () => {
  it('assigns a new id to the root block', () => {
    const b = { id: 'old', type: 'statement', text: '' };
    rekeyBlockTree(b);
    expect(b.id).not.toBe('old');
    expect(b.id).toMatch(/^block-/);
  });

  it('assigns new ids recursively to ifElse children', () => {
    const child = { id: 'child-old', type: 'statement', text: '' };
    const b = { id: 'root-old', type: 'ifElse', condition: '', thenBlocks: [child], elseBlocks: [] };
    rekeyBlockTree(b);
    expect(b.id).not.toBe('root-old');
    expect(child.id).not.toBe('child-old');
  });
});
