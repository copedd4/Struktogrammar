import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/lib/strukto/i18n";
import { useStrukto } from "@/lib/strukto/store";
import { DiagramSurface } from "./DiagramSurface";

export function FunctionModals() {
  const { openStack, closeTopFunction, doc } = useStrukto();
  const { t } = useI18n();

  return (
    <>
      {openStack.map((id, i) => {
        const fn = doc.functions[id];
        const isTop = i === openStack.length - 1;
        void isTop;
        if (!fn) return null;
        return (
          <Dialog
            key={id}
            open
            onOpenChange={(open) => {
              if (!open && isTop) closeTopFunction();
            }}
          >
            <DialogContent
              className="bg-canvas max-h-[85vh] w-[min(90vw,44rem)] max-w-none overflow-auto"
            >
              <DialogHeader>
                <DialogTitle className="font-mono">{fn.name}</DialogTitle>
                <DialogDescription>{i > 0 ? t.recursionNote : t.functionBlock}</DialogDescription>
              </DialogHeader>
              <div className="flex justify-center pb-2">
                <DiagramSurface funcId={id} width={620} />
              </div>
            </DialogContent>
          </Dialog>
        );
      })}
    </>
  );
}
