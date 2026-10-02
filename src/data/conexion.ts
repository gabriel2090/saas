import Database from 'better-sqlite3';

/**
 * Conexión a la base de datos SQLite (síncrona, de `better-sqlite3`).
 */
export type BaseDeDatos = Database.Database;

/**
 * Abre (o crea) la base de datos y aplica los ajustes del proyecto (D-08):
 *
 * - `journal_mode = WAL`: lecturas sin bloquear escrituras y copias consistentes.
 * - `synchronous = FULL`: prioriza no perder transacciones confirmadas ante un apagón.
 * - `foreign_keys = ON`: SQLite no valida claves foráneas si no se activa.
 * - `busy_timeout = 5000`: espera hasta 5 s si otra conexión tiene un bloqueo.
 *
 * @param ruta - Ruta del archivo `.db`, o `':memory:'` para pruebas.
 * @returns La conexión abierta.
 */
export function abrirBaseDeDatos(ruta: string): BaseDeDatos {
  const db = new Database(ruta);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

/**
 * Resultado de la verificación de integridad.
 */
export interface ResultadoIntegridad {
  /** `true` si SQLite respondió `ok`. */
  ok: boolean;
  /** Mensajes devueltos por SQLite (solo `['ok']` si todo está bien). */
  detalle: string[];
}

/**
 * Ejecuta `PRAGMA integrity_check` para detectar daños en el archivo.
 *
 * @param db - Conexión abierta.
 * @returns Si la base está íntegra y el detalle reportado.
 */
export function verificarIntegridad(db: BaseDeDatos): ResultadoIntegridad {
  const filas = db.pragma('integrity_check') as { integrity_check: string }[];
  const detalle = filas.map((f) => f.integrity_check);
  return { ok: detalle.length === 1 && detalle[0] === 'ok', detalle };
}
