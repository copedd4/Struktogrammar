import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Frontend of the Tauri app. `npm run tauri dev` starts this dev server,
// `npm run tauri build` bundles it into dist/ and embeds it in the app.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Tauri expects a fixed port and shows Rust errors in the terminal
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Cargo builds inside src-tauri/target; watching it makes Vite crash on
      // Windows (EBUSY on locked build-script .exe files) and is useless anyway
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // the app runs in the system webview (WebView2 / WKWebView / WebKitGTK)
    target: "es2021",
    chunkSizeWarningLimit: 2000,
  },
});
