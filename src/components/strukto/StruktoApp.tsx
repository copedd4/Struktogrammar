import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FilePlus2,
  FolderOpen,
  Languages,
  History,
  Maximize,
  Palette,
  Scan,
  Search,
  LayoutTemplate,
  Save,
  SquareFunction,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
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
import { PICKER_ITEMS } from "./BlockPicker";
import { setPayload } from "./Diagram";
import { useI18n, type Lang } from "@/lib/strukto/i18n";
import { useStrukto } from "@/lib/strukto/store";
import { useOps } from "@/lib/strukto/ops";
import { THEMES, THEME_STORAGE_KEY, applyTheme, type ThemeId } from "@/lib/strukto/themes";
import { ROOT_LIST, emptyDoc, findNode, locate, makeNode, reId, validate } from "@/lib/strukto/model";
import { hasHandle, openProject, openRecent, resetHandle, saveProject, saveToHandle } from "@/lib/strukto/fileio";
import { exportPdf, exportPng, exportSvg } from "@/lib/strukto/exporting";
import type { BlockKind, SNode } from "@/lib/strukto/types";
import { cn } from "@/lib/utils";

type Scope = "current" | "all";

export function StruktoApp() {
  const store = useStrukto();
  const ops = useOps();
  const { t, lang, setLang } = useI18n();
  const view = useCanvasView();
  const [theme, setTheme] = useState<ThemeId>("light");
  const [scope, setScope] = useState<Scope>("current");
  const mainRef = useRef<HTMLDivElement>(null);
  const [diskAutosave, setDiskAutosave] = useState(false);
  const [recent, setRecent] = useState<RecentFile[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [query, setQuery] = useState("");
  const allRef = useRef<HTMLDivElement>(null);

  const { doc, selection } = store;
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

  const insertBlock = useCallback(
    (kind: BlockKind) => {
      const fn = doc.functions[activeFuncId];
      if (!fn) return;
      const at = selection && selection.funcId === activeFuncId ? locate(fn, selection.nodeId) : null;
      const key = at?.key ?? ROOT_LIST;
      const index = at ? at.index + 1 : fn.body.length;
      if (kind === "call") ops.insertFunctionBlock(activeFuncId, key, index, `function${Object.keys(doc.functions).length}`);
      else ops.insert(activeFuncId, key, index, makeNode(kind));
    },
    [activeFuncId, doc.functions, ops, selection],
  );

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable))
        return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? store.redo() : store.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        store.redo();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const blocks = Array.from(document.querySelectorAll<HTMLElement>("[data-block-id]")).filter(
          (el) => el.offsetParent !== null,
        );
        if (!blocks.length) return;
        e.preventDefault();
        const current = blocks.findIndex((el) => el.dataset["blockId"] === selection?.nodeId);
        const next =
          current < 0
            ? 0
            : (current + (e.key === "ArrowDown" ? 1 : -1) + blocks.length) % blocks.length;
        blocks[next]?.focus();
        return;
      }
      if (e.key === "Enter" && selection) {
        const el = document.querySelector<HTMLElement>(`[data-block-id="${selection.nodeId}"]`);
        const field = el?.querySelector<HTMLElement>("textarea, input, [contenteditable]");
        if (field) {
          e.preventDefault();
          field.click();
          field.focus();
          return;
        }
      }
      if (!selection) {
        const hit = PICKER_ITEMS.find((i) => i.shortcut?.toLowerCase() === e.key.toLowerCase());
        if (!mod && hit) {
          e.preventDefault();
          insertBlock(hit.kind);
        }
        return;
      }
      const fn = doc.functions[selection.funcId];
      const node = fn ? findNode(fn.body, selection.nodeId)?.node : null;
      if (mod && e.key.toLowerCase() === "c" && node) {
        e.preventDefault();
        store.setClipboard(node);
        toast.success(t.copy);
      } else if (mod && e.key.toLowerCase() === "v" && store.clipboard && fn) {
        e.preventDefault();
        const at = locate(fn, selection.nodeId);
        ops.insert(selection.funcId, at?.key ?? ROOT_LIST, (at?.index ?? -1) + 1, reId(store.clipboard));
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        ops.duplicate(selection.funcId, selection.nodeId);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        ops.remove(selection.funcId, selection.nodeId);
        store.setSelection(null);
      } else if (e.key === "Escape") {
        store.setSelection(null);
      } else if (!mod) {
        const hit = PICKER_ITEMS.find((i) => i.shortcut?.toLowerCase() === e.key.toLowerCase());
        if (hit) {
          e.preventDefault();
          insertBlock(hit.kind);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doc.functions, insertBlock, ops, selection, store, t]);

  /* --------------------------------- files -------------------------------- */

  const handleSave = async (saveAs = false) => {
    try {
      const name = await saveProject(doc, store.fileName ?? doc.name, saveAs);
      store.setFileName(name);
      store.markSaved();
      toast.success(`${t.saved}: ${name}`);
    } catch {
      /* cancelled */
    }
  };

  const handleOpen = async () => {
    try {
      const res = await openProject();
      if (!res) return;
      store.replaceDoc(res.doc);
      store.setFileName(res.name);
      toast.success(res.name);
    } catch {
      toast.error("Invalid .stkg file");
    }
  };

  const handleOpenRecent = async (name: string) => {
    try {
      const res = await openRecent(name);
      if (!res) {
        toast.error(name);
        return;
      }
      store.replaceDoc(res.doc);
      store.setFileName(res.name);
      toast.success(res.name);
    } catch {
      toast.error("Invalid .stkg file");
    }
  };

  const handleNew = () => {
    resetHandle();
    store.replaceDoc(emptyDoc("Untitled"));
    store.setFileName(null);
  };

  /* -------------------------------- exports ------------------------------- */

  const exportTargets = () => {
    if (scope === "all" && allRef.current)
      return Array.from(allRef.current.querySelectorAll<HTMLElement>("[data-export-surface]"));
    return mainRef.current ? [mainRef.current] : [];
  };

  const runExport = async (fmt: "png" | "svg" | "pdf") => {
    if (issues.length) toast.warning(t.issuesFound(issues.length));
    const els = exportTargets();
    if (!els.length) return;
    const name = (store.fileName ?? doc.name).replace(/\.stkg$/, "");
    try {
      if (fmt === "png") await exportPng(els, name);
      if (fmt === "svg") await exportSvg(els, name);
      if (fmt === "pdf") await exportPdf(els, name);
    } catch {
      toast.error("Export failed");
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
            <DropdownMenuItem onSelect={handleNew}><FilePlus2 className="size-4" />{t.newProject}</DropdownMenuItem>
            <DropdownMenuItem onSelect={handleOpen}><FolderOpen className="size-4" />{t.open}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleSave(false)}><Save className="size-4" />{t.save}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleSave(true)}>{t.saveAs}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setShowTemplates(true)}>
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
                    <DropdownMenuItem key={r.name} onSelect={() => handleOpenRecent(r.name)}>
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
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="sm" disabled={!store.canUndo} onClick={store.undo}>
          <Undo2 className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" disabled={!store.canRedo} onClick={store.redo}>
          <Redo2 className="size-4" />
        </Button>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Button variant="ghost" size="sm" onClick={() => view.zoomBy(1 / 1.2)} title={t.zoomOut}>
          <ZoomOut className="size-4" />
        </Button>
        <span className="w-10 text-center text-xs tabular-nums">{Math.round(view.zoom * 100)}%</span>
        <Button variant="ghost" size="sm" onClick={() => view.zoomBy(1.2)} title={t.zoomIn}>
          <ZoomIn className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={view.reset} title={t.resetView}>
          <Maximize className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={view.fit} title={t.fitToView} aria-label={t.fitToView}>
          <Scan className="size-4" />
        </Button>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Popover>
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
            <Button variant="ghost" size="sm" className={cn(issues.length && "text-destructive")}>
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
                  <li key={`${i.nodeId}-${i.message}`} className="text-muted-foreground">
                    <span className="text-foreground font-mono text-xs">
                      {doc.functions[i.funcId]?.name}
                    </span>{" "}
                    — {t[i.message]}
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
            <div className="grid gap-1">
              {PICKER_ITEMS.map((item) => (
                <button
                  key={item.kind}
                  type="button"
                  draggable
                  onDragStart={(e) => setPayload(e, { type: "new", kind: item.kind })}
                  onClick={() => insertBlock(item.kind)}
                  className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm active:cursor-grabbing"
                >
                  <item.icon className="size-4 shrink-0 opacity-80" />
                  <span className="flex-1 truncate">{t[item.labelKey]}</span>
                  <kbd className="border-sidebar-border rounded border px-1 text-[10px] opacity-60">
                    {item.shortcut}
                  </kbd>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide uppercase opacity-70">{t.functions}</p>
            <div className="grid gap-1">
              {functions.map((fn) => (
                <button
                  key={fn.id}
                  type="button"
                  draggable={fn.id !== doc.mainId}
                  onDragStart={(e) => setPayload(e, { type: "fnref", funcId: fn.id })}
                  onClick={() => (fn.id === doc.mainId ? store.closeTopFunction() : store.openFunction(fn.id))}
                  className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-sm active:cursor-grabbing"
                >
                  <SquareFunction className="size-4 shrink-0 opacity-80" />
                  <span className="flex-1 truncate">{fn.name}</span>
                  {fn.orphaned ? <span className="text-[10px] opacity-60">{t.orphaned}</span> : null}
                </button>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="mt-1"
                onClick={() => {
                  const id = ops.createFunction(`function${functions.length}`);
                  store.openFunction(id);
                }}
              >
                {t.newFunction}
              </Button>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed opacity-60">
            {t.autosaved} · Ctrl/⌘ + wheel = {t.zoomIn}
            <br />
            {t.keyboardNav}
            <br />
            {t.reorderCaseHint}
          </p>
        </aside>

        {/* canvas */}
        <Canvas view={view}>
          <div onClick={() => store.setSelection(null)}>
            <DiagramSurface ref={mainRef} funcId={doc.mainId} />
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

      <FunctionModals />

      {/* offscreen surface for full call-tree export */}
      <div ref={allRef} className="pointer-events-none fixed top-0 -left-[10000px] w-[760px]" aria-hidden>
        {functions.map((fn) => (
          <div key={fn.id} data-export-surface className="bg-canvas p-4">
            <DiagramSurface funcId={fn.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
