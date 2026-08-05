import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function EditableText({
  value,
  onCommit,
  placeholder,
  className,
  mono,
  center,
  invalid,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  className?: string;
  mono?: boolean;
  center?: boolean;
  invalid?: boolean;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  const shared = cn(
    "px-2 py-1 text-sm leading-snug",
    mono && "font-mono text-[13px]",
    center && "text-center",
    className,
  );

  return (
    <div className="relative w-full">
      {/* invisible sizer: gives the field its natural width & height so nothing squishes */}
      <span
        aria-hidden
        className={cn(shared, "block max-w-[34rem] invisible whitespace-pre-wrap break-words")}
      >
        {draft || placeholder || " "}
      </span>
      <textarea
        rows={1}
        value={draft}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onCommit(draft)}
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
          invalid && "placeholder:text-destructive/60",
        )}
      />
    </div>
  );
}
