import type { OrigenSaldoFavor } from '../../domain/saldo-favor';
import type { TipoTercero } from '../../shared/correcciones';
import type { BaseDeDatos } from '../conexion';
import type { ContextoTransaccion } from '../transaccion';

/**
 * Tipos de documento que mueven el libro de saldo a favor. El id es el del
 * documento: la versión de la factura en una corrección, la factura en una
 * anulación, y la devolución, el abono o el reintegro en los demás.
 */
export type DocumentoSaldoFavor =
  | 'correccion_venta'
  | 'correccion_compra'
  | 'anulacion_venta'
  | 'anulacion_compra'
  | 'devolucion'
  | 'anulacion_devolucion'
  | 'abono'
  | 'anulacion_abono'
  | 'reintegro'
  | 'anulacion_reintegro';

/**
 * Movimiento a registrar en el libro de saldo a favor.
 */
export interface MovimientoFavorNuevo {
  /** Cliente o proveedor. */
  tipo: TipoTercero;
  /** Código del tercero. */
  terceroCodigo: number;
  /** Valor con signo (positivo genera, negativo usa o recupera). */
  valor: number;
  /** Origen (D-127). */
  origen: OrigenSaldoFavor;
  /** Documento que lo origina. */
  documento: { tipo: DocumentoSaldoFavor; id: number };
  /**
   * Factura cuyo excedente se traslada o se recupera, o `null` si el
   * movimiento no es de una factura (uso en un abono, reintegro).
   */
  facturaId: number | null;
}

/**
 * Registra un movimiento en el libro de saldo a favor con la fecha de la
 * transacción. El libro solo admite inserciones, así que es su propio
 * registro de auditoría; el documento que lo origina va al historial.
 * Un valor 0 no se registra.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param movimiento - Movimiento a registrar.
 * @returns Id del movimiento, o `null` si el valor es 0.
 */
export function insertarMovimientoFavor(
  ctx: ContextoTransaccion,
  movimiento: MovimientoFavorNuevo,
): number | null {
  if (movimiento.valor === 0) {
    return null;
  }
  const cliente = movimiento.tipo === 'cliente';
  const resultado = ctx.db
    .prepare(
      `INSERT INTO saldos_favor
         (tipo, cliente_codigo, proveedor_codigo, fecha, valor, origen, documento_tipo,
          documento_id, factura_cliente_id, factura_proveedor_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      movimiento.tipo,
      cliente ? movimiento.terceroCodigo : null,
      cliente ? null : movimiento.terceroCodigo,
      ctx.fecha,
      movimiento.valor,
      movimiento.origen,
      movimiento.documento.tipo,
      movimiento.documento.id,
      cliente ? movimiento.facturaId : null,
      cliente ? null : movimiento.facturaId,
    );
  return Number(resultado.lastInsertRowid);
}

/**
 * Saldo a favor disponible de un tercero: la suma de su libro.
 *
 * @param db - Conexión abierta.
 * @param tipo - Cliente o proveedor.
 * @param terceroCodigo - Código del tercero.
 * @returns Saldo disponible (0 si no tiene movimientos).
 */
export function saldoFavorDe(db: BaseDeDatos, tipo: TipoTercero, terceroCodigo: number): number {
  const columna = tipo === 'cliente' ? 'cliente_codigo' : 'proveedor_codigo';
  const fila = db
    .prepare(`SELECT COALESCE(SUM(valor), 0) AS disponible FROM saldos_favor WHERE ${columna} = ?`)
    .get(terceroCodigo) as { disponible: number };
  return fila.disponible;
}
