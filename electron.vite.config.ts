import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

/**
 * Configuración de compilación de electron-vite.
 *
 * Usa las rutas por defecto: `src/main/index.ts`, `src/preload/index.ts`
 * y `src/renderer/index.html`. Las dependencias de producción (como
 * `better-sqlite3`, que es nativa) quedan externas al bundle del proceso
 * principal para cargarse desde `node_modules`.
 */
export default defineConfig({
  main: {
    build: { externalizeDeps: true },
  },
  preload: {
    build: { externalizeDeps: true },
  },
  renderer: {
    plugins: [react()],
  },
});
