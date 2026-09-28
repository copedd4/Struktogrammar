import { useMemo, useState } from "react";
import { Check, Code2, Copy, Download, FileInput } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CODE_LANGS, generateCode, type CodeLang } from "@/lib/strukto/codegen";
import { importCode } from "@/lib/strukto/codeimport";
import { useI18n } from "@/lib/strukto/i18n";
import { useStrukto } from "@/lib/strukto/store";
import { useOps } from "@/lib/strukto/ops";
import { cn } from "@/lib/utils";

export function CodePanel({
  open,
  onOpenChange,
  activeFuncId,
  target = "document",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  activeFuncId: string;
  /** "document" replaces the whole diagram, "functions" adds the parsed code as new functions. */
  target?: "document" | "functions";
}) {
  const { t } = useI18n();
  const store = useStrukto();
  const ops = useOps();
  const { doc } = store;
  const [lang, setLang] = useState<CodeLang>("python");
  const [onlyCurrent, setOnlyCurrent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [source, setSource] = useState("");

  const code = useMemo(() => {
    try {
      return generateCode(doc, lang, {
        ...(onlyCurrent ? { onlyFuncId: activeFuncId } : {}),
        className: doc.name,
      });
    } catch {
      return "";
    }
  }, [doc, lang, onlyCurrent, activeFuncId]);

  const ext = CODE_LANGS.find((l) => l.id === lang)?.ext ?? "txt";

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success(t.codeCopied);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(doc.name || "struktogramm").replace(/\W+/g, "_")}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const runImport = () => {
    try {
      const { doc: next, warnings } = importCode(source, doc.name || "Imported");
      if (warnings.length) toast.warning(t.codeImportMissing(warnings), { duration: 8000 });
      if (target === "functions") {
        ops.importFunctions(next, (id) => {
          if (id) store.openFunction(id);
        });
        onOpenChange(false);
        setSource("");
        toast.success(t.codeImportedFunctions);
      } else {
        // same file, so the import stays undoable and counts as an unsaved change
        store.replaceDoc(next, { keepHistory: true, dirty: true });
        onOpenChange(false);
        toast.success(t.codeImported);
      }
    } catch {
      toast.error(t.codeImportFailed);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code2 className="size-4" />
            {t.code}
          </DialogTitle>
          <DialogDescription>
            {target === "functions" ? t.codeImportFunctionHint : t.codeHint}
          </DialogDescription>
        </DialogHeader>

        <Tabs {...(target === "functions" ? { value: "import" } : {})} defaultValue="generate">
          <TabsList className={cn(target === "functions" && "hidden")}>
            <TabsTrigger value="generate">{t.codeGenerate}</TabsTrigger>
            <TabsTrigger value="import">{t.codeImport}</TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {CODE_LANGS.map((l) => (
                <Button
                  key={l.id}
                  size="sm"
                  variant={lang === l.id ? "default" : "outline"}
                  onClick={() => setLang(l.id)}
                >
                  {l.label}
                </Button>
              ))}
              <div className="flex-1" />
              <Button
                size="sm"
                variant={onlyCurrent ? "secondary" : "ghost"}
                onClick={() => setOnlyCurrent((v) => !v)}
              >
                {onlyCurrent ? t.codeScopeCurrent : t.codeScopeAll}
              </Button>
            </div>

            <pre
              className={cn(
                "bg-muted max-h-[45vh] overflow-auto rounded-md p-3 font-mono text-xs leading-relaxed",
              )}
            >
              <code>{code}</code>
            </pre>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={download}>
                <Download className="size-4" />
                {`.${ext}`}
              </Button>
              <Button size="sm" onClick={copy}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {t.copyAsCode}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="import" className="space-y-3">
            <p className="text-muted-foreground text-xs">
              {target === "functions" ? t.codeImportFunctionHint : t.codeImportHint}
            </p>
            <Textarea
              value={source}
              onChange={(e) => setSource(e.target.value)}
              spellCheck={false}
              placeholder={t.codeImportPlaceholder}
              className="h-[40vh] font-mono text-xs"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setSource("")}>
                {t.cancel}
              </Button>
              <Button size="sm" disabled={!source.trim()} onClick={runImport}>
                <FileInput className="size-4" />
                {target === "functions" ? t.importAsFunction : t.codeImportAction}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
