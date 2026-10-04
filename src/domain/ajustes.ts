import type { TipoAjuste } from '../shared/ajustes';
import { MILESIMAS_POR_UNIDAD, type UnidadMedida } from '../shared/formato/cantidades';
import { ErrorDeNegocio } from './errores';

/**
 * Lo que se necesita para calcular un ajuste de inventario.
 */
export interface EntradaAjuste {
  /** Tipo de ajuste. */
  tipo: TipoAjuste;
  /** Unidad del producto. */
  unidad: UnidadMedida;
  /** Milésimas: lo que se resta (merma, daño) o lo contado (conteo físico). */
  cantidad: number;
  /** Stock actual del producto en la bodega. */
  stockActual: number;
}

/**
 * Calcula el movimiento de kardex de un ajuste de inventario (§9.2, D-46):
 *
 * - **Merma** y **daño** restan la cantidad indicada (debe ser mayor que cero).
 * - **Conteo físico** deja el stock en la cantidad contada: mueve la
 *   diferencia entre lo contado y el stock actual (puede ser entrada o salida).
 *
 * En UND la cantidad debe ser un número entero de unidades.
 *
 * @param entrada - Tipo, cantidad y stock actual.
 * @returns Milésimas con signo a registrar en el kardex (nunca cero).
 * @throws {ErrorDeNegocio} Si la cantidad no es válida o el conteo coincide con el stock.
 *
 * @example
 * movimientoAjuste({ tipo: 'merma', unidad: 'KG', cantidad: 1500, stockActual: 10000 });  // -1500
 * movimientoAjuste({ tipo: 'conteo', unidad: 'UND', cantidad: 8000, stockActual: 10000 }); // -2000
 * movimientoAjuste({ tipo: 'conteo', unidad: 'UND', cantidad: 12000, stockActual: 10000 }); // 2000
 */
export function movimientoAjuste(entrada: EntradaAjuste): number {
  const { tipo, unidad, cantidad, stockActual } = entrada;
  if (!Number.isSafeInteger(cantidad) || cantidad < 0) {
    throw new ErrorDeNegocio('VALIDACION', 'La cantidad no es válida.');
  }
  if (unidad === 'UND' && cantidad % MILESIMAS_POR_UNIDAD !== 0) {
    throw new ErrorDeNegocio(
      'VALIDACION',
      'La cantidad no es válida: el producto se maneja por unidades (sin decimales).',
    );
  }
  if (tipo === 'conteo') {
    const diferencia = cantidad - stockActual;
    if (diferencia === 0) {
      throw new ErrorDeNegocio(
        'VALIDACION',
        'La cantidad contada es igual al stock actual: no hay nada que ajustar.',
      );
    }
    return diferencia;
  }
  if (cantidad === 0) {
    throw new ErrorDeNegocio('VALIDACION', 'La cantidad a descontar debe ser mayor que cero.');
  }
  return -cantidad;
}

/**
 * Movimiento de kardex que revierte un ajuste anulado (D-73, D-133): el
 * contrario de lo que movió. El stock puede quedar negativo (§5.1).
 *
 * @param cantidadAjuste - Milésimas con signo que movió el ajuste.
 * @param estado - Estado actual del ajuste.
 * @returns Milésimas con signo del movimiento `anulacion_ajuste`.
 * @throws {ErrorDeNegocio} Si el ajuste ya está anulado o su cantidad no es válida.
 *
 * @example
 * movimientoAnulacionAjuste(-1500, 'activo'); // 1500
 */
export function movimientoAnulacionAjuste(
  cantidadAjuste: number,
  estado: 'activo' | 'anulado',
): number {
  if (estado === 'anulado') {
    throw new ErrorDeNegocio('VALIDACION', 'El ajuste ya está anulado.');
  }
  if (!Number.isSafeInteger(cantidadAjuste) || cantidadAjuste === 0) {
    throw new ErrorDeNegocio('VALIDACION', 'La cantidad del ajuste no es válida.');
  }
  return -cantidadAjuste;
}
