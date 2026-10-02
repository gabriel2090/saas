import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Configuración de Vitest con dos proyectos:
 * - `unitarias`: pruebas junto al código (`src/**\/*.test.ts(x)`), sin base de datos real.
 * - `integracion`: migraciones, repositorios y servicios contra SQLite en memoria.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unitarias',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integracion',
          include: ['tests/integracion/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
