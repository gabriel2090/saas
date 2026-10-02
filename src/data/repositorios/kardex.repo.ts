import { calcularStockPorBodega, type TipoMovimiento } from '../../domain/stock';
import type { StockEnBodega } from '../../shared/maestros';
import type { BaseDeDatos } from '../conexion';
import type { ContextoTransaccion } from '../transaccion';

/**
 * Movimiento a registrar en el kardex.
 */
export interface MovimientoNuevo {
  /** Producto. */
  productoCodigo: number;
  /** Bodega. */
  bodegaId: number;
  /** Tipo de movimiento. */
  tipo: TipoMovimiento;
  /** Cantidad en milésimas con signo (no puede ser cero). */
  cantidad: number;
  /** Costo unitario en pesos al momento del movimiento. */
  costoUnitario: number;
  /** Documento que origina el movimiento (tipo e id), si lo hay. */
  documento?: { tipo: string; id: string };
}

/**
 * Registra un movimiento en el kardex con la fecha de la transacción. El
 * movimiento en sí es el registro de auditoría del inventario (la tabla no
 * admite cambios ni borrados), así que no se duplica en el historial.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param movimiento - Movimiento a registrar.
 * @returns Id del movimiento.
 */
export function insertarMovimiento(ctx: ContextoTransaccion, movimiento: MovimientoNuevo): number {
  const resultado = ctx.db
    .prepare(
      `INSERT INTO movimientos_inventario
         (fecha, producto_codigo, bodega_id, tipo, cantidad, costo_unitario, documento_tipo, documento_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      ctx.fecha,
      movimiento.productoCodigo,
      movimiento.bodegaId,
      movimiento.tipo,
      movimiento.cantidad,
      movimiento.costoUnitario,
      movimiento.documento?.tipo ?? null,
      movimiento.documento?.id ?? null,
    );
  return Number(resultado.lastInsertRowid);
}

/**
 * Calcula el stock de un producto en cada bodega a partir de sus movimientos.
 *
 * @param db - Conexión abierta.
 * @param productoCodigo - Producto.
 * @returns Stock por bodega (solo bodegas con movimientos), ordenado por bodega.
 */
export function stockPorBodega(db: BaseDeDatos, productoCodigo: number): StockEnBodega[] {
  const movimientos = db
    .prepare(
      'SELECT bodega_id AS bodegaId, cantidad FROM movimientos_inventario WHERE producto_codigo = ?',
    )
    .all(productoCodigo) as { bodegaId: number; cantidad: number }[];
  const stock = calcularStockPorBodega(movimientos);
  const nombres = new Map(
    (db.prepare('SELECT id, nombre FROM bodegas').all() as { id: number; nombre: string }[]).map(
      (b) => [b.id, b.nombre],
    ),
  );
  return [...stock]
    .sort(([a], [b]) => a - b)
    .map(([bodegaId, cantidad]) => ({
      bodegaId,
      bodegaNombre: nombres.get(bodegaId) ?? `Bodega ${bodegaId}`,
      cantidad,
    }));
}

/**
 * Indica si un producto tiene movimientos de inventario.
 *
 * @param db - Conexión abierta.
 * @param productoCodigo - Producto.
 * @returns `true` si tiene al menos un movimiento.
 */
export function tieneMovimientos(db: BaseDeDatos, productoCodigo: number): boolean {
  return (
    db
      .prepare('SELECT 1 FROM movimientos_inventario WHERE producto_codigo = ? LIMIT 1')
      .get(productoCodigo) !== undefined
  );
}

/**
 * Pares producto|bodega que ya tienen stock inicial cargado (D-39).
 *
 * @param db - Conexión abierta.
 * @returns Conjunto de claves `codigo|bodegaId`.
 */
export function paresConStockInicial(db: BaseDeDatos): Set<string> {
  const filas = db
    .prepare(
      `SELECT DISTINCT producto_codigo AS codigo, bodega_id AS bodega
       FROM movimientos_inventario WHERE tipo = 'inicial'`,
    )
    .all() as { codigo: number; bodega: number }[];
  return new Set(filas.map((f) => `${f.codigo}|${f.bodega}`));
}
