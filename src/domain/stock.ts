/**
 * Tipos de movimiento de inventario. La Fase 1 solo crea `inicial` (stock
 * cargado por el importador); las fases siguientes agregan compra, venta,
 * ajuste y devoluciones.
 */
export type TipoMovimiento = 'inicial';

/**
 * Movimiento de kardex tal como lo necesita el cálculo de stock.
 */
export interface MovimientoStock {
  /** Bodega del movimiento. */
  bodegaId: number;
  /** Cantidad en milésimas, con signo (entradas positivas, salidas negativas). */
  cantidad: number;
}

/**
 * Calcula el stock por bodega como la suma de los movimientos del kardex
 * (§3: el stock nunca es un número suelto editable). El resultado puede ser
 * cero o negativo, porque se permite vender sin stock (§5.1).
 *
 * @param movimientos - Movimientos de un producto.
 * @returns Mapa bodega → cantidad en milésimas, solo con las bodegas que tienen movimientos.
 * @throws {RangeError} Si una cantidad no es entera o la suma excede el rango seguro.
 *
 * @example
 * calcularStockPorBodega([
 *   { bodegaId: 1, cantidad: 10000 },
 *   { bodegaId: 1, cantidad: -2500 },
 *   { bodegaId: 2, cantidad: 1000 },
 * ]); // Map { 1 => 7500, 2 => 1000 }
 */
export function calcularStockPorBodega(
  movimientos: readonly MovimientoStock[],
): Map<number, number> {
  const stock = new Map<number, number>();
  for (const { bodegaId, cantidad } of movimientos) {
    const suma = (stock.get(bodegaId) ?? 0) + cantidad;
    if (!Number.isSafeInteger(cantidad) || !Number.isSafeInteger(suma)) {
      throw new RangeError('Las cantidades del kardex deben ser milésimas enteras.');
    }
    stock.set(bodegaId, suma);
  }
  return stock;
}

/**
 * Suma el stock de todas las bodegas.
 *
 * @param stockPorBodega - Resultado de {@link calcularStockPorBodega}.
 * @returns Stock total en milésimas.
 */
export function stockTotal(stockPorBodega: ReadonlyMap<number, number>): number {
  let total = 0;
  for (const cantidad of stockPorBodega.values()) {
    total += cantidad;
  }
  return total;
}
