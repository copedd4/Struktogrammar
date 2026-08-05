// tests/validation.test.js
import { describe, it, expect } from 'vitest';
import { validateProject } from '../js/validation.js';
import { normalizeState, defaultState } from '../js/state.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal AppState whose root diagram contains the given blocks.
 *
 * @param {object[]} blocks
 * @param {string}   [language='en']
 * @returns {import('../js/state.js').AppState}
 */
function stateWith(blocks, language = 'en') {
  const s = normalizeState(defaultState());
  s.settings.language = language;
  // Replace the auto-generated empty root diagram blocks
  s.diagrams[s.rootDiagramId].blocks = blocks;
  return s;
}

// ── Clean project ─────────────────────────────────────────────────────────────

describe('validateProject — clean project', () => {
  it('returns an empty array for an empty diagram', () => {
    expect(validateProject(stateWith([]))).toEqual([]);
  });

  it('returns an empty array when all blocks are filled in', () => {
    const blocks = [
      { id: 'a', type: 'statement',    text: 'x = 1' },
      { id: 'b', type: 'ifElse',       condition: 'x > 0', thenBlocks: [], elseBlocks: [] },
      { id: 'c', type: 'whileDo',      condition: 'running', body: [] },
      { id: 'd', type: 'doWhile',      condition: 'running', body: [] },
      { id: 'e', type: 'forLoop',      condition: 'i < 10', init: 'i=0', step: 'i++', body: [] },
      { id: 'f', type: 'functionCall', functionName: 'doSomething', functionId: null },
      { id: 'g', type: 'switchCase',   expression: 'mode',
        cases: [{ id: 'c1', name: 'A', blocks: [], isDefault: false },
                { id: 'c2', name: 'Default', blocks: [], isDefault: true }] },
    ];
    expect(validateProject(stateWith(blocks))).toEqual([]);
  });
});

// ── statement ─────────────────────────────────────────────────────────────────

describe('validateProject — statement', () => {
  it('warns when text is empty', () => {
    const w = validateProject(stateWith([{ id: 'a', type: 'statement', text: '' }]));
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('a');
  });

  it('warns when text is whitespace-only', () => {
    const w = validateProject(stateWith([{ id: 'a', type: 'statement', text: '   ' }]));
    expect(w).toHaveLength(1);
  });

  it('does not warn when text has content', () => {
    const w = validateProject(stateWith([{ id: 'a', type: 'statement', text: 'x = 1' }]));
    expect(w).toHaveLength(0);
  });
});

// ── ifElse / whileDo / doWhile ────────────────────────────────────────────────

describe('validateProject — condition blocks', () => {
  ['ifElse', 'whileDo', 'doWhile'].forEach((type) => {
    it(`warns when ${type} condition is empty`, () => {
      const b = { id: 'x', type, condition: '', thenBlocks: [], elseBlocks: [], body: [] };
      const w = validateProject(stateWith([b]));
      expect(w).toHaveLength(1);
      expect(w[0]).toContain('x');
    });

    it(`does not warn when ${type} condition is set`, () => {
      const b = { id: 'x', type, condition: 'ok', thenBlocks: [], elseBlocks: [], body: [] };
      expect(validateProject(stateWith([b]))).toHaveLength(0);
    });
  });
});

// ── forLoop ───────────────────────────────────────────────────────────────────

describe('validateProject — forLoop', () => {
  it('warns when condition is empty', () => {
    const b = { id: 'x', type: 'forLoop', condition: '', init: 'i=0', step: 'i++', body: [] };
    const w = validateProject(stateWith([b]));
    expect(w).toHaveLength(1);
  });

  it('does not warn when condition is set (init/step may be empty)', () => {
    const b = { id: 'x', type: 'forLoop', condition: 'i < 10', init: '', step: '', body: [] };
    expect(validateProject(stateWith([b]))).toHaveLength(0);
  });
});

// ── functionCall ──────────────────────────────────────────────────────────────

