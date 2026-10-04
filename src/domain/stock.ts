import { MILESIMAS_POR_UNIDAD, type UnidadMedida } from '../shared/formato/cantidades';
import { ErrorDeNegocio } from './errores';

/**
 * Tipos de movimiento de inventario:
 * - `inicial`: stock cargado por el importador o al crear el producto (D-39, D-45).
 * - `compra`: entrada por una factura de proveedor (§6).
 * - `ajuste`: merma, daño o conteo físico (§9.2, D-46).
 * - `venta`: salida por una factura de cliente (§7).
 * - `correccion_venta` y `correccion_compra`: diferencia de cantidad al
 *   corregir una factura (§9.1, D-132).
 * - `anulacion_venta` y `anulacion_compra`: devuelven todo lo que movió la
 *   factura anulada.
 * - `devolucion_venta` y `devolucion_compra`: reingreso o salida por una
 *   devolución (§9.2, D-131), y `anulacion_devolucion_*` su reverso.
 * - `anulacion_ajuste`: reverso de un ajuste anulado (D-73, D-133).
 */
export type TipoMovimiento =
  | 'inicial'
  | 'compra'
  | 'ajuste'
  | 'venta'
  | 'correccion_venta'
  | 'correccion_compra'
  | 'anulacion_venta'
  | 'anulacion_compra'
  | 'devolucion_venta'
  | 'devolucion_compra'
  | 'anulacion_devolucion_venta'
  | 'anulacion_devolucion_compra'
  | 'anulacion_ajuste';

/**
 * Lo que se necesita para fijar el stock inicial de un producto en una bodega.
 */
export interface EntradaStockInicial {
  /** Código del producto (para los mensajes). */
  productoCodigo: number;
  /** Unidad de medida del producto. */
  unidad: UnidadMedida;
  /** Stock inicial deseado en milésimas (cero lo deja en cero). */
  cantidad: number;
  /** Si se acepta una cantidad negativa: sí en el importador (con aviso), no al crear el producto (D-45). */
  permitirNegativo: boolean;
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
 * - Una cantidad negativa solo se acepta si `permitirNegativo` (importador).
 *
 * @param entrada - Producto, cantidad deseada y lo que ya existe.
 * @returns Diferencia en milésimas a registrar (0: no hay que registrar nada).
 * @throws {ErrorDeNegocio} Si la cantidad no es válida o el producto ya tiene otros movimientos.
 *
 * @example
 * diferenciaStockInicial({
 *   productoCodigo: 104, unidad: 'KG', cantidad: 12_500,
 *   cantidadAnterior: 10_000, tieneOtrosMovimientos: false, permitirNegativo: true,
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
  if (cantidad < 0 && !entrada.permitirNegativo) {
    throw new ErrorDeNegocio('VALIDACION', 'El stock inicial no puede ser negativo.');
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
