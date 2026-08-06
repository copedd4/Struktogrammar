import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { StruktoApp } from "@/components/strukto/StruktoApp";
import { I18nProvider } from "@/lib/strukto/i18n";
import { StruktoProvider } from "@/lib/strukto/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Struktogramm Editor – Nassi–Shneiderman Diagrams" },
      {
        name: "description",
        content:
          "Create, edit and export Nassi–Shneiderman structograms: loops, switch-case, nested functions, themes, undo/redo and .stkg projects.",
      },
      { property: "og:title", content: "Struktogramm Editor – Nassi–Shneiderman Diagrams" },
      {
        property: "og:description",
        content:
          "Interactive structogram editor with nested function diagrams, five themes, German/English UI and PNG/SVG/PDF export.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <>
      <h1 className="sr-only">Struktogramm Editor</h1>
      {/* ids are generated at runtime, so the editor mounts after hydration */}
      <ClientOnly fallback={<div className="bg-background h-screen" />}>
        <I18nProvider>
          <StruktoProvider>
            <StruktoApp />
          </StruktoProvider>
        </I18nProvider>
      </ClientOnly>
    </>
  );
}
