import { createContext, useContext, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Provided by a block: text fields are read-only until the block is put into edit mode. */
export const EditLock = createContext<{
  editing: boolean;
  setEditing: (v: boolean) => void;
} | null>(null);

export function EditableText({
  value,
  onCommit,
  placeholder,
  className,
  mono,
  center,
  invalid,
  ariaLabel,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  className?: string;
  mono?: boolean;
  center?: boolean;
  invalid?: boolean;
  /** Accessible name; defaults to the placeholder. */
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(value);
  const lock = useContext(EditLock);
  const editing = lock ? lock.editing : true;
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (!editing) ref.current?.blur();
  }, [editing]);

  const shared = cn(
    "px-2 py-1 text-sm leading-snug",
    mono && "font-mono text-[13px]",
    center && "text-center",
    className,
  );

  return (
    <div
      className="relative w-full"
      onDoubleClick={(e) => {
        if (!lock) return;
        e.stopPropagation();
        lock.setEditing(true);
        requestAnimationFrame(() => {
          ref.current?.focus();
          ref.current?.select();
        });
      }}
    >
      {/* invisible sizer: gives the field its natural width & height so nothing squishes */}
      <span
        aria-hidden
        className={cn(shared, "block max-w-[34rem] invisible whitespace-pre-wrap break-words")}
      >
        {draft || placeholder || " "}
      </span>
      <textarea
        ref={ref}
        rows={1}
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        aria-invalid={invalid || undefined}
        spellCheck={false}
        readOnly={!editing}
        tabIndex={editing ? 0 : -1}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft);
          lock?.setEditing(false);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
          if (e.key === "Escape") {
            setDraft(value);
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        className={cn(
          shared,
          "absolute inset-0 h-full w-full resize-none overflow-hidden bg-transparent outline-none",
          "placeholder:text-muted-foreground/60 focus:bg-accent/40 rounded-xs",
          !editing && "pointer-events-none cursor-default select-none",
          invalid && "placeholder:text-destructive/60",
        )}
      />
    </div>
  );
}
