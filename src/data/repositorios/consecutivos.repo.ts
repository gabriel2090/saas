import { siguienteConsecutivo } from '../../domain/maestros';
import type { BaseDeDatos } from '../conexion';
import type { ContextoTransaccion } from '../transaccion';

/**
 * Consecutivos existentes. Las fases siguientes agregan los de sus
 * documentos (factura de cliente, abono de cliente…) con su propia migración.
 */
export type ClaveConsecutivo =
  | 'producto'
  | 'cliente'
  | 'proveedor'
  | 'compra'
  | 'abono_proveedor'
  | 'ajuste'
  | 'factura_cliente';

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
 * Ajusta un consecutivo después de guardar un código elegido por el usuario
 * o importado, para que el próximo número siempre quede por encima (D-25).
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param clave - Consecutivo a ajustar.
 * @param codigoUsado - Código que se acaba de guardar.
 * @throws {Error} Si el consecutivo no existe.
 */
export function ajustarConsecutivo(
  ctx: ContextoTransaccion,
  clave: ClaveConsecutivo,
  codigoUsado: number,
): void {
  const actual = consultarConsecutivo(ctx.db, clave);
  const nuevo = siguienteConsecutivo(actual, codigoUsado);
  if (nuevo !== actual) {
    ctx.db.prepare('UPDATE consecutivos SET siguiente = ? WHERE clave = ?').run(nuevo, clave);
  }
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
