import { useState } from "react";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/strukto/i18n";
import { useOps } from "@/lib/strukto/ops";
import { cn } from "@/lib/utils";

/**
 * A function's name with inline renaming (double-click or the pencil button).
 * Renames go through `ops.renameFunction`, so they stay unique and undoable.
 */
export function FunctionName({
  funcId,
  name,
  className,
}: {
  funcId: string;
  name: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const { t } = useI18n();
  const ops = useOps();
  const start = () => {
    setDraft(name);
    setEditing(true);
  };

  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      {editing ? (
        <Input
          autoFocus
          aria-label={t.functionName}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const value = draft.trim();
            if (value && value !== name) ops.renameFunction(funcId, value);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditing(false);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="h-7 w-40 min-w-0 font-mono text-sm"
        />
      ) : (
        <span
          onDoubleClick={start}
          title={name}
          className="min-w-0 truncate font-mono font-semibold"
        >
          {name}
        </span>
      )}
      <button
        type="button"
        title={t.renameFunction}
        aria-label={t.renameFunction}
        onClick={start}
        className="hover:bg-accent shrink-0 rounded p-1 opacity-60 hover:opacity-100"
      >
        <Pencil className="size-3.5" />
      </button>
    </div>
  );
}
