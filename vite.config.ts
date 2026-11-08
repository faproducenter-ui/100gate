import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"
import gameBuildOutput from "./scripts/build-output"

// https://vite.dev/config/
export default defineConfig(({mode})=>({
  base: './',
  // The production story mode uses the same public backup endpoint as the
  // deployed game. Do not copy any other env variables into the bundle.
  define: mode==='story-production' ? {
    'import.meta.env.VITE_SAVE_API':JSON.stringify(process.env.VITE_SAVE_API??
      loadEnv('production',process.cwd(),'VITE_SAVE_API').VITE_SAVE_API??''),
  }:undefined,
  plugins: [react(), gameBuildOutput()],
  server: {
    port: 3000,
    // Blender and evidence writers lock large binary files on Windows. These
    // are not source modules: watching them caused an EBUSY dev-server crash.
    // They remain available via HTTP; refresh asset review pages after export.
    watch: { ignored: ['**/*.blend', '**/*.blend[0-9]*', '**/*.glb', '**/outputs/**', '**/art/**'] },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
