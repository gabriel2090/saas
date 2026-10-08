import { statSync } from 'node:fs';
import Database from 'better-sqlite3';
import { calcularChecksum, type Migracion } from '../../data/migrador';

/**
 * Por qué una copia no se puede restaurar.
 */
export type MotivoCopiaInvalida = 'vacia' | 'corrupta' | 'no_es_esta_app' | 'esquema_mas_nuevo';

/**
 * Resultado de revisar una copia antes de restaurarla.
 */
export interface ValidacionCopia {
  /** `true` si se puede restaurar. */
  ok: boolean;
  /** Motivo del rechazo, o `null` si sirve. */
  motivo: MotivoCopiaInvalida | null;
  /** Mensaje en español para el usuario. */
  mensaje: string;
  /**
   * Detalle técnico del chequeo (sin datos del negocio), para el log y
   * «Copiar datos para soporte».
   */
  detalleTecnico: string;
  /** Versión de esquema de la copia, o `null` si no se pudo leer. */
  version: number | null;
}

/**
 * Nombre de la migración 1: identifica una base de esta aplicación.
 */
const NOMBRE_MIGRACION_BASE = 'base';

/**
 * Arma un rechazo.
 *
 * @param motivo - Por qué no sirve.
 * @param mensaje - Texto para el usuario.
 * @param detalleTecnico - Detalle para soporte.
 * @returns Validación fallida.
 */
function rechazo(
  motivo: MotivoCopiaInvalida,
  mensaje: string,
  detalleTecnico: string,
): ValidacionCopia {
  return { ok: false, motivo, mensaje, detalleTecnico, version: null };
}

/**
 * Indica si la base tiene una tabla.
 *
 * @param db - Conexión abierta.
 * @param nombre - Nombre de la tabla.
 * @returns `true` si existe.
 */
function existeTabla(db: Database.Database, nombre: string): boolean {
  const fila = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(nombre) as { ok: number } | undefined;
  return fila !== undefined;
}

/**
 * Revisa que una copia esté íntegra, sea de esta aplicación y no tenga un
 * esquema más nuevo que el que conoce esta instalación (D-173).
 *
 * Abre el archivo en solo lectura y lo cierra siempre: no cambia el modo WAL
 * ni escribe al lado de la copia.
 *
 * @param ruta - Archivo `.db` a revisar.
 * @param migraciones - Migraciones que conoce esta versión.
 * @returns Si se puede restaurar y, si no, el motivo.
 *
 * @example
 * validarCopia('C:/copias/respaldo.db', migracionesDelProyecto());
 */
export function validarCopia(ruta: string, migraciones: readonly Migracion[]): ValidacionCopia {
  let peso = 0;
  try {
    peso = statSync(ruta).size;
  } catch (error) {
    return rechazo(
      'corrupta',
      'No se encontró el archivo de la copia.',
      error instanceof Error ? error.message : String(error),
    );
  }
  if (peso === 0) {
    return rechazo('vacia', 'El archivo está vacío.', 'tamaño 0');
  }

  let db: Database.Database;
  try {
    db = new Database(ruta, { readonly: true, fileMustExist: true });
  } catch (error) {
    return rechazo(
      'corrupta',
      'La copia está dañada y no se puede usar.',
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    const filas = db.pragma('integrity_check') as { integrity_check: string }[];
    const detalle = filas.map((f) => f.integrity_check);
    if (!(detalle.length === 1 && detalle[0] === 'ok')) {
      return rechazo('corrupta', 'La copia está dañada y no se puede usar.', detalle.join('\n'));
    }
    if (!existeTabla(db, 'schema_migraciones')) {
      return rechazo(
        'no_es_esta_app',
        'El archivo no es una base de Inventario y Facturación.',
        'sin tabla schema_migraciones',
      );
    }
    const marca = db.prepare('SELECT nombre FROM schema_migraciones WHERE version = 1').get() as
      { nombre: string } | undefined;
    if (marca?.nombre !== NOMBRE_MIGRACION_BASE) {
      return rechazo(
        'no_es_esta_app',
        'El archivo no es una base de Inventario y Facturación.',
        `migración 1: ${marca?.nombre ?? 'no existe'}`,
      );
    }
    const maximo = db.prepare('SELECT MAX(version) AS version FROM schema_migraciones').get() as {
      version: number | null;
    };
    const version = maximo.version ?? 0;
    const conocida = migraciones.at(-1)?.version ?? 0;
    if (version > conocida) {
      return {
        ok: false,
        motivo: 'esquema_mas_nuevo',
        mensaje:
          'La copia es de una versión más nueva del programa. Instale la versión más reciente antes de restaurarla.',
        detalleTecnico: `versión ${version}; esta instalación conoce hasta ${conocida}`,
        version,
      };
    }
    const aplicadas = db.prepare('SELECT version, checksum FROM schema_migraciones').all() as {
      version: number;
      checksum: string;
    }[];
    for (const fila of aplicadas) {
      const migracion = migraciones.find((m) => m.version === fila.version);
      if (!migracion || calcularChecksum(migracion.sql) !== fila.checksum) {
        return rechazo(
          'corrupta',
          'La copia no coincide con el esquema de esta versión del programa.',
          `checksum de la migración ${fila.version}`,
        );
      }
    }
    return { ok: true, motivo: null, mensaje: '', detalleTecnico: 'ok', version };
  } catch (error) {
    return rechazo(
      'corrupta',
      'La copia está dañada y no se puede usar.',
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    db.close();
  }
}
