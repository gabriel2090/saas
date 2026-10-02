import type { BaseDeDatos } from '../conexion';
import type { ContextoTransaccion } from '../transaccion';

/**
 * Consecutivos existentes. Las fases siguientes agregan los de documentos
 * (factura de cliente, abonos, etc.) con su propia migración.
 */
export type ClaveConsecutivo = 'producto' | 'cliente' | 'proveedor';

/**
 * Toma el siguiente número de un consecutivo y lo incrementa, de forma
 * atómica, dentro de la transacción del documento. Si la transacción se
 * revierte, el número vuelve a quedar libre: así no quedan huecos.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param clave - Consecutivo a tomar.
 * @returns Número asignado.
 * @throws {Error} Si el consecutivo no existe.
 *
 * @example
 * ejecutar((ctx) => tomarConsecutivo(ctx, 'producto')); // 101, luego 102…
 */
export function tomarConsecutivo(ctx: ContextoTransaccion, clave: ClaveConsecutivo): number {
  const fila = ctx.db
    .prepare(
      'UPDATE consecutivos SET siguiente = siguiente + 1 WHERE clave = ? RETURNING siguiente - 1 AS asignado',
    )
    .get(clave) as { asignado: number } | undefined;
  if (!fila) {
    throw new Error(`No existe el consecutivo «${clave}».`);
  }
  return fila.asignado;
}

/**
 * Consulta el próximo número de un consecutivo sin tomarlo.
 *
 * @param db - Conexión abierta.
 * @param clave - Consecutivo a consultar.
 * @returns Próximo número que se asignará.
 * @throws {Error} Si el consecutivo no existe.
 */
export function consultarConsecutivo(db: BaseDeDatos, clave: ClaveConsecutivo): number {
  const fila = db.prepare('SELECT siguiente FROM consecutivos WHERE clave = ?').get(clave) as
    { siguiente: number } | undefined;
  if (!fila) {
    throw new Error(`No existe el consecutivo «${clave}».`);
  }
  return fila.siguiente;
}
