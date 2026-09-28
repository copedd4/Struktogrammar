import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { emptyDoc } from "./model";
import { parseDocument } from "./schema";
import type { SNode, StruktoDoc } from "./types";

const AUTOSAVE_KEY = "strukto.autosave.v1";

export interface Selection {
  funcId: string;
  nodeId: string;
  /**
   * Where the block is shown: the same block can appear several times (a
   * function open in a window and expanded inline elsewhere). Undefined matches
   * any instance, e.g. right after jumping to a search result.
   */
  path?: string;
}

/** A history entry keeps the document *before* an action plus that action's label. */
export interface HistoryEntry {
  doc: StruktoDoc;
  label: string;
}

interface StoreValue {
  doc: StruktoDoc;
  mutate: (fn: (draft: StruktoDoc) => void, label?: string) => void;
  replaceDoc: (doc: StruktoDoc, opts?: ReplaceOptions) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  past: HistoryEntry[];
  future: HistoryEntry[];
  jumpBack: (index: number) => void;
  jumpForward: (index: number) => void;
  selection: Selection | null;
  setSelection: (s: Selection | null) => void;
  clipboard: SNode | null;
  setClipboard: (n: SNode | null) => void;
  openStack: string[];
  openFunction: (id: string) => void;
  closeTopFunction: () => void;
  closeFunctionById: (id: string) => void;
  dirty: boolean;
  markSaved: () => void;
  fileName: string | null;
  setFileName: (n: string | null) => void;
}

export interface ReplaceOptions {
  /**
   * Keep undo history so the replacement can be undone. Only use this when the
   * new document belongs to the same file (e.g. code import); a document opened
   * from another file must not be undoable back into the previous file's content,
   * otherwise disk autosave could write the old diagram into the new file.
   */
  keepHistory?: boolean;
  /** Whether the new document counts as unsaved. Defaults to false. */
  dirty?: boolean;
}

const Ctx = createContext<StoreValue | null>(null);

export function StruktoProvider({ children }: { children: ReactNode }) {
  const [doc, setDoc] = useState<StruktoDoc>(() => emptyDoc());
  const [past, setPast] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [clipboard, setClipboard] = useState<SNode | null>(null);
  const [openStack, setOpenStack] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const loaded = useRef(false);

  // Crash recovery / autosave restore
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          doc: unknown;
          fileName: string | null;
          dirty?: boolean;
        };
        if (parsed?.doc) {
          // validated like a file, so a corrupt autosave can't break the editor
          setDoc(parseDocument(JSON.stringify(parsed.doc)));
          setFileName(parsed.fileName ?? null);
          // restored work that was never written to a file is still unsaved
          setDirty(parsed.dirty ?? false);
        }
      }
    } catch {
      /* ignore corrupt autosave */
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ doc, fileName, dirty }));
      } catch {
        /* quota */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [doc, fileName, dirty]);

  const mutate = useCallback((fn: (draft: StruktoDoc) => void, label = "histEdit") => {
    setDoc((current) => {
      const draft = structuredClone(current);
      fn(draft);
      setPast((p) => [...p.slice(-99), { doc: current, label }]);
      setFuture([]);
      setDirty(true);
      return draft;
    });
  }, []);

  const replaceDoc = useCallback((next: StruktoDoc, opts: ReplaceOptions = {}) => {
    if (opts.keepHistory) {
      setDoc((current) => {
        setPast((p) => [...p.slice(-99), { doc: current, label: "histReplace" }]);
        return next;
      });
    } else {
      setDoc(next);
      setPast([]);
    }
    setFuture([]);
    setOpenStack([]);
    setSelection(null);
    setDirty(opts.dirty ?? false);
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      const prev = p[p.length - 1]!;
      setDoc((cur) => {
        setFuture((f) => [{ doc: cur, label: prev.label }, ...f]);
        return prev.doc;
      });
      setDirty(true);
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const next = f[0]!;
      setDoc((cur) => {
        setPast((p) => [...p, { doc: cur, label: next.label }]);
        return next.doc;
      });
      setDirty(true);
      return f.slice(1);
    });
  }, []);

  /** Jump to the state stored at `index` inside `past` (i.e. undo several steps). */
  const jumpBack = useCallback((index: number) => {
    setPast((p) => {
      if (index < 0 || index >= p.length) return p;
      const target = p[index]!;
      const undone = p.slice(index);
      setDoc((cur) => {
        setFuture((f) => [
          ...undone.map((e, i) => ({ doc: undone[i + 1]?.doc ?? cur, label: e.label })),
          ...f,
        ]);
        return target.doc;
      });
      setDirty(true);
      return p.slice(0, index);
    });
  }, []);

  /** Jump forward `index + 1` redo steps. */
  const jumpForward = useCallback((index: number) => {
    setFuture((f) => {
      if (index < 0 || index >= f.length) return f;
      const redone = f.slice(0, index + 1);
      const target = redone[redone.length - 1]!;
      setDoc((cur) => {
        setPast((p) => [
          ...p,
          ...redone.map((e, i) => ({ doc: i === 0 ? cur : redone[i - 1]!.doc, label: e.label })),
        ]);
        return target.doc;
      });
      setDirty(true);
      return f.slice(index + 1);
    });
  }, []);

  const openFunction = useCallback((id: string) => {
    // Prevent infinite pop-up nesting: never stack the same function twice.
    setOpenStack((s) => (s.includes(id) ? s : [...s, id]));
  }, []);
  const closeTopFunction = useCallback(() => setOpenStack((s) => s.slice(0, -1)), []);
  const closeFunctionById = useCallback(
    (id: string) => setOpenStack((s) => s.filter((x) => x !== id)),
    [],
  );

  const value = useMemo<StoreValue>(
    () => ({
      doc,
      mutate,
      replaceDoc,
      undo,
      redo,
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      past,
      future,
      jumpBack,
      jumpForward,
      selection,
      setSelection,
      clipboard,
      setClipboard,
      openStack,
      openFunction,
      closeTopFunction,
      closeFunctionById,
      dirty,
      markSaved: () => setDirty(false),
      fileName,
      setFileName,
    }),
    [
      doc,
      mutate,
      replaceDoc,
      undo,
      redo,
      past,
      future,
      jumpBack,
      jumpForward,
      selection,
      clipboard,
      openStack,
      openFunction,
      closeTopFunction,
      closeFunctionById,
      dirty,
      fileName,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStrukto() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStrukto must be used inside StruktoProvider");
  return ctx;
}
