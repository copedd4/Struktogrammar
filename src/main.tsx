import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// fonts are bundled so the app looks the same offline
import "@fontsource/inter/400.css";
import "@fontsource/inter/400-italic.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "./styles.css";
import { StruktoApp } from "@/components/strukto/StruktoApp";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider } from "@/lib/strukto/i18n";
import { StruktoProvider } from "@/lib/strukto/store";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <StruktoProvider>
        <h1 className="sr-only">Struktogrammer</h1>
        <StruktoApp />
        <Toaster />
      </StruktoProvider>
    </I18nProvider>
  </StrictMode>,
);
