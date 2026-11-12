import { X } from "lucide-react";
import { useI18n } from "@/lib/strukto/i18n";
import { useStrukto } from "@/lib/strukto/store";
import { DiagramSurface } from "./DiagramSurface";
import { InstancePath, setPayload } from "./Diagram";
import { FunctionName } from "./FunctionName";

/**
 * Non-modal floating windows: they must not trap focus or block pointer events,
 * otherwise dragging blocks from the sidebar into the function is impossible.
 */
export function FunctionModals() {
  const { openStack, dockedFunctions, closeFunctionById, doc } = useStrukto();
  const { t } = useI18n();

  // functions docked on the canvas are edited there, not in a floating window
  const windows = openStack.filter((id) => !dockedFunctions.includes(id));
  if (!windows.length) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
      {windows.map((id, i) => {
        const fn = doc.functions[id];
        if (!fn) return null;
        return (
          <div
            key={id}
            role="dialog"
            aria-label={fn.name}
            style={{ zIndex: 50 + i, transform: `translate(${i * 24}px, ${i * 24}px)` }}
            className="bg-canvas border-border pointer-events-auto absolute max-h-[85vh] w-[min(90vw,44rem)] overflow-auto rounded-lg border p-6 shadow-2xl"
          >
            <div
              className="flex flex-col space-y-1.5 pr-8 text-left"
              draggable
              onDragStart={(e) => setPayload(e, { type: "fnref", funcId: id })}
            >
              <h2 className="text-lg leading-none tracking-tight">
                <FunctionName funcId={id} name={fn.name} />
              </h2>
              <p className="text-muted-foreground text-sm">
                {i > 0 ? t.recursionNote : t.functionBlock}
              </p>
            </div>
            <button
              type="button"
              aria-label={t.closeFunction}
              title={t.closeFunction}
              onClick={() => closeFunctionById(id)}
              className="hover:bg-accent absolute top-4 right-4 rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100"
            >
              <X className="size-4" />
            </button>
            <div className="flex justify-center pt-4 pb-2">
              <InstancePath.Provider value={`window:${id}`}>
                <DiagramSurface funcId={id} width={620} />
              </InstancePath.Provider>
            </div>
          </div>
        );
      })}
    </div>
  );
}
