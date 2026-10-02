import { createHash } from 'node:crypto';
import { aIsoLocal } from '../shared/formato/fechas';
import type { BaseDeDatos } from './conexion';

/**
 * Una migración SQL versionada.
 */
export interface Migracion {
  /** Número de versión (1, 2, 3…), consecutivo y sin huecos. */
  version: number;
  /** Nombre descriptivo (parte del archivo después del número). */
  nombre: string;
  /** Sentencias SQL a ejecutar. */
  sql: string;
}

/**
 * Fila de la tabla `schema_migraciones`.
 */
interface FilaMigracionAplicada {
  /** Versión aplicada. */
  version: number;
  /** Checksum del SQL cuando se aplicó. */
  checksum: string;
}

/**
 * Calcula el SHA-256 del SQL de una migración. Normaliza los saltos de línea
 * para que el checksum no cambie si Git convierte LF ↔ CRLF.
 *
 * @param sql - Contenido de la migración.
 * @returns Hash hexadecimal.
 */
export function calcularChecksum(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

/**
 * Verifica que las versiones empiecen en 1 y sean consecutivas.
 *
 * @param migraciones - Migraciones ordenadas.
 * @throws {Error} Si hay huecos, duplicados o desorden.
 */
function validarSecuencia(migraciones: readonly Migracion[]): void {
  migraciones.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(
        `Las migraciones deben ser consecutivas desde 1: se esperaba la versión ${i + 1} y se encontró ${m.version}.`,
      );
    }
  });
}

/**
 * Aplica las migraciones pendientes, cada una en su propia transacción.
 *
 * Antes de aplicar, verifica que las migraciones ya aplicadas no hayan sido
 * modificadas (comparando su checksum) y que la base no tenga migraciones
 * más nuevas que las que conoce esta versión de la aplicación.
 *
 * @param db - Conexión abierta.
 * @param migraciones - Migraciones del proyecto, ordenadas por versión.
 * @param reloj - Fuente de la fecha de aplicación (inyectable en pruebas).
 * @returns Versiones aplicadas en esta llamada (vacío si no había pendientes).
 * @throws {Error} Si la secuencia es inválida, una migración aplicada cambió,
 * la base es más nueva que la aplicación o falla el SQL.
 *
 * @example
 * aplicarMigraciones(db, migracionesDelProyecto()); // [1] la primera vez, [] después
 */
export function aplicarMigraciones(
  db: BaseDeDatos,
  migraciones: readonly Migracion[],
  reloj: () => string = aIsoLocal,
): number[] {
  validarSecuencia(migraciones);
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migraciones (
      version     INTEGER PRIMARY KEY,
      nombre      TEXT NOT NULL,
      checksum    TEXT NOT NULL,
      aplicada_en TEXT NOT NULL
    ) STRICT;
  `);

  const aplicadas = db
    .prepare('SELECT version, checksum FROM schema_migraciones ORDER BY version')
    .all() as FilaMigracionAplicada[];

  for (const fila of aplicadas) {
    const migracion = migraciones.find((m) => m.version === fila.version);
    if (!migracion) {
      throw new Error(
        `La base de datos tiene la migración ${fila.version}, que esta versión de la aplicación no conoce. ` +
          'Instale la versión más reciente de la aplicación.',
      );
    }
    if (calcularChecksum(migracion.sql) !== fila.checksum) {
      throw new Error(
        `La migración ${fila.version} (${migracion.nombre}) fue modificada después de aplicarse. ` +
          'Los cambios de esquema deben ir en una migración nueva.',
      );
    }
  }

  const versionesAplicadas = new Set(aplicadas.map((f) => f.version));
  const pendientes = migraciones.filter((m) => !versionesAplicadas.has(m.version));
  const registrar = db.prepare(
    'INSERT INTO schema_migraciones (version, nombre, checksum, aplicada_en) VALUES (?, ?, ?, ?)',
  );

  for (const migracion of pendientes) {
    db.transaction(() => {
      db.exec(migracion.sql);
      registrar.run(migracion.version, migracion.nombre, calcularChecksum(migracion.sql), reloj());
    }).immediate();
  }
  return pendientes.map((m) => m.version);
}
