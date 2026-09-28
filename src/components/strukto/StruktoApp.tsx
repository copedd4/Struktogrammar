import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FilePlus2,
  FolderOpen,
  Languages,
  History,
  Code2,
  Maximize,
  Palette,
  Pencil,
  Scan,
  Search,
  LayoutTemplate,
  Save,
  SquareFunction,
  Trash2,
  X,
  FileInput,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";

/** Keep long function names readable in the narrow sidebar. */
function shortenName(name: string, max = 18): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { templates } from "@/lib/strukto/templates";
import { clearRecent, listRecent, type RecentFile } from "@/lib/strukto/recent";
import { Canvas, useCanvasView } from "./Canvas";
import { DiagramSurface } from "./DiagramSurface";
import { FunctionModals } from "./FunctionModal";
import { CodePanel } from "./CodePanel";
import { ALT, PICKER_ITEMS } from "./BlockPicker";
import { MOD, setPayload, type DeleteRequest } from "./Diagram";
import { CommandPalette } from "./CommandPalette";
import { makeClip, noteSystemClipboardWritten, resolvePaste, serializeClip } from "@/lib/strukto/clipboard";
import { useI18n, type Lang } from "@/lib/strukto/i18n";
import { useStrukto } from "@/lib/strukto/store";
import { useOps } from "@/lib/strukto/ops";
import { THEMES, THEME_STORAGE_KEY, applyTheme, type ThemeId } from "@/lib/strukto/themes";
import { ROOT_LIST, callsFunction, emptyDoc, findNode, locate, makeNode, validate, walk } from "@/lib/strukto/model";
import { hasHandle, openProject, openRecent, resetHandle, saveProject, saveToHandle } from "@/lib/strukto/fileio";
import { InvalidFileError } from "@/lib/strukto/schema";
import { exportDiagram, type ExportFormat } from "@/lib/strukto/exporting";
import type { BlockKind, SNode } from "@/lib/strukto/types";
import { cn } from "@/lib/utils";

type Scope = "current" | "all";

/** True while the user is typing in a text field (shortcuts must not fire then). */
const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) && !(el as HTMLTextAreaElement).readOnly;
};

