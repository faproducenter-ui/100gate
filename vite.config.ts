import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import gameBuildOutput from "./scripts/build-output"

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), gameBuildOutput()],
  server: {
    port: 3000,
    // Blender and evidence writers lock large binary files on Windows. These
    // are not source modules: watching them caused an EBUSY dev-server crash.
    // They remain available via HTTP; refresh asset review pages after export.
    watch: { ignored: ['**/*.blend', '**/*.blend[0-9]*', '**/outputs/**', '**/art/**'] },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
