import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { ChevronDown, ChevronRight, Plus, SquareFunction, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  makeClip,
  readSystemClipboard,
  resolvePaste,
  serializeClip,
  writeSystemClipboard,
} from "@/lib/strukto/clipboard";
import { callLabel } from "@/lib/strukto/render";
import { EditableText, EditLock } from "./Editable";
import { BlockPicker } from "./BlockPicker";
import { useI18n } from "@/lib/strukto/i18n";
import { childBlocks, useOps } from "@/lib/strukto/ops";
import { useStrukto } from "@/lib/strukto/store";
import {
  ROOT_LIST,
  countCalls,
  countNodes,
  listKey,
  locate,
  makeNode,
  reId,
} from "@/lib/strukto/model";
import type {
  BlockKind,
  SNode,
  StruktoDoc,
  SwitchCase,
  TerminatorVariant,
} from "@/lib/strukto/types";
import {
  DIAG_PAD,
  DIAG_TEXT_RATIO,
  ifHeaderLayout,
  switchHeaderLayout,
} from "@/lib/strukto/geometry";
import { cn } from "@/lib/utils";

interface Ctx {
  funcId: string;
}

type DragPayload =
  | { type: "new"; kind: BlockKind }
  | { type: "move"; funcId: string; nodeId: string }
  | { type: "fnref"; funcId: string }
  | { type: "copy"; node: SNode }
  | { type: "case"; funcId: string; switchId: string; caseId: string };

const MIME = "application/x-strukto";

/* chain of inlined function ids, used to prevent infinite recursion */
const InlineChain = createContext<string[]>([]);

/**
 * Identifies where a diagram is shown ("canvas", "window", plus the call blocks it
 * is expanded through). The same block can be visible several times at once;
 * only the clicked instance is selected.
 */
export const InstancePath = createContext("canvas");

/** Payload of the "strukto:request-delete" event. */
export interface DeleteRequest {
  cut?: boolean;
}

export function readPayload(e: React.DragEvent): DragPayload | null {
  const raw = e.dataTransfer.getData(MIME) || e.dataTransfer.getData("text/plain");
  try {
    return raw ? (JSON.parse(raw) as DragPayload) : null;
  } catch {
    return null;
  }
}

export function setPayload(e: React.DragEvent, payload: DragPayload) {
  const raw = JSON.stringify(payload);
  e.dataTransfer.setData(MIME, raw);
  e.dataTransfer.setData("text/plain", raw);
  e.dataTransfer.effectAllowed = "copyMove";
}

/* ------------------------------ insertion gap ----------------------------- */

function Gap({ funcId, keyId, index }: Ctx & { keyId: string; index: number }) {
  const [over, setOver] = useState(false);
  const [open, setOpen] = useState(false);
  const ops = useOps();
  const { t } = useI18n();

  const handleInsert = (kind: BlockKind) => {
    setOpen(false);
    if (kind === "call") {
      ops.insertFunctionBlock(funcId, keyId, index, nextFunctionName(ops.doc.functions));
    } else {
      ops.insert(funcId, keyId, index, makeNode(kind));
    }
  };

  return (
    <div
      className={cn(
        "group relative z-10 -my-1 flex h-2 items-center justify-center transition-[height]",
        (over || open) && "h-7",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const payload = readPayload(e);
        if (!payload) return;
        if (payload.type === "new") {
          if (payload.kind === "call")
            ops.insertFunctionBlock(funcId, keyId, index, nextFunctionName(ops.doc.functions));
          else ops.insert(funcId, keyId, index, makeNode(payload.kind));
        } else if (payload.type === "fnref") {
          if (payload.funcId === funcId) return;
          const call = makeNode("call", { funcId: payload.funcId });
          if (call.kind === "call") call.expanded = true;
          ops.insert(funcId, keyId, index, call);
        } else if (payload.type === "move") {
          if (payload.funcId === funcId) ops.move(funcId, payload.nodeId, keyId, index);
          else ops.moveTo(payload.funcId, payload.nodeId, funcId, keyId, index);
        } else if (payload.type === "copy") {
          ops.insert(funcId, keyId, index, reId(payload.node));
        }
      }}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded bg-primary opacity-0 transition-opacity",
          over && "opacity-100",
        )}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t.insertBlock}
            title={t.insertBlock}
            className={cn(
              "pointer-events-auto flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-primary group-hover:opacity-100 focus-visible:opacity-100",
              open && "opacity-100",
            )}
          >
            <Plus className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-auto p-1">
          <BlockPicker onPick={handleInsert} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function nextFunctionName(functions: Record<string, { name: string }>) {
  const n = Object.keys(functions).length;
  return `function${n}`;
}

