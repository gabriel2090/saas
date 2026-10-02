import type { BaseDeDatos } from '../conexion';

/**
 * Preferencia de interfaz guardada, con su valor en JSON.
 */
export interface FilaPreferencia {
  /** Clave (`barra` o `ventana:<id>`). */
  clave: string;
  /** Valor en JSON. */
  valor: string;
}

/**
 * Lista todas las preferencias de interfaz.
 *
 * @param db - Conexión abierta.
 * @returns Preferencias ordenadas por clave.
 */
export function listarPreferencias(db: BaseDeDatos): FilaPreferencia[] {
  return db
    .prepare('SELECT clave, valor FROM preferencias_interfaz ORDER BY clave')
    .all() as FilaPreferencia[];
}

/**
 * Guarda una preferencia. No pasa por el ejecutor de transacciones a
 * propósito: no es un dato del negocio, no va al historial y guardarla cada
 * vez que se mueve una ventana no debe disparar respaldos (D-113, como los
 * borradores de D-89). La sentencia es atómica por sí sola.
 *
 * @param db - Conexión abierta.
 * @param clave - Clave.
 * @param valor - Valor en JSON (ya verificado).
 * @param fecha - Fecha ISO del guardado.
 */
export function guardarPreferencia(
  db: BaseDeDatos,
  clave: string,
  valor: string,
  fecha: string,
): void {
  db.prepare(
    `INSERT INTO preferencias_interfaz (clave, valor, actualizado_en) VALUES (?, ?, ?)
     ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`,
  ).run(clave, valor, fecha);
}

/**
 * Borra una preferencia.
 *
 * @param db - Conexión abierta.
 * @param clave - Clave exacta.
 */
export function borrarPreferencia(db: BaseDeDatos, clave: string): void {
  db.prepare('DELETE FROM preferencias_interfaz WHERE clave = ?').run(clave);
}

/**
 * Borra las preferencias cuya clave empieza por un prefijo (p. ej.
 * `ventana:` para olvidar la geometría de todas las ventanas).
 *
 * @param db - Conexión abierta.
 * @param prefijo - Prefijo de la clave.
 */
export function borrarPreferenciasConPrefijo(db: BaseDeDatos, prefijo: string): void {
  // `substr` en vez de LIKE: el prefijo podría traer `_` o `%`, que LIKE toma como comodines.
  db.prepare('DELETE FROM preferencias_interfaz WHERE substr(clave, 1, length(?)) = ?').run(
    prefijo,
    prefijo,
  );
}
