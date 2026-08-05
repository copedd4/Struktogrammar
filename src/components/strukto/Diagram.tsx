import { createContext, useContext, useMemo, useState } from "react";
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
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EditableText } from "./Editable";
import { BlockPicker } from "./BlockPicker";
import { useI18n } from "@/lib/strukto/i18n";
import { useOps } from "@/lib/strukto/ops";
import { useStrukto } from "@/lib/strukto/store";
import { ROOT_LIST, countNodes, listKey, makeNode, reId } from "@/lib/strukto/model";
import type { BlockKind, SNode, SwitchCase } from "@/lib/strukto/types";
import { cn } from "@/lib/utils";

interface Ctx {
  funcId: string;
}

type DragPayload =
  | { type: "new"; kind: BlockKind }
  | { type: "move"; funcId: string; nodeId: string }
  | { type: "copy"; node: SNode };

const MIME = "application/x-strukto";

/* chain of inlined function ids, used to prevent infinite recursion */
const InlineChain = createContext<string[]>([]);

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
        } else if (payload.type === "move" && payload.funcId === funcId) {
          ops.move(funcId, payload.nodeId, keyId, index);
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
            aria-label="Insert block"
            className={cn(
              "pointer-events-auto flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-primary group-hover:opacity-100",
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

function CollapseButton({ collapsed, onToggle }: { collapsed?: boolean | undefined; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? "Expand" : "Collapse"}
      className="text-muted-foreground hover:text-primary absolute top-0.5 right-0.5 z-10 rounded p-0.5"
    >
      {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
    </button>
  );
}

export function BlockView({ funcId, node }: Ctx & { node: SNode }) {
  const ops = useOps();
  const { t } = useI18n();
  const { selection, setSelection, setClipboard, clipboard, openFunction, doc } = useStrukto();
  const [confirmFn, setConfirmFn] = useState(false);
  const selected = selection?.nodeId === node.id && selection.funcId === funcId;

  const collapsed = "collapsed" in node ? node.collapsed : false;
  const toggleCollapse = () =>
    ops.update(funcId, node.id, (n) => {
      if ("collapsed" in n) n.collapsed = !n.collapsed;
    });

  const requestDelete = () => {
    if (node.kind === "call") {
      const def = doc.functions[node.funcId];
      if (def && countNodes(def) > 0) {
        setConfirmFn(true);
        return;
      }
      if (def) ops.deleteFunctionDefinition(node.funcId);
    }
    ops.remove(funcId, node.id);
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            data-selected={selected || undefined}
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              setPayload(e, { type: "move", funcId, nodeId: node.id });
            }}
            onClick={(e) => {
              e.stopPropagation();
              setSelection({ funcId, nodeId: node.id });
            }}
            className={cn(
              "border-line bg-block relative -mt-px border text-foreground",
              selected && "ring-primary z-10 ring-2",
            )}
          >
            <Body
              funcId={funcId}
              node={node}
              collapsed={collapsed}
              toggleCollapse={toggleCollapse}
            />
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
          <ContextMenuItem onSelect={() => setClipboard(node)}>{t.copy}</ContextMenuItem>
          <ContextMenuItem
            disabled={!clipboard}
            onSelect={() => clipboard && ops.insert(funcId, ROOT_LIST, 0, reId(clipboard))}
          >
            {t.paste}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => ops.duplicate(funcId, node.id)}>
            {t.duplicate}
          </ContextMenuItem>
          {"collapsed" in node ? (
            <ContextMenuItem onSelect={toggleCollapse}>
              {collapsed ? t.expand : t.collapse}
            </ContextMenuItem>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem className="text-destructive" onSelect={requestDelete}>
            <Trash2 className="size-4" /> {t.delete}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {node.kind === "call" ? (
        <AlertDialog open={confirmFn} onOpenChange={setConfirmFn}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t.deleteFunctionTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {t.deleteFunctionBody(doc.functions[node.funcId]?.name ?? "?")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  ops.setOrphaned(node.funcId, true);
                  ops.remove(funcId, node.id);
                }}
              >
                {t.keepDefinition}
              </AlertDialogAction>
              <AlertDialogAction
                onClick={() => {
                  ops.deleteFunctionDefinition(node.funcId);
                  ops.remove(funcId, node.id);
                }}
              >
                {t.deleteEverything}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
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
  const { doc, openFunction } = useStrukto();

  switch (node.kind) {
    case "statement":
      return (
        <EditableText
          value={node.text}
          placeholder={t.statementText}
          invalid={!node.text.trim()}
          onCommit={(v) => ops.update(funcId, node.id, (n) => n.kind === "statement" && (n.text = v))}
        />
      );

    case "comment":
      return (
        <div className="bg-note text-note-foreground border-l-4 border-current/40">
          <EditableText
            value={node.text}
            placeholder={t.comment}
            className="italic"
            onCommit={(v) => ops.update(funcId, node.id, (n) => n.kind === "comment" && (n.text = v))}
          />
        </div>
      );

    case "terminator":
      return (
        <div className="bg-block-head flex items-center gap-2 px-2 py-1">
          <button
            type="button"
            onClick={() =>
              ops.update(funcId, node.id, (n) => {
                if (n.kind !== "terminator") return;
                n.variant =
                  n.variant === "break" ? "return" : n.variant === "return" ? "continue" : "break";
              })
            }
            className="border-line text-primary rounded border px-1.5 py-0.5 font-mono text-[11px] uppercase"
          >
            {node.variant}
          </button>
          <EditableText
            value={node.text}
            placeholder={node.variant === "return" ? "value" : ""}
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
        <div className="relative">
          <CollapseButton collapsed={collapsed} onToggle={toggleCollapse} />
          <div className="border-line relative h-16 border-b">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
            >
              <line x1="0" y1="0" x2="50" y2="100" stroke="var(--color-line)" vectorEffect="non-scaling-stroke" />
              <line x1="100" y1="0" x2="50" y2="100" stroke="var(--color-line)" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="relative mx-auto w-2/3 pt-0.5">
              <EditableText
                value={node.cond}
                center
                mono
                placeholder={t.condition}
                invalid={!node.cond.trim()}
                onCommit={(v) => ops.update(funcId, node.id, (n) => n.kind === "if" && (n.cond = v))}
              />
            </div>
            <span className="text-muted-foreground absolute bottom-0.5 left-1.5 text-[11px]">
              {t.yes}
            </span>
            <span className="text-muted-foreground absolute right-1.5 bottom-0.5 text-[11px]">
              {t.no}
            </span>
          </div>
          {collapsed ? (
            <Summary text="…" />
          ) : (
            <div className="flex items-stretch">
              <div className="border-line min-w-max flex-1 border-r">
                <Sequence funcId={funcId} keyId={listKey(node.id, "then")} nodes={node.then} />
              </div>
              <div className="min-w-max flex-1">
                <Sequence funcId={funcId} keyId={listKey(node.id, "else")} nodes={node.else} />
              </div>
            </div>
          )}
        </div>
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
      return <SwitchBody funcId={funcId} node={node} collapsed={collapsed} toggleCollapse={toggleCollapse} />;
  }
}

function SwitchBody({
  funcId,
  node,
  collapsed,
  toggleCollapse,
}: Ctx & { node: Extract<SNode, { kind: "switch" }>; collapsed?: boolean | undefined; toggleCollapse: () => void }) {
  const ops = useOps();
  const { t } = useI18n();
  const columns: Array<{ c: SwitchCase; isDefault: boolean }> = [
    ...node.cases.map((c) => ({ c, isDefault: false })),
    { c: node.defaultCase, isDefault: true },
  ];

  return (
    <div className="relative">
      <CollapseButton collapsed={collapsed} onToggle={toggleCollapse} />
      <div className="border-line relative h-12 border-b">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          <line x1="0" y1="0" x2="100" y2="100" stroke="var(--color-line)" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="relative w-1/2 pr-6">
          <EditableText
            value={node.expr}
            mono
            placeholder={t.switchCase}
            invalid={!node.expr.trim()}
            onCommit={(v) => ops.update(funcId, node.id, (n) => n.kind === "switch" && (n.expr = v))}
          />
        </div>
      </div>
      {collapsed ? (
        <Summary text={node.cases.map((c) => c.label).join(" · ")} />
      ) : (
        <div className="flex items-stretch">
          {columns.map(({ c, isDefault }, i) => (
            <div key={c.id} className="group/col relative flex min-w-max flex-1 flex-col">
              {i > 0 ? <CaseGap funcId={funcId} switchId={node.id} index={i} /> : null}
              <div
                className={cn(
                  "bg-block-head border-line flex items-center gap-1 border-b",
                  i > 0 && "border-l",
                )}
              >
                <EditableText
                  value={c.label}
                  center
                  mono
                  placeholder={isDefault ? t.defaultCase : "case"}
                  invalid={!c.label.trim()}
                  onCommit={(v) => ops.renameCase(funcId, node.id, c.id, v)}
                />
                {!isDefault ? (
                  <button
                    type="button"
                    aria-label={t.deleteCase}
                    onClick={() => ops.removeCase(funcId, node.id, c.id)}
                    className="text-muted-foreground hover:text-destructive mr-1 opacity-0 transition-opacity group-hover/col:opacity-100 hover:opacity-100"
                  >
                    <Trash2 className="size-3" />
                  </button>
                ) : null}
              </div>
              <div className={cn("min-w-[9rem] flex-1", i > 0 && "border-line border-l")}>
                <Sequence funcId={funcId} keyId={listKey(node.id, isDefault ? "default" : c.id)} nodes={c.body} />
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
  return (
    <div className="group/gap absolute -left-2 top-0 bottom-0 z-20 w-4">
      <button
        type="button"
        title={t.addCase}
        aria-label={t.addCase}
        onClick={() => ops.addCase(funcId, switchId, index)}
        className="border-border bg-card text-muted-foreground hover:text-primary absolute top-1 left-0 flex size-4 items-center justify-center rounded-full border opacity-0 shadow-sm transition-opacity group-hover/gap:opacity-100"
      >
        <Plus className="size-3" />
      </button>
    </div>
  );
}
