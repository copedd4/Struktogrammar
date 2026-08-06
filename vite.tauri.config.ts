import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Swap the SSR root for the plain SPA root
      "./routes/__root": path.resolve(__dirname, "src/routes/__root.tauri"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});