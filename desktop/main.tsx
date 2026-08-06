import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../src/styles.css";
import { StruktoApp } from "@/components/strukto/StruktoApp";
import { I18nProvider } from "@/lib/strukto/i18n";
import { StruktoProvider } from "@/lib/strukto/store";
import { Toaster } from "@/components/ui/sonner";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <StruktoProvider>
        <h1 className="sr-only">Struktogramm Editor</h1>
        <StruktoApp />
        <Toaster />
      </StruktoProvider>
    </I18nProvider>
  </StrictMode>,
);