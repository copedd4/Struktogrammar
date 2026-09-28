import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { useI18n } from "@/lib/strukto/i18n";
import type { BlockKind } from "@/lib/strukto/types";
import { PICKER_ITEMS } from "./BlockPicker";

export interface PaletteCommand {
  id: string;
  group: "file" | "view";
  label: string;
  shortcut?: string;
  run: () => void;
}

/** Ctrl/⌘ + K: insert any block or run a command without the mouse. */
export function CommandPalette({
  open,
  onOpenChange,
  onInsert,
  commands,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onInsert: (kind: BlockKind) => void;
  commands: PaletteCommand[];
}) {
  const { t } = useI18n();
  const run = (fn: () => void) => {
    onOpenChange(false);
    // let the dialog close (and give focus back) before the command runs
    requestAnimationFrame(fn);
  };
  const group = (g: PaletteCommand["group"]) =>
    commands
      .filter((c) => c.group === g)
      .map((c) => (
        <CommandItem key={c.id} value={`${c.id} ${c.label}`} onSelect={() => run(c.run)}>
          {c.label}
          {c.shortcut ? <CommandShortcut>{c.shortcut}</CommandShortcut> : null}
        </CommandItem>
      ));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t.commandPlaceholder} />
      <CommandList>
        <CommandEmpty>{t.noCommands}</CommandEmpty>
        <CommandGroup heading={t.commandInsert}>
          {PICKER_ITEMS.map((item) => (
            <CommandItem
              key={item.kind}
              value={`insert ${item.kind} ${t[item.labelKey]}`}
              onSelect={() => run(() => onInsert(item.kind))}
            >
              <item.icon className="text-primary size-4" />
              {t[item.labelKey]}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading={t.commandFile}>{group("file")}</CommandGroup>
        <CommandGroup heading={t.commandView}>{group("view")}</CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
