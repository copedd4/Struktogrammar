import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "en" | "de";

const en = {
  appName: "Struktogramm Editor",
  file: "File",
  newProject: "New",
  open: "Open…",
  save: "Save",
  saveAs: "Save as…",
  export: "Export",
  exportPng: "PNG image",
  exportSvg: "SVG vector",
  exportPdf: "PDF document",
  exportScope: "Export scope",
  scopeCurrent: "Current view only",
  scopeAll: "Full call tree (all functions)",
  edit: "Edit",
  undo: "Undo",
  redo: "Redo",
  copy: "Copy",
  paste: "Paste",
  duplicate: "Duplicate",
  delete: "Delete",
  collapse: "Collapse",
  expand: "Expand",
  theme: "Theme",
  language: "Language",
  blocks: "Blocks",
  statement: "Statement",
  ifElse: "If / Else",
  whileDo: "While-Do",
  doWhile: "Do-While",
  forLoop: "For loop",
  switchCase: "Switch-Case",
  functionBlock: "Function",
  terminator: "Break / Return / Continue",
  comment: "Comment",
  yes: "true",
  no: "false",
  doLabel: "do",
  whileLabel: "while",
  addCase: "Add case",
  renameCase: "Rename case",
  deleteCase: "Delete case",
  defaultCase: "default",
  functions: "Functions",
  newFunction: "New function",
  openFunction: "Open function",
  orphaned: "Orphaned",
  restore: "Restore",
  emptyHint: "Drop a block here or press +",
  dropHere: "Drop here",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  resetView: "Reset view",
  validation: "Validation",
  noIssues: "No issues found.",
  issuesFound: (n: number) => `${n} issue(s) found`,
  emptyStatement: "Empty statement text",
  emptyCondition: "Empty condition",
  emptyCase: "Empty case label",
  missingFunction: "Function reference is missing",
  deleteFunctionTitle: "Delete function block?",
  deleteFunctionBody: (name: string) =>
    `"${name}" still contains content. Do you want to keep its definition so you can restore it later?`,
  keepDefinition: "Remove block, keep definition",
  deleteEverything: "Delete block and definition",
  cancel: "Cancel",
  shortcuts: "Shortcuts",
  saved: "Saved",
  unsaved: "Unsaved changes",
  autosaved: "Autosaved locally",
  functionName: "Function name",
  recursionNote: "This function is already open — the same diagram is being edited.",
  condition: "condition",
  statementText: "statement",
  callOf: "call",
  exportNote:
    "PNG/SVG/PDF export captures the selected scope. Choose “Full call tree” to append every function diagram.",
};

type Dict = typeof en;

const de: Dict = {
  appName: "Struktogramm-Editor",
  file: "Datei",
  newProject: "Neu",
  open: "Öffnen…",
  save: "Speichern",
  saveAs: "Speichern unter…",
  export: "Exportieren",
  exportPng: "PNG-Bild",
  exportSvg: "SVG-Vektor",
  exportPdf: "PDF-Dokument",
  exportScope: "Exportumfang",
  scopeCurrent: "Nur aktuelle Ansicht",
  scopeAll: "Gesamter Aufrufbaum (alle Funktionen)",
  edit: "Bearbeiten",
  undo: "Rückgängig",
  redo: "Wiederherstellen",
  copy: "Kopieren",
  paste: "Einfügen",
  duplicate: "Duplizieren",
  delete: "Löschen",
  collapse: "Einklappen",
  expand: "Ausklappen",
  theme: "Design",
  language: "Sprache",
  blocks: "Blöcke",
  statement: "Anweisung",
  ifElse: "Wenn / Sonst",
  whileDo: "Solange-Schleife (kopfgesteuert)",
  doWhile: "Fußgesteuerte Schleife",
  forLoop: "Zählschleife",
  switchCase: "Fallunterscheidung",
  functionBlock: "Funktion",
  terminator: "Break / Return / Continue",
  comment: "Kommentar",
  yes: "wahr",
  no: "falsch",
  doLabel: "wiederhole",
  whileLabel: "solange",
  addCase: "Fall hinzufügen",
  renameCase: "Fall umbenennen",
  deleteCase: "Fall löschen",
  defaultCase: "sonst",
  functions: "Funktionen",
  newFunction: "Neue Funktion",
  openFunction: "Funktion öffnen",
  orphaned: "Verwaist",
  restore: "Wiederherstellen",
  emptyHint: "Block hierher ziehen oder + drücken",
  dropHere: "Hier ablegen",
  zoomIn: "Vergrößern",
  zoomOut: "Verkleinern",
  resetView: "Ansicht zurücksetzen",
  validation: "Prüfung",
  noIssues: "Keine Probleme gefunden.",
  issuesFound: (n: number) => `${n} Problem(e) gefunden`,
  emptyStatement: "Leerer Anweisungstext",
  emptyCondition: "Leere Bedingung",
  emptyCase: "Leere Fallbezeichnung",
  missingFunction: "Funktionsreferenz fehlt",
  deleteFunctionTitle: "Funktionsblock löschen?",
  deleteFunctionBody: (name: string) =>
    `„${name}“ enthält noch Inhalte. Soll die Definition erhalten bleiben, damit sie später wiederhergestellt werden kann?`,
  keepDefinition: "Block entfernen, Definition behalten",
  deleteEverything: "Block und Definition löschen",
  cancel: "Abbrechen",
  shortcuts: "Tastenkürzel",
  saved: "Gespeichert",
  unsaved: "Ungespeicherte Änderungen",
  autosaved: "Lokal automatisch gespeichert",
  functionName: "Funktionsname",
  recursionNote: "Diese Funktion ist bereits geöffnet – es wird dasselbe Diagramm bearbeitet.",
  condition: "Bedingung",
  statementText: "Anweisung",
  callOf: "Aufruf",
  exportNote:
    "PNG/SVG/PDF-Export erfasst den gewählten Umfang. „Gesamter Aufrufbaum“ hängt jedes Funktionsdiagramm an.",
};

const dicts: Record<Lang, Dict> = { en, de };

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: Dict }>({
  lang: "en",
  setLang: () => {},
  t: en,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = localStorage.getItem("strukto.lang") as Lang | null;
    if (stored === "de" || stored === "en") setLangState(stored);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem("strukto.lang", l);
    document.documentElement.lang = l;
  }, []);

  const value = useMemo(() => ({ lang, setLang, t: dicts[lang] }), [lang, setLang]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export const useI18n = () => useContext(LangCtx);
