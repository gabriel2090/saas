import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Versión de SheetJS aprobada (D-44). Cambiarla exige revisar la decisión.
 */
const VERSION_SHEETJS = '0.20.3';

/**
 * Dirección exacta del paquete en el CDN oficial de SheetJS.
 */
const URL_SHEETJS = `https://cdn.sheetjs.com/xlsx-${VERSION_SHEETJS}/xlsx-${VERSION_SHEETJS}.tgz`;

/**
 * Lee un archivo JSON de la raíz del proyecto.
 *
 * @param nombre - Nombre del archivo.
 * @returns Contenido interpretado.
 */
function leerJson(nombre: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), nombre), 'utf8'));
}

describe('dependencias fijadas', () => {
  it('SheetJS apunta a una versión exacta del CDN oficial en package.json (D-44)', () => {
    const paquete = leerJson('package.json') as { dependencies: Record<string, string> };
    expect(paquete.dependencies.xlsx).toBe(URL_SHEETJS);
  });

  it('el archivo de bloqueo fija la misma versión con su hash de integridad (D-44)', () => {
    const bloqueo = leerJson('package-lock.json') as {
      packages: Record<string, { version?: string; resolved?: string; integrity?: string }>;
    };
    const xlsx = bloqueo.packages['node_modules/xlsx'];
    expect(xlsx?.version).toBe(VERSION_SHEETJS);
    expect(xlsx?.resolved).toBe(URL_SHEETJS);
    expect(xlsx?.integrity).toMatch(/^sha512-/);
  });
});
