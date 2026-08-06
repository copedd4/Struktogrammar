import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { viteSingleFile } from "vite-plugin-singlefile";

// Standalone offline build used by Tauri.
// Produces a single self-contained desktop/dist/index.html (no server, no network).
export default defineConfig({
  root: "desktop",
  base: "./",
  plugins: [react(), tailwindcss(), tsconfigPaths({ root: "." }), viteSingleFile()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "esnext",
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
  server: { port: 1420, strictPort: true },
});