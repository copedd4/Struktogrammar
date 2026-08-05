// tests/i18n.test.js
import { describe, it, expect } from 'vitest';
import { tr, I18N } from '../js/i18n.js';

const BLOCK_TYPES = [
  'statement', 'ifElse', 'whileDo', 'doWhile', 'forLoop',
  'functionCall', 'switchCase', 'terminator', 'comment',
];

describe('tr()', () => {
  it('returns English for "en"', () => {
    expect(tr('en').appTitle).toBe('Struktogramm Editor');
  });

  it('returns German for "de"', () => {
    expect(tr('de').appTitle).toBe('Struktogramm-Editor');
  });

  it('falls back to English for unknown locale', () => {
    expect(tr('fr').appTitle).toBe('Struktogramm Editor');
    expect(tr(undefined).appTitle).toBe('Struktogramm Editor');
  });

  it('has blockTypes for all block-library types in both locales', () => {
    ['en', 'de'].forEach((lang) => {
      const t = tr(lang);
      BLOCK_TYPES.forEach((type) => {
        expect(t.blockTypes[type], `${lang}.blockTypes.${type}`).toBeTruthy();
      });
    });
  });

  it('shortcutHelp is a non-empty array in both locales', () => {
    ['en', 'de'].forEach((lang) => {
      const { shortcutHelp } = tr(lang);
      expect(Array.isArray(shortcutHelp)).toBe(true);
      expect(shortcutHelp.length).toBeGreaterThan(0);
    });
  });

  it('both locales have the same top-level keys', () => {
    const enKeys = Object.keys(I18N.en).sort();
    const deKeys = Object.keys(I18N.de).sort();
    expect(deKeys).toEqual(enKeys);
  });

  it('new i18n keys are present in EN', () => {
    const t = tr('en');
    expect(t.zoomFit).toBe('Fit');
    expect(t.searchToggle).toBe('Find');
    expect(t.cancel).toBe('Cancel');
    expect(t.confirmNewProject).toBeTruthy();
    expect(t.confirmDelete).toBeTruthy();
    expect(t.deletedUndo).toBeTruthy();
    expect(t.duplicateCaseLabel).toBeTruthy();
    expect(t.duplicateFunctionName).toBeTruthy();
    expect(t.duplicateFunctionDef).toBeTruthy();
    expect(t.swUpdateAvailable).toBeTruthy();
    expect(t.swUpdateReload).toBeTruthy();
  });

  it('new i18n keys are present in DE', () => {
    const t = tr('de');
    expect(t.zoomFit).toBe('Einpassen');
    expect(t.cancel).toBe('Abbrechen');
    expect(t.swUpdateReload).toBe('Neu laden');
  });
});
