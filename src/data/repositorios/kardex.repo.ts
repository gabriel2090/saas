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
 * Stock inicial cargado por producto y bodega: la suma de sus movimientos
 * `inicial` (D-39). Incluye los pares cuyo stock inicial quedó en cero.
 *
 * @param db - Conexión abierta.
 * @returns Clave `codigo|bodegaId` → milésimas.
 */
export function stockInicialPorPar(db: BaseDeDatos): Map<string, number> {
  const filas = db
    .prepare(
      `SELECT producto_codigo AS codigo, bodega_id AS bodega, SUM(cantidad) AS cantidad
       FROM movimientos_inventario WHERE tipo = 'inicial'
       GROUP BY producto_codigo, bodega_id`,
    )
    .all() as { codigo: number; bodega: number; cantidad: number }[];
  return new Map(filas.map((f) => [`${f.codigo}|${f.bodega}`, f.cantidad]));
}

/**
 * Productos con algún movimiento distinto del stock inicial: ya no admiten
 * stock inicial y se corrigen con ajustes de inventario (D-39).
 *
 * @param db - Conexión abierta.
 * @returns Códigos de producto.
 */
export function productosConOtrosMovimientos(db: BaseDeDatos): Set<number> {
  const filas = db
    .prepare(
      `SELECT DISTINCT producto_codigo AS codigo
       FROM movimientos_inventario WHERE tipo <> 'inicial'`,
    )
    .all() as { codigo: number }[];
  return new Set(filas.map((f) => f.codigo));
}

/**
 * Stock inicial de un producto en cada bodega (suma de sus movimientos
 * `inicial`), para mostrarlo de solo lectura en la ficha.
 *
 * @param db - Conexión abierta.
 * @param productoCodigo - Producto.
 * @returns Stock inicial por bodega distinto de cero, ordenado por bodega.
 */
export function stockInicialDeProducto(db: BaseDeDatos, productoCodigo: number): StockEnBodega[] {
  return db
    .prepare(
      `SELECT m.bodega_id AS bodegaId, b.nombre AS bodegaNombre, SUM(m.cantidad) AS cantidad
       FROM movimientos_inventario m JOIN bodegas b ON b.id = m.bodega_id
       WHERE m.producto_codigo = ? AND m.tipo = 'inicial'
       GROUP BY m.bodega_id HAVING SUM(m.cantidad) <> 0
       ORDER BY m.bodega_id`,
    )
    .all(productoCodigo) as StockEnBodega[];
}

/**
 * Stock inicial a registrar, ya validado con `diferenciaStockInicial`.
 */
export interface StockInicialARegistrar {
  /** Producto. */
  productoCodigo: number;
  /** Bodega. */
  bodegaId: number;
  /** Diferencia en milésimas respecto del stock inicial anterior. */
  diferencia: number;
  /** Costo del producto. */
  costoUnitario: number;
  /** Documento que origina la carga (importación o creación del producto). */
  documento: { tipo: string; id: string };
}

/**
 * Registra el stock inicial en el kardex: un movimiento `inicial` por la
 * diferencia. Lo usan tanto el importador como la ficha de producto nuevo,
 * para que ambos caminos dejen el mismo rastro (D-45).
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param stock - Stock inicial validado.
 * @returns Id del movimiento, o `null` si la diferencia es cero (no hay nada que mover).
 */
export function registrarStockInicial(
  ctx: ContextoTransaccion,
  stock: StockInicialARegistrar,
): number | null {
  if (stock.diferencia === 0) {
    return null;
  }
  return insertarMovimiento(ctx, {
    productoCodigo: stock.productoCodigo,
    bodegaId: stock.bodegaId,
    tipo: 'inicial',
    cantidad: stock.diferencia,
    costoUnitario: stock.costoUnitario,
    documento: stock.documento,
  });
}
