import { MILESIMAS_POR_UNIDAD, type UnidadMedida } from '../shared/formato/cantidades';
import { ErrorDeNegocio } from './errores';

/**
 * Tipos de movimiento de inventario. La Fase 1 solo crea `inicial` (stock
 * cargado por el importador o al crear el producto); las fases siguientes
 * agregan compra, venta, ajuste y devoluciones.
 */
export type TipoMovimiento = 'inicial';

/**
 * Lo que se necesita para fijar el stock inicial de un producto en una bodega.
 */
export interface EntradaStockInicial {
  /** Código del producto (para los mensajes). */
  productoCodigo: number;
  /** Unidad de medida del producto. */
  unidad: UnidadMedida;
  /** Stock inicial deseado en milésimas (puede ser negativo; cero lo deja en cero). */
  cantidad: number;
  /** Stock inicial ya cargado en esa bodega (suma de sus movimientos `inicial`), o 0. */
  cantidadAnterior: number;
  /** Si el producto ya tiene movimientos distintos del stock inicial (en cualquier bodega). */
  tieneOtrosMovimientos: boolean;
}

/**
 * Calcula el movimiento de kardex que deja el stock inicial de un producto en
 * una bodega en la cantidad pedida. La regla es la misma para el importador y
 * para la ficha de producto nuevo (D-39, D-45):
 *
 * - El stock inicial se puede volver a cargar (reemplaza al anterior)
 *   mientras el producto no tenga otros movimientos. Como el kardex no se
 *   edita, el reemplazo se registra como un movimiento `inicial` por la diferencia.
 * - Si ya tiene otros movimientos, la corrección va por un ajuste de inventario.
 * - En UND la cantidad debe ser un número entero de unidades.
 *
 * @param entrada - Producto, cantidad deseada y lo que ya existe.
 * @returns Diferencia en milésimas a registrar (0: no hay que registrar nada).
 * @throws {ErrorDeNegocio} Si la cantidad no es válida o el producto ya tiene otros movimientos.
 *
 * @example
 * diferenciaStockInicial({
 *   productoCodigo: 104, unidad: 'KG', cantidad: 12_500,
 *   cantidadAnterior: 10_000, tieneOtrosMovimientos: false,
 * }); // 2500
 */
export function diferenciaStockInicial(entrada: EntradaStockInicial): number {
  const { productoCodigo, unidad, cantidad, cantidadAnterior } = entrada;
  if (!Number.isSafeInteger(cantidad)) {
    throw new ErrorDeNegocio('VALIDACION', 'La cantidad del stock inicial no es válida.');
  }
  if (unidad === 'UND' && cantidad % MILESIMAS_POR_UNIDAD !== 0) {
    throw new ErrorDeNegocio(
      'VALIDACION',
      'La cantidad del stock inicial no es válida: el producto se vende por unidades (sin decimales).',
    );
  }
  if (entrada.tieneOtrosMovimientos) {
    throw new ErrorDeNegocio(
      'VALIDACION',
      `El producto ${productoCodigo} ya tiene movimientos de inventario: el stock se corrige con un ajuste de inventario.`,
    );
  }
  return cantidad - cantidadAnterior;
}

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