describe('validateProject — functionCall', () => {
  it('warns when functionName is empty', () => {
    const b = { id: 'x', type: 'functionCall', functionName: '', functionId: null };
    const w = validateProject(stateWith([b]));
    expect(w).toHaveLength(1);
  });

  it('does not warn when functionName is set', () => {
    const b = { id: 'x', type: 'functionCall', functionName: 'doIt', functionId: null };
    expect(validateProject(stateWith([b]))).toHaveLength(0);
  });
});

// ── switchCase ────────────────────────────────────────────────────────────────

describe('validateProject — switchCase', () => {
  it('warns when expression is empty', () => {
    const b = {
      id: 'x', type: 'switchCase', expression: '',
      cases: [{ id: 'c1', name: 'Default', blocks: [], isDefault: true }],
    };
    expect(validateProject(stateWith([b]))).toHaveLength(1);
  });

  it('does not warn when expression is set', () => {
    const b = {
      id: 'x', type: 'switchCase', expression: 'mode',
      cases: [{ id: 'c1', name: 'Default', blocks: [], isDefault: true }],
    };
    expect(validateProject(stateWith([b]))).toHaveLength(0);
  });
});

// ── nested blocks ─────────────────────────────────────────────────────────────

describe('validateProject — nested blocks', () => {
  it('validates blocks nested inside an ifElse branch', () => {
    const inner = { id: 'inner', type: 'statement', text: '' };
    const b = {
      id: 'outer', type: 'ifElse', condition: 'x',
      thenBlocks: [inner], elseBlocks: [],
    };
    const w = validateProject(stateWith([b]));
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('inner');
  });

  it('validates blocks nested inside a loop body', () => {
    const inner = { id: 'inner', type: 'statement', text: '' };
    const b = { id: 'outer', type: 'whileDo', condition: 'true', body: [inner] };
    const w = validateProject(stateWith([b]));
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('inner');
  });

  it('validates blocks inside switchCase case bodies', () => {
    const inner = { id: 'inner', type: 'statement', text: '' };
    const b = {
      id: 'outer', type: 'switchCase', expression: 'x',
      cases: [
        { id: 'c1', name: 'A', blocks: [inner], isDefault: false },
        { id: 'c2', name: 'Default', blocks: [], isDefault: true },
      ],
    };
    const w = validateProject(stateWith([b]));
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('inner');
  });
});

// ── multiple warnings ─────────────────────────────────────────────────────────

describe('validateProject — multiple warnings', () => {
  it('reports one warning per offending block', () => {
    const blocks = [
      { id: 'a', type: 'statement',    text: '' },
      { id: 'b', type: 'functionCall', functionName: '', functionId: null },
      { id: 'c', type: 'switchCase',   expression: '',
        cases: [{ id: 'c1', name: 'Default', blocks: [], isDefault: true }] },
    ];
    const w = validateProject(stateWith(blocks));
    expect(w).toHaveLength(3);
  });
});

// ── language ──────────────────────────────────────────────────────────────────

describe('validateProject — language', () => {
  it('uses German labels when language is "de"', () => {
    const b = { id: 'x', type: 'statement', text: '' };
    const w = validateProject(stateWith([b], 'de'));
    // German label for statement is 'Anweisung'
    expect(w[0]).toContain('Anweisung');
  });
});

// ── duplicate switch-case labels ──────────────────────────────────────────────

