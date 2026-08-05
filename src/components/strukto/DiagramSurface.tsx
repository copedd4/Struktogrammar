import { forwardRef } from "react";
import { ROOT_LIST } from "@/lib/strukto/model";
import { useStrukto } from "@/lib/strukto/store";
import { Sequence } from "./Diagram";
import { cn } from "@/lib/utils";

export const DiagramSurface = forwardRef<
  HTMLDivElement,
  { funcId: string; className?: string; width?: number }
>(function DiagramSurface({ funcId, className, width = 720 }, ref) {
  const { doc } = useStrukto();
  const fn = doc.functions[funcId];
  if (!fn) return null;
  return (
    <div
      ref={ref}
      style={{ minWidth: width, width: "max-content" }}
      className={cn("bg-block border-line shadow-sm", className)}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-block-head border-line text-foreground border border-b-0 px-3 py-1.5 font-mono text-sm font-semibold">
        {fn.name}
        {fn.orphaned ? <span className="text-muted-foreground ml-2 text-xs">(orphaned)</span> : null}
      </div>
      <div className="border-line border">
        <Sequence funcId={funcId} keyId={ROOT_LIST} nodes={fn.body} root />
      </div>
    </div>
  );
});