export function StruktoApp() {
  const store = useStrukto();
  const ops = useOps();
  const { t, lang, setLang } = useI18n();
  const view = useCanvasView();
  const [theme, setTheme] = useState<ThemeId>("light");
  const [scope, setScope] = useState<Scope>("current");
  const [diskAutosave, setDiskAutosave] = useState(false);
  const [recent, setRecent] = useState<RecentFile[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [showFnImport, setShowFnImport] = useState(false);
  const [deleteFn, setDeleteFn] = useState<string | null>(null);
  const [renameFn, setRenameFn] = useState<string | null>(null);
  const [pending, setPending] = useState<null | (() => void)>(null);
  const [query, setQuery] = useState("");
  const [showPalette, setShowPalette] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const { doc, selection } = store;

  /** Run an action, but ask first when there are unsaved changes. */
  const guard = useCallback(
    (action: () => void) => {
      if (store.dirty) setPending(() => action);
      else action();
    },
    [store.dirty],
  );

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!store.dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [store.dirty]);

  const activeFuncId = store.openStack.at(-1) ?? doc.mainId;
  const issues = useMemo(() => validate(doc), [doc]);

  useEffect(() => {
    const stored = (localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null) ?? "light";
    setTheme(stored);
    applyTheme(stored);
  }, []);

  useEffect(() => setRecent(listRecent()), [store.fileName, store.dirty]);

  /* autosave straight to the opened file once the user granted access */
  useEffect(() => {
    if (!diskAutosave || !store.dirty || !hasHandle()) return;
    const timer = setTimeout(async () => {
      if (await saveToHandle(doc)) store.markSaved();
    }, 1500);
    return () => clearTimeout(timer);
  }, [diskAutosave, doc, store]);

  const changeTheme = (id: ThemeId) => {
    setTheme(id);
    applyTheme(id);
    localStorage.setItem(THEME_STORAGE_KEY, id);
  };

  /* --------------------------- insertion helpers -------------------------- */

  /** Insert after the selected block (in whichever diagram it is), else at the end of the open function. */
  const insertBlock = (kind: BlockKind) => {
    const at = insertionPoint();
    if (!doc.functions[at.funcId]) return;
    if (kind === "call") ops.insertFunctionBlock(at.funcId, at.key, at.index, "function");
    else ops.insert(at.funcId, at.key, at.index, makeNode(kind));
  };

  /* ------------------------------- search --------------------------------- */

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: Array<{ funcId: string; nodeId: string; text: string; fnName: string }> = [];
    const textOf = (n: SNode) =>
      "text" in n ? n.text : "cond" in n ? n.cond : "expr" in n ? n.expr : "";
    const walkNodes = (funcId: string, fnName: string, nodes: SNode[]) => {
      for (const n of nodes) {
        const text = textOf(n);
        if (text && text.toLowerCase().includes(q)) out.push({ funcId, nodeId: n.id, text, fnName });
        if (n.kind === "if") {
          walkNodes(funcId, fnName, n.then);
          walkNodes(funcId, fnName, n.else);
        } else if (n.kind === "while" || n.kind === "dowhile" || n.kind === "for") {
          walkNodes(funcId, fnName, n.body);
        } else if (n.kind === "switch") {
          n.cases.forEach((c) => walkNodes(funcId, fnName, c.body));
          walkNodes(funcId, fnName, n.defaultCase.body);
        }
      }
    };
    Object.values(doc.functions).forEach((fn) => walkNodes(fn.id, fn.name, fn.body));
    return out.slice(0, 50);
  }, [doc.functions, query]);

  const jumpTo = (funcId: string, nodeId: string) => {
    if (funcId !== doc.mainId) store.openFunction(funcId);
    store.setSelection({ funcId, nodeId });
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-block-id="${nodeId}"]`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus();
    });
  };

  /* ------------------------------- shortcuts ------------------------------ */

  /** Where a paste / insertion goes: after the selected block, else at the end of the open function. */
  const insertionPoint = () => {
    if (selection) {
      const fn = doc.functions[selection.funcId];
      const at = fn ? locate(fn, selection.nodeId) : null;
      if (at) return { funcId: selection.funcId, key: at.key, index: at.index + 1 };
    }
    return { funcId: activeFuncId, key: ROOT_LIST, index: doc.functions[activeFuncId]?.body.length ?? 0 };
  };

  // Handlers read the latest render's state through this ref, so the listeners
  // are registered once instead of on every change.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  const clipHandler = useRef<(e: ClipboardEvent) => void>(() => {});

  keyHandler.current = (e: KeyboardEvent) => {
    const typing = isTyping(e.target);
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    // file commands also work while a text field is being edited
    if (mod && key === "s") {
      e.preventDefault();
      // leaving the field commits its text before the document is written
      (document.activeElement as HTMLElement | null)?.blur?.();
      setTimeout(() => void saveRef.current(e.shiftKey));
      return;
    }
    if (mod && key === "o") {
      e.preventDefault();
      guard(() => void handleOpen());
      return;
    }
    if (mod && key === "k") {
      e.preventDefault();
      setShowPalette(true);
      return;
    }
    if (typing) return;
    if (mod && key === "z") {
      e.preventDefault();
      if (e.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if (mod && key === "y") {
      e.preventDefault();
      store.redo();
      return;
    }
    // Alt + letter inserts a block (e.code, because Alt changes e.key on macOS)
    if (e.altKey && !mod) {
      const hit = PICKER_ITEMS.find((i) => i.shortcut && e.code === `Key${i.shortcut}`);
      if (hit) {
        e.preventDefault();
        insertBlock(hit.kind);
      }
      return;
    }
    const current = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-block-id]");
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const blocks = Array.from(document.querySelectorAll<HTMLElement>("[data-block-id]")).filter(
        (el) => el.offsetParent !== null,
      );
      if (!blocks.length) return;
      e.preventDefault();
      const i = current ? blocks.indexOf(current) : -1;
      const next = i < 0 ? 0 : (i + (e.key === "ArrowDown" ? 1 : -1) + blocks.length) % blocks.length;
      blocks[next]?.focus();
      return;
    }
    // ← / → leave to the enclosing block / enter the first nested one
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && current) {
      const target =
        e.key === "ArrowLeft"
          ? current.parentElement?.closest<HTMLElement>("[data-block-id]")
          : current.querySelector<HTMLElement>("[data-block-id]");
      if (target) {
        e.preventDefault();
        target.focus();
      }
      return;
    }
    if (!selection) return;
    if (mod && key === "d") {
      e.preventDefault();
      ops.duplicate(selection.funcId, selection.nodeId);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent<DeleteRequest>("strukto:request-delete", { detail: {} }));
    } else if (e.key === "Escape") {
      store.setSelection(null);
    }
  };

  /* Copy / cut / paste use the clipboard events, which may read and write the
   * system clipboard without a permission prompt. */
  clipHandler.current = (e: ClipboardEvent) => {
    if (isTyping(e.target) || !e.clipboardData) return;
    // highlighted text (code panel, dialogs, …) is copied the normal way
    if (e.type !== "paste" && !window.getSelection()?.isCollapsed) return;
    const focus = document.activeElement;
    if (focus && focus !== document.body && !focus.closest("[data-block-id]")) return;
    if (e.type === "paste") {
      const clips = resolvePaste(e.clipboardData.getData("text/plain"), store.clipboard, doc);
      if (!clips.length) return;
      e.preventDefault();
      const at = insertionPoint();
      ops.pasteClips(at.funcId, at.key, at.index, clips);
      return;
    }
    if (!selection) return;
    const fn = doc.functions[selection.funcId];
    const node = fn ? findNode(fn.body, selection.nodeId)?.node : null;
    if (!node) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", serializeClip(makeClip(doc, node)));
    noteSystemClipboardWritten();
    store.setClipboard(node);
    if (e.type === "cut")
      window.dispatchEvent(new CustomEvent<DeleteRequest>("strukto:request-delete", { detail: { cut: true } }));
    else toast.success(t.copy);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e);
    const onClip = (e: ClipboardEvent) => clipHandler.current(e);
    window.addEventListener("keydown", onKey);
    document.addEventListener("copy", onClip);
    document.addEventListener("cut", onClip);
    document.addEventListener("paste", onClip);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("copy", onClip);
      document.removeEventListener("cut", onClip);
      document.removeEventListener("paste", onClip);
    };
  }, []);

  /* --------------------------------- files -------------------------------- */

  const saveRef = useRef<(saveAs: boolean) => Promise<boolean>>(async () => false);

  /** Returns true only when the document was actually written. */
  const handleSave = async (saveAs = false): Promise<boolean> => {
    try {
      const name = await saveProject(doc, store.fileName ?? doc.name, saveAs);
      store.setFileName(name);
      store.markSaved();
      toast.success(`${t.saved}: ${name}`);
      return true;
    } catch (err) {
      if ((err as DOMException)?.name !== "AbortError") toast.error(t.saveFailed);
      return false;
    }
  };

  saveRef.current = handleSave;

  const openFailed = (err: unknown) => {
    if (err instanceof InvalidFileError)
      toast.error(err.reason === "newer" ? t.newerFile : `${t.invalidFile}: ${err.message}`);
    else toast.error(t.openFailed);
  };

  const handleOpen = async () => {
    try {
      const res = await openProject();
      if (!res) return;
      store.replaceDoc(res.doc);
      store.setFileName(res.name);
      toast.success(res.name);
    } catch (err) {
      openFailed(err);
    }
  };

  const handleOpenRecent = async (r: RecentFile) => {
    try {
      const res = await openRecent(r.id);
      if (!res) {
        toast.error(`${t.openFailed}: ${r.name}`);
        return;
      }
      store.replaceDoc(res.doc);
      store.setFileName(res.name);
      toast.success(res.name);
    } catch (err) {
      openFailed(err);
    }
  };

  const handleNew = () => {
    resetHandle();
    store.replaceDoc(emptyDoc("Untitled"));
    store.setFileName(null);
  };

  /* -------------------------------- exports ------------------------------- */

  /**
   * "Current view" is the function in the top-most window (main when none is open).
   * "Full call tree" starts there and follows its calls; functions not reached
   * that way are appended so nothing is left out.
   */
  const exportFuncIds = (): string[] => {
    if (scope === "current") return [activeFuncId];
    const order: string[] = [];
    const visit = (id: string) => {
      const fn = doc.functions[id];
      if (!fn || order.includes(id)) return;
      order.push(id);
      walk(fn.body, (n) => n.kind === "call" && visit(n.funcId));
    };
    visit(activeFuncId);
    visit(doc.mainId);
    Object.keys(doc.functions).forEach(visit);
    return order;
  };

  const runExport = async (fmt: ExportFormat) => {
    if (issues.length) toast.warning(t.issuesFound(issues.length));
    const name = (store.fileName ?? doc.name).replace(/\.stkg$/, "");
    try {
      await exportDiagram(fmt, {
        doc,
        funcIds: exportFuncIds(),
        name,
        labels: {
          yes: t.yes,
          no: t.no,
          doLabel: t.doLabel,
          whileLabel: t.whileLabel,
          missingFunction: t.missingFunction,
        },
      });
    } catch {
      toast.error(t.exportFailed);
    }
  };

  /* --------------------------------- render ------------------------------- */

  const functions = Object.values(doc.functions);

  return (
    <div className="bg-background text-foreground flex h-screen flex-col overflow-hidden">
      {/* top bar */}
      <header className="border-border bg-card flex shrink-0 flex-wrap items-center gap-1 border-b px-3 py-1.5">
        <span className="text-primary mr-2 font-semibold">{t.appName}</span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">{t.file}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => guard(handleNew)}><FilePlus2 className="size-4" />{t.newProject}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => guard(() => void handleOpen())}><FolderOpen className="size-4" />{t.open}<DropdownMenuShortcut>{MOD}O</DropdownMenuShortcut></DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleSave(false)}><Save className="size-4" />{t.save}<DropdownMenuShortcut>{MOD}S</DropdownMenuShortcut></DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleSave(true)}>{t.saveAs}<DropdownMenuShortcut>{MOD}⇧S</DropdownMenuShortcut></DropdownMenuItem>
            <DropdownMenuItem onSelect={() => guard(() => setShowTemplates(true))}>
              <LayoutTemplate className="size-4" />
              {t.templates}
            </DropdownMenuItem>
            <DropdownMenuCheckboxItem checked={diskAutosave} onCheckedChange={(v) => setDiskAutosave(!!v)}>
              {t.autosaveDisk}
            </DropdownMenuCheckboxItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t.recentFiles}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {recent.length === 0 ? (
                  <DropdownMenuItem disabled>{t.noRecentFiles}</DropdownMenuItem>
                ) : (
                  recent.map((r) => (
                    <DropdownMenuItem
                      key={r.id}
                      onSelect={() => guard(() => void handleOpenRecent(r))}
                    >
                      {r.name}
                    </DropdownMenuItem>
                  ))
                )}
                {recent.length ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => {
                        clearRecent();
                        setRecent([]);
                      }}
                    >
                      {t.clearRecent}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t.exportScope}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={scope} onValueChange={(v) => setScope(v as Scope)}>
              <DropdownMenuRadioItem value="current">{t.scopeCurrent}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="all">{t.scopeAll}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => runExport("png")}>{t.exportPng}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => runExport("svg")}>{t.exportSvg}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => runExport("pdf")}>{t.exportPdf}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setShowCode(true)}>
              <Code2 className="size-4" />
              {t.code}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="sm" disabled={!store.canUndo} onClick={store.undo} title={`${t.undo} (${MOD}Z)`} aria-label={t.undo}>
          <Undo2 className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" disabled={!store.canRedo} onClick={store.redo} title={`${t.redo} (${MOD}Y)`} aria-label={t.redo}>
          <Redo2 className="size-4" />
        </Button>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Button variant="ghost" size="sm" onClick={() => view.zoomBy(1 / 1.2)} title={t.zoomOut} aria-label={t.zoomOut}>
          <ZoomOut className="size-4" />
        </Button>
        <span className="w-10 text-center text-xs tabular-nums">{Math.round(view.zoom * 100)}%</span>
        <Button variant="ghost" size="sm" onClick={() => view.zoomBy(1.2)} title={t.zoomIn} aria-label={t.zoomIn}>
          <ZoomIn className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={view.reset} title={t.resetView} aria-label={t.resetView}>
          <Maximize className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={view.fit} title={t.fitToView} aria-label={t.fitToView}>
          <Scan className="size-4" />
        </Button>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Popover open={showSearch} onOpenChange={setShowSearch}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" title={t.search} aria-label={t.search}>
              <Search className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
            />
            <ul className="mt-2 max-h-64 space-y-1 overflow-auto text-sm">
              {query && results.length === 0 ? (
                <li className="text-muted-foreground">{t.noResults}</li>
              ) : null}
              {results.map((r) => (
                <li key={`${r.funcId}-${r.nodeId}`}>
                  <button
                    type="button"
                    onClick={() => jumpTo(r.funcId, r.nodeId)}
                    className="hover:bg-accent w-full truncate rounded px-2 py-1 text-left"
                  >
                    <span className="text-muted-foreground font-mono text-xs">{r.fnName}</span>{" "}
                    {r.text}
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>

        <Button variant="ghost" size="sm" onClick={() => setShowCode(true)} title={t.code} aria-label={t.code}>
          <Code2 className="size-4" />
        </Button>

        <Popover open={showHistory} onOpenChange={setShowHistory}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" title={t.history} aria-label={t.history}>
              <History className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72">
            <p className="text-sm font-medium">{t.history}</p>
            <p className="text-muted-foreground mb-2 text-xs">{t.historyHint}</p>
            <ol className="max-h-72 space-y-0.5 overflow-auto text-sm">
              {store.past.map((h, i) => (
                <li key={`p-${i}`}>
                  <button
                    type="button"
                    onClick={() => store.jumpBack(i)}
                    className="hover:bg-accent w-full rounded px-2 py-1 text-left"
                  >
                    {i === 0 ? t.initialState : t[store.past[i - 1]!.label as keyof typeof t] as string}
                  </button>
                </li>
              ))}
              <li className="bg-accent text-accent-foreground rounded px-2 py-1 font-medium">
                {store.past.length
                  ? (t[store.past.at(-1)!.label as keyof typeof t] as string)
                  : t.currentState}
              </li>
              {store.future.map((h, i) => (
                <li key={`f-${i}`}>
                  <button
                    type="button"
                    onClick={() => store.jumpForward(i)}
                    className="hover:bg-accent text-muted-foreground w-full rounded px-2 py-1 text-left"
                  >
                    {t[h.label as keyof typeof t] as string}
                  </button>
                </li>
              ))}
            </ol>
          </PopoverContent>
        </Popover>

        <div className="flex-1" />

        <span
          className={cn(
            "mr-1 rounded px-2 py-0.5 text-xs",
            store.dirty ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground",
          )}
        >
          {store.fileName ? `${store.fileName} · ` : ""}
          {store.dirty ? t.unsavedShort : t.savedShort}
        </span>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className={cn(issues.length && "text-destructive")} title={t.validation} aria-label={t.validation}>
              {issues.length ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}
              <span className="ml-1 text-xs">{issues.length || ""}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <p className="mb-2 text-sm font-medium">{t.validation}</p>
            {issues.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t.noIssues}</p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-auto text-sm">
                {issues.map((i) => (
                  <li key={`${i.nodeId}-${i.message}`}>
                    <button
                      type="button"
                      title={t.jumpToIssue}
                      onClick={() => jumpTo(i.funcId, i.nodeId)}
                      className="text-muted-foreground hover:bg-accent w-full rounded px-2 py-1 text-left"
                    >
                      <span className="text-foreground font-mono text-xs">
                        {doc.functions[i.funcId]?.name}
                      </span>{" "}
                      — {t[i.message]}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-muted-foreground mt-3 text-xs">{t.exportNote}</p>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" aria-label={t.theme}><Palette className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t.theme}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => changeTheme(v as ThemeId)}>
              {THEMES.map((th) => (
                <DropdownMenuRadioItem key={th.id} value={th.id}>
                  {lang === "de" ? th.labelDe : th.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" aria-label={t.language}><Languages className="size-4" /> {lang.toUpperCase()}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={lang} onValueChange={(v) => setLang(v as Lang)}>
              <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="de">Deutsch</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* palette */}
        <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border flex w-60 shrink-0 flex-col gap-4 overflow-auto border-r p-3">
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide uppercase opacity-70">{t.blocks}</p>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
              {PICKER_ITEMS.map((item) => (
                <button
                  key={item.kind}
                  type="button"
                  draggable
                  onDragStart={(e) => setPayload(e, { type: "new", kind: item.kind })}
                  onClick={() => insertBlock(item.kind)}
                  title={`${t[item.labelKey]} (${ALT}${item.shortcut})`}
                  className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm active:cursor-grabbing"
                >
                  <item.icon className="size-4 shrink-0 opacity-80" />
                  <span className="min-w-0 flex-1 truncate">{t[item.labelKey]}</span>
                  <kbd className="border-sidebar-border shrink-0 rounded border px-1 text-[10px] opacity-60">
                    {ALT}
                    {item.shortcut}
                  </kbd>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide uppercase opacity-70">{t.functions}</p>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
              {functions.map((fn) => (
                <div
                  key={fn.id}
                  className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group flex min-w-0 items-center gap-1 rounded-md pr-1"
                >
                  {renameFn === fn.id ? (
                    <input
                      autoFocus
                      defaultValue={fn.name}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== fn.name) ops.renameFunction(fn.id, v);
                        setRenameFn(null);
                      }}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setRenameFn(null);
                      }}
                      className="bg-background text-foreground min-w-0 flex-1 rounded-md border px-2 py-1 font-mono text-sm outline-none"
                    />
                  ) : (
                  <button
                    type="button"
                    draggable={fn.id !== doc.mainId}
                    onDragStart={(e) => setPayload(e, { type: "fnref", funcId: fn.id })}
                    onClick={() => (fn.id === doc.mainId ? store.closeTopFunction() : store.openFunction(fn.id))}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      setRenameFn(fn.id);
                    }}
                    title={fn.name}
                    className="flex min-w-0 flex-1 cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-sm active:cursor-grabbing"
                  >
                    <SquareFunction className="size-4 shrink-0 opacity-80" />
                    <span className="min-w-0 flex-1 truncate">{shortenName(fn.name)}</span>
                    {fn.orphaned ? <span className="shrink-0 text-[10px] opacity-60">{t.orphaned}</span> : null}
                  </button>
                  )}
                  <button
                    type="button"
                    title={t.renameFunction}
                    aria-label={t.renameFunction}
                    onClick={() => setRenameFn(fn.id)}
                    className="hover:bg-sidebar-border shrink-0 rounded p-1 opacity-60 hover:opacity-100"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  {store.openStack.includes(fn.id) ? (
                    <button
                      type="button"
                      title={t.closeFunction}
                      aria-label={t.closeFunction}
                      onClick={() => store.closeFunctionById(fn.id)}
                      className="hover:bg-sidebar-border shrink-0 rounded p-1 opacity-60 hover:opacity-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                  {fn.id !== doc.mainId ? (
                    <button
                      type="button"
                      title={t.deleteFunction}
                      aria-label={t.deleteFunction}
                      onClick={() => setDeleteFn(fn.id)}
                      className="hover:text-destructive shrink-0 rounded p-1 opacity-60 hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="mt-1"
                onClick={() => {
                  const id = ops.createFunction("function");
                  store.openFunction(id);
                }}
              >
                {t.newFunction}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowFnImport(true)}>
                <FileInput className="size-4" />
                {t.importCodeFunction}
              </Button>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed opacity-60">
            {t.autosaved} · {t.zoomHint}
            <br />
            {t.keyboardNav}
            <br />
            {t.keyboardNavTree}
            <br />
            {t.insertShortcutHint}
            <br />
            {t.reorderCaseHint}
          </p>
        </aside>

        {/* canvas */}
        <Canvas view={view}>
          <div onClick={() => store.setSelection(null)}>
            <DiagramSurface funcId={doc.mainId} />
          </div>
        </Canvas>
      </div>

      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.templates}</DialogTitle>
            <DialogDescription>{t.templateHint}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => {
                  resetHandle();
                  store.replaceDoc(tpl.build());
                  store.setFileName(null);
                  setShowTemplates(false);
                }}
                className="hover:bg-accent rounded-md border p-3 text-left"
              >
                <p className="font-medium">{t[tpl.titleKey]}</p>
                <p className="text-muted-foreground text-xs">{t[tpl.descKey]}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <CodePanel open={showCode} onOpenChange={setShowCode} activeFuncId={activeFuncId} />

      <CodePanel
        open={showFnImport}
        onOpenChange={setShowFnImport}
        activeFuncId={activeFuncId}
        target="functions"
      />

      {/* delete a function from the sidebar */}
      <Dialog open={!!deleteFn} onOpenChange={(v) => !v && setDeleteFn(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.deleteFunctionSideTitle}</DialogTitle>
            <DialogDescription>
              {deleteFn
                ? t.deleteFunctionSideBody(
                    doc.functions[deleteFn]?.name ?? "",
                    callsFunction(doc, deleteFn).length,
                  )
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteFn) {
                  store.closeFunctionById(deleteFn);
                  ops.deleteFunctionEverywhere(deleteFn);
                }
                setDeleteFn(null);
              }}
            >
              {t.deleteFunction}
            </Button>
            <Button variant="outline" onClick={() => setDeleteFn(null)}>
              {t.cancel}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* unsaved-changes guard */}
      <Dialog open={!!pending} onOpenChange={(v) => !v && setPending(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.unsavedTitle}</DialogTitle>
            <DialogDescription>{t.unsavedBody}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              onClick={async () => {
                const action = pending;
                setPending(null);
                // only continue when the save really happened (not cancelled / failed)
                if (await handleSave(false)) action?.();
              }}
            >
              <Save className="size-4" />
              {t.saveAndContinue}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const action = pending;
                setPending(null);
                action?.();
              }}
            >
              {t.discardAndContinue}
            </Button>
            <Button variant="outline" onClick={() => setPending(null)}>
              {t.cancel}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <FunctionModals />

      <CommandPalette
        open={showPalette}
        onOpenChange={setShowPalette}
        onInsert={insertBlock}
        commands={[
          { id: "new", group: "file", label: t.newProject, run: () => guard(handleNew) },
          { id: "open", group: "file", label: t.open, shortcut: `${MOD}O`, run: () => guard(() => void handleOpen()) },
          { id: "save", group: "file", label: t.save, shortcut: `${MOD}S`, run: () => void handleSave(false) },
          { id: "saveAs", group: "file", label: t.saveAs, run: () => void handleSave(true) },
          { id: "png", group: "file", label: `${t.export}: ${t.exportPng}`, run: () => void runExport("png") },
          { id: "svg", group: "file", label: `${t.export}: ${t.exportSvg}`, run: () => void runExport("svg") },
          { id: "pdf", group: "file", label: `${t.export}: ${t.exportPdf}`, run: () => void runExport("pdf") },
          { id: "code", group: "file", label: t.code, run: () => setShowCode(true) },
          { id: "templates", group: "file", label: t.templates, run: () => guard(() => setShowTemplates(true)) },
          { id: "undo", group: "view", label: t.undo, shortcut: `${MOD}Z`, run: store.undo },
          { id: "redo", group: "view", label: t.redo, shortcut: `${MOD}Y`, run: store.redo },
          { id: "zoomIn", group: "view", label: t.zoomIn, run: () => view.zoomBy(1.2) },
          { id: "zoomOut", group: "view", label: t.zoomOut, run: () => view.zoomBy(1 / 1.2) },
          { id: "fit", group: "view", label: t.fitToView, run: view.fit },
          { id: "reset", group: "view", label: t.resetView, run: view.reset },
          { id: "search", group: "view", label: t.search, run: () => setShowSearch(true) },
        ]}
      />

    </div>
  );
}
