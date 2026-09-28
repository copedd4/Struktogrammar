import {
  ArrowRightFromLine,
  Braces,
  MessageSquare,
  Repeat,
  Repeat1,
  RotateCw,
  Split,
  SquareFunction,
  Type,
} from "lucide-react";
import type { BlockKind } from "@/lib/strukto/types";
import { useI18n } from "@/lib/strukto/i18n";
import { cn } from "@/lib/utils";

export interface PickerItem {
  kind: BlockKind;
  icon: typeof Type;
  labelKey:
    | "statement"
    | "ifElse"
    | "whileDo"
    | "doWhile"
    | "forLoop"
    | "switchCase"
    | "functionBlock"
    | "terminator"
    | "comment";
  shortcut?: string;
}

/** Blocks are inserted with Alt + the item's letter. */
export const ALT =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌥" : "Alt+";

export const PICKER_ITEMS: PickerItem[] = [
  { kind: "statement", icon: Type, labelKey: "statement", shortcut: "S" },
  { kind: "if", icon: Split, labelKey: "ifElse", shortcut: "I" },
  { kind: "while", icon: Repeat, labelKey: "whileDo", shortcut: "W" },
  { kind: "dowhile", icon: Repeat1, labelKey: "doWhile", shortcut: "D" },
  { kind: "for", icon: RotateCw, labelKey: "forLoop", shortcut: "F" },
  { kind: "switch", icon: Braces, labelKey: "switchCase", shortcut: "C" },
  { kind: "call", icon: SquareFunction, labelKey: "functionBlock", shortcut: "M" },
  { kind: "terminator", icon: ArrowRightFromLine, labelKey: "terminator", shortcut: "B" },
  { kind: "comment", icon: MessageSquare, labelKey: "comment", shortcut: "K" },
];

export function BlockPicker({
  onPick,
  className,
}: {
  onPick: (kind: BlockKind) => void;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={cn("grid w-56 gap-0.5", className)}>
      {PICKER_ITEMS.map((item) => (
        <button
          key={item.kind}
          type="button"
          onClick={() => onPick(item.kind)}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
        >
          <item.icon className="size-4 shrink-0 text-primary" />
          <span className="flex-1 truncate">{t[item.labelKey]}</span>
          {item.shortcut ? (
            <kbd className="rounded border border-border px-1 text-[10px] text-muted-foreground">
              {ALT}
              {item.shortcut}
            </kbd>
          ) : null}
        </button>
      ))}
    </div>
  );
}
