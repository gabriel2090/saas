import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Configuración de Vitest con dos proyectos:
 * - `unitarias`: pruebas junto al código (`src/**\/*.test.ts(x)`), sin base de datos real.
 * - `integracion`: migraciones, repositorios y servicios contra SQLite en memoria.
 * - `rendimiento`: tiempos con el volumen grande de datos (se corre aparte,
 *   con `npm run test:rendimiento`; no entra en `test:todo`).
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
      {
        extends: true,
        test: {
          name: 'rendimiento',
          include: ['tests/rendimiento/**/*.test.ts'],
          environment: 'node',
          testTimeout: 15 * 60 * 1000,
          hookTimeout: 15 * 60 * 1000,
        },
      },
    ],
  },
});