export const MOD =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

const KIND_LABEL = {
  statement: "statement",
  if: "ifElse",
  while: "whileDo",
  dowhile: "doWhile",
  for: "forLoop",
  switch: "switchCase",
  call: "functionBlock",
  terminator: "terminator",
  comment: "comment",
} as const;

/** Short text of a block, for screen readers. */
function blockText(n: SNode, doc: StruktoDoc): string {
  if (n.kind === "call") return callLabel(doc, n, "?");
  if (n.kind === "terminator") return `${n.variant} ${n.text}`.trim();
  return ("text" in n ? n.text : "cond" in n ? n.cond : "expr" in n ? n.expr : "") || "…";
}

/* -------------------------------- sequence -------------------------------- */

export function Sequence({
  funcId,
  keyId,
  nodes,
  root,
}: Ctx & { keyId: string; nodes: SNode[]; root?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={cn("flex min-h-[2.25rem] flex-col", root && "min-h-[6rem]")}>
      <Gap funcId={funcId} keyId={keyId} index={0} />
      {nodes.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-2 py-2 text-center text-[11px] text-muted-foreground/70 italic">
          {t.emptyHint}
        </div>
      ) : null}
      {nodes.map((n, i) => (
        <div key={n.id} className="contents">
          <BlockView funcId={funcId} node={n} />
          <Gap funcId={funcId} keyId={keyId} index={i + 1} />
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- blocks --------------------------------- */

function CollapseButton({
  collapsed,
  onToggle,
}: {
  collapsed?: boolean | undefined;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? t.expand : t.collapse}
      aria-expanded={!collapsed}
      title={collapsed ? t.expand : t.collapse}
      className="text-muted-foreground hover:text-primary absolute top-0.5 right-0.5 z-10 rounded p-0.5"
    >
      {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
    </button>
  );
}

export function BlockView({ funcId, node }: Ctx & { node: SNode }) {
  const ops = useOps();
  const { t } = useI18n();
  const { selection, setSelection, setClipboard, clipboard, openFunction, closeFunctionById, doc } =
    useStrukto();
  const path = useContext(InstancePath);
  const rootRef = useRef<HTMLDivElement>(null);
  const [confirmFn, setConfirmFn] = useState(false);
  const [confirmChildren, setConfirmChildren] = useState(false);
  const [editing, setEditing] = useState(false);
  const selected =
    selection?.nodeId === node.id &&
    selection.funcId === funcId &&
    (selection.path === undefined || selection.path === path);
  const select = () => setSelection({ funcId, nodeId: node.id, path });
  const editLock = useMemo(() => ({ editing, setEditing }), [editing]);

  useEffect(() => {
    if (!selected) setEditing(false);
  }, [selected]);

  const collapsed = "collapsed" in node ? node.collapsed : false;
  const toggleCollapse = () =>
    ops.update(funcId, node.id, (n) => {
      if ("collapsed" in n) n.collapsed = !n.collapsed;
    });

  const requestDelete = (req: DeleteRequest = {}) => {
    // cutting keeps everything the copy needs, so no questions are asked
    if (req.cut) {
      if (node.kind === "call") ops.removeCallBlock(funcId, node.id, "keep");
      else ops.remove(funcId, node.id);
      return;
    }
    if (node.kind === "call") {
      const def = doc.functions[node.funcId];
      // Still called from elsewhere: only this block goes, the definition stays in use.
      if (!def || countCalls(doc, node.funcId) > 1) {
        ops.removeCallBlock(funcId, node.id, "keep");
        return;
      }
      if (countNodes(def) > 0) {
        setConfirmFn(true);
        return;
      }
      closeFunctionById(node.funcId);
      ops.removeCallBlock(funcId, node.id, "delete");
      return;
    }
    if (childBlocks(node).length > 0) {
      setConfirmChildren(true);
      return;
    }
    ops.remove(funcId, node.id);
  };

  useEffect(() => {
    if (!selected) return;
    const handler = (e: Event) => {
      // selection without a path (e.g. from search) matches every instance: only the first acts
      if (
        !selection?.path &&
        document.querySelector(`[data-block-id="${node.id}"]`) !== rootRef.current
      )
        return;
      requestDelete((e as CustomEvent<DeleteRequest>).detail ?? {});
    };
    window.addEventListener("strukto:request-delete", handler);
    return () => window.removeEventListener("strukto:request-delete", handler);
  });

  const copy = () => {
    setClipboard(node);
    void writeSystemClipboard(serializeClip(makeClip(doc, node)));
  };

  const pasteAfter = async () => {
    const clips = resolvePaste(await readSystemClipboard(), clipboard, doc);
    if (!clips.length) return;
    // paste right after this block, like Ctrl+V does for the selection
    const fn = doc.functions[funcId];
    const at = fn ? locate(fn, node.id) : null;
    ops.pasteClips(funcId, at?.key ?? ROOT_LIST, (at?.index ?? -1) + 1, clips);
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={rootRef}
            data-selected={selected || undefined}
            data-block-id={node.id}
            data-func-id={funcId}
            tabIndex={0}
            role="group"
            aria-roledescription={t.blockRole}
            aria-label={`${t[KIND_LABEL[node.kind]]}: ${blockText(node, doc)}`}
            aria-current={selected || undefined}
            onFocus={(e) => {
              if (e.target !== e.currentTarget) return;
              e.stopPropagation();
              select();
            }}
            onKeyDown={(e) => {
              // Enter on a focused block starts editing its first text field
              if (e.key !== "Enter" || e.target !== e.currentTarget || editing) return;
              e.preventDefault();
              e.stopPropagation();
              // switch to edit mode synchronously so keys typed right after Enter land in the field
              flushSync(() => setEditing(true));
              const field = rootRef.current?.querySelector<HTMLTextAreaElement>("textarea");
              field?.focus();
              field?.select();
            }}
            draggable={!editing}
            onDragStart={(e) => {
              e.stopPropagation();
              setPayload(e, { type: "move", funcId, nodeId: node.id });
            }}
            onClick={(e) => {
              e.stopPropagation();
              select();
            }}
            className={cn(
              "border-line bg-block relative -mt-px border text-foreground outline-none",
              "focus-visible:ring-primary/70 focus-visible:z-10 focus-visible:ring-2",
              selected && "ring-primary z-10 ring-2",
              !editing && "cursor-grab active:cursor-grabbing",
            )}
          >
            <EditLock.Provider value={editLock}>
              <Body
                funcId={funcId}
                node={node}
                collapsed={collapsed}
                toggleCollapse={toggleCollapse}
              />
            </EditLock.Provider>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          {node.kind === "call" ? (
            <>
              <ContextMenuItem onSelect={() => openFunction(node.funcId)}>
                <SquareFunction className="size-4" /> {t.openFunction}
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          ) : null}
          <ContextMenuItem onSelect={copy}>
            {t.copy}
            <ContextMenuShortcut>{MOD}C</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              copy();
              requestDelete({ cut: true });
            }}
          >
            {t.cut}
            <ContextMenuShortcut>{MOD}X</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void pasteAfter()}>
            {t.paste}
            <ContextMenuShortcut>{MOD}V</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => ops.duplicate(funcId, node.id)}>
            {t.duplicate}
            <ContextMenuShortcut>{MOD}D</ContextMenuShortcut>
          </ContextMenuItem>
          {"collapsed" in node ? (
            <ContextMenuItem onSelect={toggleCollapse}>
              {collapsed ? t.expand : t.collapse}
            </ContextMenuItem>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem className="text-destructive" onSelect={() => requestDelete()}>
            <Trash2 className="size-4" /> {t.delete}
            <ContextMenuShortcut>Del</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {node.kind === "call" ? (
        <AlertDialog open={confirmFn} onOpenChange={setConfirmFn}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>{t.deleteFunctionTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {t.deleteFunctionBody(doc.functions[node.funcId]?.name ?? "?")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
              <AlertDialogAction
                className="w-full"
                onClick={() => ops.removeCallBlock(funcId, node.id, "orphan")}
              >
                {t.keepDefinition}
              </AlertDialogAction>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full"
                onClick={() => {
                  closeFunctionById(node.funcId);
                  ops.removeCallBlock(funcId, node.id, "delete");
                }}
              >
                {t.deleteEverything}
              </AlertDialogAction>
              <AlertDialogCancel className="mt-0 w-full">{t.cancel}</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}

      <AlertDialog open={confirmChildren} onOpenChange={setConfirmChildren}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteBlockTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteBlockBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <AlertDialogAction
              className="w-full"
              onClick={() => ops.removeKeepChildren(funcId, node.id)}
            >
              {t.deleteKeepChildren}
            </AlertDialogAction>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full"
              onClick={() => ops.remove(funcId, node.id)}
            >
              {t.deleteWithChildren}
            </AlertDialogAction>
            <AlertDialogCancel className="mt-0 w-full">{t.cancel}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Summary({ text }: { text: string }) {
  return (
    <div className="truncate px-2 py-1 text-sm text-muted-foreground italic">{text || "…"}</div>
  );
}

function Body({
  funcId,
  node,
  collapsed,
  toggleCollapse,
}: Ctx & { node: SNode; collapsed?: boolean | undefined; toggleCollapse: () => void }) {
  const ops = useOps();
  const { t } = useI18n();

  switch (node.kind) {
    case "statement":
      return (
        <EditableText
          value={node.text}
          placeholder={t.statementText}
          invalid={!node.text.trim()}
          onCommit={(v) =>
            ops.update(funcId, node.id, (n) => n.kind === "statement" && (n.text = v))
          }
        />
      );

    case "comment":
      return (
        <div className="bg-note text-note-foreground border-l-4 border-current/40">
          <EditableText
            value={node.text}
            placeholder={t.comment}
            className="italic"
            onCommit={(v) =>
              ops.update(funcId, node.id, (n) => n.kind === "comment" && (n.text = v))
            }
          />
        </div>
      );

    case "terminator":
      return (
        <div className="bg-block-head flex items-center gap-2 px-2 py-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t.terminatorKind}
                className="border-line text-primary flex items-center gap-0.5 rounded border px-1.5 py-0.5 font-mono text-[11px] uppercase"
              >
                {node.variant}
                <ChevronDown className="size-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={node.variant}
                onValueChange={(v) =>
                  ops.update(funcId, node.id, (n) => {
                    if (n.kind === "terminator") n.variant = v as TerminatorVariant;
                  })
                }
              >
                {(["break", "continue", "return"] as const).map((v) => (
                  <DropdownMenuRadioItem key={v} value={v} className="font-mono uppercase">
                    {v}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <EditableText
            value={node.text}
            placeholder={node.variant === "return" ? t.returnValue : ""}
            mono
            onCommit={(v) =>
              ops.update(funcId, node.id, (n) => n.kind === "terminator" && (n.text = v))
            }
          />
        </div>
      );

    case "call":
      return <CallBody funcId={funcId} node={node} />;

    case "if":
      return (
        <IfBody funcId={funcId} node={node} collapsed={collapsed} toggleCollapse={toggleCollapse} />
      );

    case "while":
    case "for":
      return (
        <div className="relative">
          <CollapseButton collapsed={collapsed} onToggle={toggleCollapse} />
          <div className="bg-block-head border-line flex items-center gap-1 border-b pr-5">
            <span className="text-muted-foreground pl-2 font-mono text-[11px] tracking-wide uppercase">
              {node.kind === "for" ? "for" : t.whileLabel}
            </span>
            <EditableText
              value={node.cond}
              mono
              placeholder={t.condition}
              invalid={!node.cond.trim()}
              onCommit={(v) => ops.update(funcId, node.id, (n) => "cond" in n && (n.cond = v))}
            />
          </div>
          {collapsed ? (
            <Summary text="…" />
          ) : (
            <div className="flex">
              <div className="w-5 shrink-0" />
              <div className="border-line min-w-max flex-1 border-l">
                <Sequence funcId={funcId} keyId={listKey(node.id, "body")} nodes={node.body} />
              </div>
            </div>
          )}
        </div>
      );

    case "dowhile":
      return (
        <div className="relative">
          <CollapseButton collapsed={collapsed} onToggle={toggleCollapse} />
          <div className="bg-block-head border-line border-b px-2 py-0.5 pr-5 font-mono text-[11px] tracking-wide uppercase text-muted-foreground">
            {t.doLabel}
          </div>
          {collapsed ? (
            <Summary text="…" />
          ) : (
            <div className="flex">
              <div className="w-5 shrink-0" />
              <div className="border-line min-w-max flex-1 border-l">
                <Sequence funcId={funcId} keyId={listKey(node.id, "body")} nodes={node.body} />
              </div>
            </div>
          )}
          <div className="bg-block-head border-line flex items-center gap-1 border-t">
            <span className="text-muted-foreground pl-2 font-mono text-[11px] tracking-wide uppercase">
              {t.whileLabel}
            </span>
            <EditableText
              value={node.cond}
              mono
              placeholder={t.condition}
              invalid={!node.cond.trim()}
              onCommit={(v) => ops.update(funcId, node.id, (n) => "cond" in n && (n.cond = v))}
            />
          </div>
        </div>
      );

    case "switch":
      return (
        <SwitchBody
          funcId={funcId}
          node={node}
          collapsed={collapsed}
          toggleCollapse={toggleCollapse}
        />
      );
  }
}

/**
 * Measures the given elements (layout size, unaffected by the canvas zoom) and
 * re-measures whenever one of them resizes. Returns [w0, h0, w1, h1, …].
 */
function useSizes(refs: Array<React.RefObject<HTMLElement | null>>, deps: unknown[]): number[] {
  const [sizes, setSizes] = useState<number[]>([]);
  useLayoutEffect(() => {
    const measure = () => {
      const next = refs.flatMap((r) => [r.current?.offsetWidth ?? 0, r.current?.offsetHeight ?? 0]);
      setSizes((prev) =>
        prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next,
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    refs.forEach((r) => r.current && ro.observe(r.current));
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return sizes;
}

/**
 * Width a diagonal header needs so that its text fits without wrapping too much:
 * the text may use DIAG_TEXT_RATIO of the block, capped for very long conditions.
 */
const headerMinWidth = (naturalTextWidth: number | undefined) =>
  naturalTextWidth ? Math.min(naturalTextWidth, 420) / DIAG_TEXT_RATIO : undefined;

function IfBody({
  funcId,
  node,
  collapsed,
  toggleCollapse,
}: Ctx & {
  node: Extract<SNode, { kind: "if" }>;
  collapsed?: boolean | undefined;
  toggleCollapse: () => void;
}) {
  const ops = useOps();
  const { t } = useI18n();
  const gridRef = useRef<HTMLDivElement>(null);
  const thenRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const natRef = useRef<HTMLSpanElement>(null);
  const [W = 0, , thenW = 0, , textW = 0, textH = 0, natW] = useSizes(
    [gridRef, thenRef, textRef, natRef],
    [collapsed],
  );
  // the diagonals meet exactly on the line between the true and false branch
  const split = collapsed || !thenW ? W / 2 : thenW;
  const { height, left } = ifHeaderLayout(W, split, textW, textH, 64);

  return (
    <div
      ref={gridRef}
      className="grid grid-cols-[auto_auto]"
      style={{ minWidth: headerMinWidth(natW) }}
    >
      <div className="border-line relative col-span-2 border-b" style={{ height }}>
        <svg
          viewBox={`0 0 ${W || 1} ${height}`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <polyline
            points={`0,0 ${split},${height} ${W},0`}
            fill="none"
            stroke="var(--color-line)"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span className="text-muted-foreground absolute bottom-0.5 left-1.5 text-[11px]">
          {t.yes}
        </span>
        <span className="text-muted-foreground absolute right-1.5 bottom-0.5 text-[11px]">
          {t.no}
        </span>
        <CollapseButton collapsed={collapsed} onToggle={toggleCollapse} />
        {/* natural single-line width of the condition, used to size the block */}
        <span
          ref={natRef}
          aria-hidden
          className="invisible absolute top-0 left-0 px-2 font-mono text-[13px] whitespace-pre"
        >
          {node.cond || t.condition}
        </span>
        <div
          ref={textRef}
          className="absolute w-max"
          style={{ top: DIAG_PAD, left, maxWidth: W ? W * DIAG_TEXT_RATIO : undefined }}
        >
          <EditableText
            value={node.cond}
            center
            mono
            placeholder={t.condition}
            invalid={!node.cond.trim()}
            onCommit={(v) => ops.update(funcId, node.id, (n) => n.kind === "if" && (n.cond = v))}
          />
        </div>
      </div>
      {collapsed ? (
        <div className="col-span-2">
          <Summary text="…" />
        </div>
      ) : (
        <>
          <div ref={thenRef} className="border-line min-w-max border-r">
            <Sequence funcId={funcId} keyId={listKey(node.id, "then")} nodes={node.then} />
          </div>
          <div className="min-w-max">
            <Sequence funcId={funcId} keyId={listKey(node.id, "else")} nodes={node.else} />
          </div>
        </>
      )}
    </div>
  );
}

function SwitchBody({
  funcId,
  node,
  collapsed,
  toggleCollapse,
}: Ctx & {
  node: Extract<SNode, { kind: "switch" }>;
  collapsed?: boolean | undefined;
  toggleCollapse: () => void;
}) {
  const ops = useOps();
  const { t } = useI18n();
  const [confirmCase, setConfirmCase] = useState<SwitchCase | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const natRef = useRef<HTMLSpanElement>(null);
  const [W = 0, , textW = 0, textH = 0, natW] = useSizes([rootRef, textRef, natRef], [collapsed]);
  const { height, left } = switchHeaderLayout(W, textW, textH, 56);
  const columns: Array<{ c: SwitchCase; isDefault: boolean }> = [
    ...node.cases.map((c) => ({ c, isDefault: false })),
    { c: node.defaultCase, isDefault: true },
  ];

  const requestRemoveCase = (c: SwitchCase) => {
    if (c.body.length) setConfirmCase(c);
    else ops.removeCase(funcId, node.id, c.id);
  };

  return (
    <div ref={rootRef} className="relative" style={{ minWidth: headerMinWidth(natW) }}>
      <div className="border-line relative border-b" style={{ height }}>
        <svg
          viewBox={`0 0 ${W || 1} ${height}`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <line
            x1="0"
            y1="0"
            x2={W}
            y2={height}
            stroke="var(--color-line)"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <CollapseButton collapsed={collapsed} onToggle={toggleCollapse} />
        <span
          ref={natRef}
          aria-hidden
          className="invisible absolute top-0 left-0 px-2 font-mono text-[13px] whitespace-pre"
        >
          {node.expr || t.switchCase}
        </span>
        <div
          ref={textRef}
          className="absolute w-max"
          style={{ bottom: DIAG_PAD, left, maxWidth: W ? W * DIAG_TEXT_RATIO : undefined }}
        >
          <EditableText
            value={node.expr}
            mono
            placeholder={t.switchCase}
            invalid={!node.expr.trim()}
            onCommit={(v) =>
              ops.update(funcId, node.id, (n) => n.kind === "switch" && (n.expr = v))
            }
          />
        </div>
      </div>
      <AlertDialog open={!!confirmCase} onOpenChange={(v) => !v && setConfirmCase(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteCaseTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.deleteCaseBody(confirmCase?.label ?? "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmCase && ops.removeCase(funcId, node.id, confirmCase.id)}
            >
              {t.deleteCase}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {collapsed ? (
        <Summary text={node.cases.map((c) => c.label).join(" · ")} />
      ) : (
        <div className="flex items-stretch">
          {columns.map(({ c, isDefault }, i) => (
            <div key={c.id} className="group/col relative flex min-w-max flex-1 flex-col">
              {i > 0 ? <CaseGap funcId={funcId} switchId={node.id} index={i} /> : null}
              <div
                draggable={!isDefault}
                title={isDefault ? undefined : t.reorderCaseHint}
                onDragStart={(e) => {
                  if (isDefault) return;
                  e.stopPropagation();
                  setPayload(e, { type: "case", funcId, switchId: node.id, caseId: c.id });
                }}
                className={cn(
                  "bg-block-head border-line flex items-center gap-1 border-b",
                  i > 0 && "border-l",
                  !isDefault && "cursor-grab active:cursor-grabbing",
                )}
              >
                <EditableText
                  value={c.label}
                  center
                  mono
                  placeholder={isDefault ? t.defaultCase : t.caseLabel}
                  invalid={!c.label.trim()}
                  onCommit={(v) => ops.renameCase(funcId, node.id, c.id, v)}
                />
                {!isDefault ? (
                  <button
                    type="button"
                    aria-label={t.deleteCase}
                    onClick={() => requestRemoveCase(c)}
                    className="text-muted-foreground hover:text-destructive mr-1 opacity-0 transition-opacity group-hover/col:opacity-100 hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 className="size-3" />
                  </button>
                ) : null}
              </div>
              <div className={cn("min-w-[9rem] flex-1", i > 0 && "border-line border-l")}>
                <Sequence
                  funcId={funcId}
                  keyId={listKey(node.id, isDefault ? "default" : c.id)}
                  nodes={c.body}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Hover affordance in the gap between two case columns. */
function CaseGap({ funcId, switchId, index }: Ctx & { switchId: string; index: number }) {
  const ops = useOps();
  const { t } = useI18n();
  const [over, setOver] = useState(false);
  return (
    <div
      className={cn("group/gap absolute -left-2 top-0 bottom-0 z-20 w-4", over && "bg-primary/30")}
      onDragOver={(e) => {
        const types = e.dataTransfer.types;
        if (!types.includes(MIME)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const payload = readPayload(e);
        if (!payload || payload.type !== "case") return;
        if (payload.switchId !== switchId || payload.funcId !== funcId) return;
        e.preventDefault();
        e.stopPropagation();
        ops.moveCase(funcId, switchId, payload.caseId, index);
      }}
    >
      <button
        type="button"
        title={t.addCase}
        aria-label={t.addCase}
        onClick={() => ops.addCase(funcId, switchId, index)}
        className="border-border bg-card text-muted-foreground hover:text-primary absolute top-1 left-0 flex size-4 items-center justify-center rounded-full border opacity-0 shadow-sm transition-opacity group-hover/gap:opacity-100 focus-visible:opacity-100"
      >
        <Plus className="size-3" />
      </button>
    </div>
  );
}

/* ------------------------- inline function expansion ---------------------- */

function CallBody({ funcId, node }: Ctx & { node: Extract<SNode, { kind: "call" }> }) {
  const ops = useOps();
  const { t } = useI18n();
  const { doc, openFunction } = useStrukto();
  const chain = useContext(InlineChain);
  const path = useContext(InstancePath);
  const def = doc.functions[node.funcId];
  const recursive = chain.includes(node.funcId);
  const expanded = !!node.expanded && !!def && !recursive;
  const nextChain = useMemo(() => [...chain, node.funcId], [chain, node.funcId]);

  return (
    <div className="relative">
      <div
        className="relative flex items-stretch"
        onDoubleClick={(e) => {
          e.stopPropagation();
          openFunction(node.funcId);
        }}
      >
        <div className="border-line w-2 shrink-0 border-r" />
        {def && !recursive ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              ops.update(funcId, node.id, (n) => {
                if (n.kind === "call") n.expanded = !n.expanded;
              });
            }}
            aria-label={expanded ? t.collapse : t.expand}
            title={expanded ? t.collapse : t.expand}
            className="text-muted-foreground hover:text-primary z-10 shrink-0 self-start rounded p-0.5"
          >
            {expanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        ) : null}
        <div className="flex flex-1 items-center gap-1 px-2 py-1">
          <SquareFunction className="text-primary mr-1 size-4 shrink-0" />
          <div className="w-max">
            <EditableText
              value={def?.name ?? t.missingFunction}
              mono
              ariaLabel={t.functionName}
              onCommit={(v) => def && ops.renameFunction(def.id, v)}
            />
          </div>
          <span className="text-muted-foreground font-mono text-[13px]">(</span>
          <div className="w-max min-w-6">
            <EditableText
              value={node.args ?? ""}
              mono
              placeholder={def?.params ? def.params : ""}
              ariaLabel={t.args}
              onCommit={(v) =>
                ops.update(funcId, node.id, (n) => {
                  if (n.kind !== "call") return;
                  if (v.trim()) n.args = v.trim();
                  else delete n.args;
                })
              }
            />
          </div>
          <span className="text-muted-foreground font-mono text-[13px]">)</span>
        </div>
        <div className="border-line w-2 shrink-0 border-l" />
      </div>
      {expanded && def ? (
        <div className="border-line flex items-stretch border-t">
          <div className="border-line bg-muted/40 w-2 shrink-0 border-r" />
          <div className="min-w-max flex-1">
            <InlineChain.Provider value={nextChain}>
              <InstancePath.Provider value={`${path}/${node.id}`}>
                <Sequence funcId={def.id} keyId={ROOT_LIST} nodes={def.body} />
              </InstancePath.Provider>
            </InlineChain.Provider>
          </div>
        </div>
      ) : null}
    </div>
  );
}