describe('validateProject — duplicate case labels', () => {
  it('warns when two cases have the same label', () => {
    const b = {
      id: 'sw1', type: 'switchCase', expression: 'x',
      cases: [
        { id: 'c1', name: 'A',       blocks: [], isDefault: false },
        { id: 'c2', name: 'A',       blocks: [], isDefault: false },  // duplicate
        { id: 'c3', name: 'Default', blocks: [], isDefault: true  },
      ],
    };
    const w = validateProject(stateWith([b]));
    // One warning for the duplicate 'A', one for the missing expression (expression: 'x' is set, so only duplicate)
    const dupWarning = w.find((msg) => msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('doppelt'));
    expect(dupWarning).toBeTruthy();
  });

  it('does not warn when all case labels are unique', () => {
    const b = {
      id: 'sw1', type: 'switchCase', expression: 'x',
      cases: [
        { id: 'c1', name: 'A',       blocks: [], isDefault: false },
        { id: 'c2', name: 'B',       blocks: [], isDefault: false },
        { id: 'c3', name: 'Default', blocks: [], isDefault: true  },
      ],
    };
    const w = validateProject(stateWith([b]));
    expect(w).toHaveLength(0);
  });

  it('skips empty case labels in duplicate check', () => {
    const b = {
      id: 'sw1', type: 'switchCase', expression: 'x',
      cases: [
        { id: 'c1', name: '',        blocks: [], isDefault: false },
        { id: 'c2', name: '',        blocks: [], isDefault: false },
        { id: 'c3', name: 'Default', blocks: [], isDefault: true  },
      ],
    };
    const w = validateProject(stateWith([b]));
    // No duplicate warning for empty labels — only the empty-label cases themselves
    const dupWarning = w.find((msg) => msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('doppelt'));
    expect(dupWarning).toBeFalsy();
  });
});

// ── duplicate function names ──────────────────────────────────────────────────

describe('validateProject — duplicate function names', () => {
  it('warns when two functionCall blocks share a name', () => {
    const blocks = [
      { id: 'f1', type: 'functionCall', functionName: 'doIt', functionId: null },
      { id: 'f2', type: 'functionCall', functionName: 'doIt', functionId: null },
    ];
    const w = validateProject(stateWith(blocks));
    const dupWarning = w.find((msg) => msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('doppelt'));
    expect(dupWarning).toBeTruthy();
    expect(dupWarning).toContain('f2');
  });

  it('is case-insensitive for duplicate detection', () => {
    const blocks = [
      { id: 'f1', type: 'functionCall', functionName: 'DoIt', functionId: null },
      { id: 'f2', type: 'functionCall', functionName: 'doit', functionId: null },
    ];
    const w = validateProject(stateWith(blocks));
    const dupWarning = w.find((msg) => msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('doppelt'));
    expect(dupWarning).toBeTruthy();
  });

  it('does not warn for a single functionCall', () => {
    const blocks = [
      { id: 'f1', type: 'functionCall', functionName: 'doIt', functionId: null },
    ];
    const w = validateProject(stateWith(blocks));
    expect(w).toHaveLength(0);
  });

  it('does not warn for empty function names (caught by existing check)', () => {
    const blocks = [
      { id: 'f1', type: 'functionCall', functionName: '', functionId: null },
      { id: 'f2', type: 'functionCall', functionName: '', functionId: null },
    ];
    const w = validateProject(stateWith(blocks));
    // Two empty-name warnings, but NO duplicate warning
    const dupWarning = w.find((msg) => msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('doppelt'));
    expect(dupWarning).toBeFalsy();
    expect(w).toHaveLength(2); // one per empty-name block
  });
});

// ── duplicate function definition names ──────────────────────────────────────

describe('validateProject — duplicate function definition names', () => {
  it('warns when two function definitions share a name', () => {
    const s = stateWith([]);
    s.functions = {
      fn1: { id: 'fn1', diagramId: 'd1', name: 'MyFunc' },
      fn2: { id: 'fn2', diagramId: 'd2', name: 'MyFunc' },  // duplicate
    };
    const w = validateProject(s);
    const dupWarning = w.find((msg) => msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('doppelt'));
    expect(dupWarning).toBeTruthy();
    expect(dupWarning).toContain('fn2');
  });

  it('does not warn when all function definition names are unique', () => {
    const s = stateWith([]);
    s.functions = {
      fn1: { id: 'fn1', diagramId: 'd1', name: 'FuncA' },
      fn2: { id: 'fn2', diagramId: 'd2', name: 'FuncB' },
    };
    const w = validateProject(s);
    expect(w).toHaveLength(0);
  });
});
