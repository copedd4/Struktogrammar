import { useEffect, useRef, useState } from "react";
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
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  return (
    <textarea
      ref={ref}
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
        "w-full resize-none overflow-hidden bg-transparent px-2 py-1 text-sm leading-snug outline-none",
        "placeholder:text-muted-foreground/60 focus:bg-accent/40 rounded-xs",
        mono && "font-mono text-[13px]",
        center && "text-center",
        invalid && "placeholder:text-destructive/60",
        className,
      )}
    />
  );
}
