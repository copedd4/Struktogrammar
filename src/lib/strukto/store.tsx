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
import type { SNode, StruktoDoc } from "./types";

const AUTOSAVE_KEY = "strukto.autosave.v1";

export interface Selection {
  funcId: string;
  nodeId: string;
}

interface StoreValue {
  doc: StruktoDoc;
  mutate: (fn: (draft: StruktoDoc) => void) => void;
  replaceDoc: (doc: StruktoDoc) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  selection: Selection | null;
  setSelection: (s: Selection | null) => void;
  clipboard: SNode | null;
  setClipboard: (n: SNode | null) => void;
  openStack: string[];
  openFunction: (id: string) => void;
  closeTopFunction: () => void;
  dirty: boolean;
  markSaved: () => void;
  fileName: string | null;
  setFileName: (n: string | null) => void;
}

const Ctx = createContext<StoreValue | null>(null);

export function StruktoProvider({ children }: { children: ReactNode }) {
  const [doc, setDoc] = useState<StruktoDoc>(() => emptyDoc());
  const [past, setPast] = useState<StruktoDoc[]>([]);
  const [future, setFuture] = useState<StruktoDoc[]>([]);
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
        const parsed = JSON.parse(raw) as { doc: StruktoDoc; fileName: string | null };
        if (parsed?.doc?.functions) {
          setDoc(parsed.doc);
          setFileName(parsed.fileName ?? null);
        }
      }
    } catch {
      /* ignore corrupt autosave */
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ doc, fileName }));
      } catch {
        /* quota */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [doc, fileName]);

  const mutate = useCallback((fn: (draft: StruktoDoc) => void) => {
    setDoc((current) => {
      const draft = structuredClone(current);
      fn(draft);
      setPast((p) => [...p.slice(-99), current]);
      setFuture([]);
      setDirty(true);
      return draft;
    });
  }, []);

  const replaceDoc = useCallback((next: StruktoDoc) => {
    setDoc((current) => {
      setPast((p) => [...p.slice(-99), current]);
      setFuture([]);
      return next;
    });
    setOpenStack([]);
    setSelection(null);
    setDirty(false);
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      const prev = p[p.length - 1]!;
      setDoc((cur) => {
        setFuture((f) => [cur, ...f]);
        return prev;
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
        setPast((p) => [...p, cur]);
        return next;
      });
      setDirty(true);
      return f.slice(1);
    });
  }, []);

  const openFunction = useCallback((id: string) => {
    // Prevent infinite pop-up nesting: never stack the same function twice.
    setOpenStack((s) => (s.includes(id) ? s : [...s, id]));
  }, []);
  const closeTopFunction = useCallback(() => setOpenStack((s) => s.slice(0, -1)), []);

  const value = useMemo<StoreValue>(
    () => ({
      doc,
      mutate,
      replaceDoc,
      undo,
      redo,
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      selection,
      setSelection,
      clipboard,
      setClipboard,
      openStack,
      openFunction,
      closeTopFunction,
      dirty,
      markSaved: () => setDirty(false),
      fileName,
      setFileName,
    }),
    [doc, mutate, replaceDoc, undo, redo, past.length, future.length, selection, clipboard, openStack, openFunction, closeTopFunction, dirty, fileName],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStrukto() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStrukto must be used inside StruktoProvider");
  return ctx;
}
