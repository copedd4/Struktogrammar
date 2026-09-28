import { forwardRef } from "react";
import { ROOT_LIST } from "@/lib/strukto/model";
import { useI18n } from "@/lib/strukto/i18n";
import { useOps } from "@/lib/strukto/ops";
import { useStrukto } from "@/lib/strukto/store";
import { Sequence } from "./Diagram";
import { EditableText } from "./Editable";
import { cn } from "@/lib/utils";

export const DiagramSurface = forwardRef<
  HTMLDivElement,
  { funcId: string; className?: string; width?: number }
>(function DiagramSurface({ funcId, className, width = 720 }, ref) {
  const { doc } = useStrukto();
  const ops = useOps();
  const { t } = useI18n();
  const fn = doc.functions[funcId];
  if (!fn) return null;
  return (
    <div
      ref={ref}
      style={{ minWidth: width, width: "max-content" }}
      className={cn("bg-block border-line shadow-sm", className)}
      onClick={(e) => e.stopPropagation()}
    >
      {/* signature: name(parameters): return type */}
      <div className="bg-block-head border-line text-foreground flex items-center border border-b-0 px-1 py-0.5 font-mono text-sm">
        <span className="pl-2 font-semibold">{fn.name}</span>
        <span className="text-muted-foreground">(</span>
        <div className="w-max min-w-8">
          <EditableText
            value={fn.params ?? ""}
            mono
            placeholder={t.params}
            ariaLabel={t.params}
            onCommit={(v) => ops.setSignature(fn.id, { params: v })}
          />
        </div>
        <span className="text-muted-foreground">):</span>
        <div className="w-max min-w-8">
          <EditableText
            value={fn.returns ?? ""}
            mono
            placeholder={t.returnType}
            ariaLabel={t.returnType}
            onCommit={(v) => ops.setSignature(fn.id, { returns: v })}
          />
        </div>
        {fn.orphaned ? (
          <span className="text-muted-foreground ml-auto pr-2 text-xs">({t.orphaned})</span>
        ) : null}
      </div>
      <div className="border-line border">
        <Sequence funcId={funcId} keyId={ROOT_LIST} nodes={fn.body} root />
      </div>
    </div>
  );
});
