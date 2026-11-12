import { forwardRef } from "react";
import { X } from "lucide-react";
import { ROOT_LIST } from "@/lib/strukto/model";
import { useI18n } from "@/lib/strukto/i18n";
import { useOps } from "@/lib/strukto/ops";
import { useStrukto } from "@/lib/strukto/store";
import { Sequence } from "./Diagram";
import { EditableText } from "./Editable";
import { FunctionName } from "./FunctionName";
import { cn } from "@/lib/utils";

export const DiagramSurface = forwardRef<
  HTMLDivElement,
  {
    funcId: string;
    className?: string;
    width?: number;
    /** Show the function name as an inline rename control. */
    editableName?: boolean;
    /** When given, a close button is shown in the header. */
    onClose?: () => void;
  }
>(function DiagramSurface({ funcId, className, width = 720, editableName, onClose }, ref) {
  const { doc } = useStrukto();
  const ops = useOps();
  const { t } = useI18n();
  const fn = doc.functions[funcId];
  if (!fn) return null;
  return (
    <div
      ref={ref}
      data-diagram-function={funcId}
      style={{ minWidth: width, width: "max-content" }}
      className={cn("bg-block border-line shadow-sm", className)}
      onClick={(e) => e.stopPropagation()}
    >
      {/* signature: name(parameters): return type */}
      <div className="bg-block-head border-line text-foreground flex items-center border border-b-0 px-1 py-0.5 font-mono text-sm">
        {editableName ? (
          <FunctionName funcId={fn.id} name={fn.name} className="pl-2" />
        ) : (
          <span className="pl-2 font-semibold">{fn.name}</span>
        )}
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
        {onClose ? (
          <button
            type="button"
            title={t.closeFunction}
            aria-label={t.closeFunction}
            onClick={onClose}
            className={cn(
              "hover:bg-accent shrink-0 rounded p-1 opacity-60 hover:opacity-100",
              !fn.orphaned && "ml-auto",
            )}
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      <div className="border-line border">
        <Sequence funcId={funcId} keyId={ROOT_LIST} nodes={fn.body} root />
      </div>
    </div>
  );
});
