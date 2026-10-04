import { formatearPesos } from '../shared/formato/moneda';
import { ErrorDeNegocio } from './errores';

/**
 * Orígenes de un movimiento del libro de saldo a favor (D-127):
 * - `correccion`, `devolucion` y `anulacion`: excedente de una factura (o su
 *   recuperación, con valor negativo).
 * - `abono`: se usó para pagar un abono con la forma «Saldo a favor» (D-130).
 * - `reintegro`: se devolvió en dinero (D-128).
 * - `anulacion_abono`, `anulacion_reintegro` y `anulacion_devolucion`:
 *   reversan los anteriores.
 */
export type OrigenSaldoFavor =
  | 'correccion'
  | 'devolucion'
  | 'anulacion'
  | 'abono'
  | 'reintegro'
  | 'anulacion_abono'
  | 'anulacion_reintegro'
  | 'anulacion_devolucion';

/**
 * Situación de cartera de una factura a crédito (o de una compra, que
 * siempre tiene cartera).
 */
export interface CarteraFactura {
  /** Total de la factura (el nuevo, si se está corrigiendo). */
  total: number;
  /** Suma de lo aplicado por abonos activos. */
  aplicado: number;
  /** Suma de las devoluciones activas (incluida la que se está guardando). */
  devuelto: number;
  /** Lo que la factura ya trasladó al saldo a favor (suma de sus movimientos en el libro). */
  trasladado: number;
  /** Saldo a favor disponible del tercero (suma de todo su libro). */
  disponible: number;
}

/**
 * Resultado de ajustar la cartera de una factura.
 */
export interface AjusteCartera {
  /** Saldo pendiente de la factura después del ajuste (nunca negativo). */
  saldo: number;
  /**
   * Movimiento a registrar en el libro de saldo a favor: positivo si se
   * genera saldo a favor, negativo si la factura recupera lo que había
   * trasladado, 0 si no hay movimiento.
   */
  movimientoFavor: number;
}

/**
 * Lanza un error de validación con el mensaje dado.
 *
 * @param mensaje - Mensaje en español para el usuario.
 * @throws {ErrorDeNegocio} Siempre.
 */
function invalido(mensaje: string): never {
  throw new ErrorDeNegocio('VALIDACION', mensaje);
}

/**
 * Saldo de una factura según D-127: total − abonos activos − devoluciones
 * activas + lo trasladado al saldo a favor. Tras cada operación guardada
 * nunca es negativo; puede serlo en un cálculo intermedio.
 *
 * @param cartera - Total, aplicado, devuelto y trasladado.
 * @returns Saldo de la factura.
 *
 * @example
 * saldoDeFactura({ total: 48250, aplicado: 70000, devuelto: 0, trasladado: 21750 }); // 0
 */
export function saldoDeFactura(
  cartera: Pick<CarteraFactura, 'total' | 'aplicado' | 'devuelto' | 'trasladado'>,
): number {
  return cartera.total - cartera.aplicado - cartera.devuelto + cartera.trasladado;
}

/**
 * Ajusta la cartera de una factura después de una corrección o una
 * devolución (D-120, D-127):
 *
 * - Si lo pagado supera lo que se debe, el excedente pasa al saldo a favor
 *   del tercero y la factura queda en 0.
 * - Si la factura debe y antes había trasladado saldo a favor, primero lo
 *   recupera, hasta lo que el tercero todavía tenga disponible.
 * - Lo demás queda como saldo pendiente.
 *
 * @param cartera - Situación de la factura con el total y lo devuelto nuevos.
 * @returns Saldo de la factura y movimiento del libro de saldo a favor.
 * @throws {ErrorDeNegocio} Si algún valor no es un entero válido.
 *
 * @example
 * // Factura 84772 corregida de 79,250 a 48,250 con 70,000 abonados:
 * ajustarCartera({ total: 48250, aplicado: 70000, devuelto: 0, trasladado: 0, disponible: 0 });
 * // { saldo: 0, movimientoFavor: 21750 }
 * // Y si después se vuelve a corregir a 79,250 sin haber usado el saldo a favor:
 * ajustarCartera({ total: 79250, aplicado: 70000, devuelto: 0, trasladado: 21750, disponible: 21750 });
 * // { saldo: 9250, movimientoFavor: -21750 }
 */
export function ajustarCartera(cartera: CarteraFactura): AjusteCartera {
  for (const valor of Object.values(cartera)) {
    if (!Number.isSafeInteger(valor)) {
      invalido('Los valores de la cartera de la factura no son válidos.');
    }
  }
  const bruto = saldoDeFactura(cartera);
  if (bruto < 0) {
    return { saldo: 0, movimientoFavor: -bruto };
  }
  const recuperable = Math.max(0, Math.min(bruto, cartera.trasladado, cartera.disponible));
  return { saldo: bruto - recuperable, movimientoFavor: recuperable === 0 ? 0 : -recuperable };
}

/**
 * Movimiento del libro de saldo a favor al anular una factura (D-121): lo
 * que el tercero pagó en neto a esa factura (abonos que siguen activos menos
 * lo que ya se había trasladado) pasa a saldo a favor. Si da negativo (la
 * factura había trasladado más de lo que queda pagado, p. ej. una compra de
 * contado corregida a la baja cuyo abono automático se anula con ella), se
 * recupera del saldo a favor, que debe alcanzar.
 *
 * @param aplicadoQueda - Lo aplicado por los abonos que siguen activos tras la anulación.
 * @param trasladado - Lo que la factura ya trasladó al saldo a favor.
 * @param disponible - Saldo a favor disponible del tercero.
 * @returns Movimiento del libro (positivo genera, negativo recupera, 0 nada).
 * @throws {ErrorDeNegocio} Si hay que recuperar más saldo a favor del disponible.
 *
 * @example
 * movimientoFavorAlAnular(200000, 0, 0);     // 200000 (compra 39 con un abono de 200,000)
 * movimientoFavorAlAnular(0, 35600, 35600);  // -35600
 */
export function movimientoFavorAlAnular(
  aplicadoQueda: number,
  trasladado: number,
  disponible: number,
): number {
  const movimiento = aplicadoQueda - trasladado;
  if (movimiento < 0 && -movimiento > disponible) {
    invalido(
      `La factura había dejado ${formatearPesos(trasladado)} de saldo a favor y el tercero ya usó ` +
        `parte (le quedan ${formatearPesos(Math.max(disponible, 0))}). Anule primero el abono o el ` +
        'reintegro que lo usó.',
    );
  }
  return movimiento;
}

/**
 * Saldo a favor disponible de un tercero: la suma de su libro.
 *
 * @param movimientos - Valores de los movimientos del libro (con signo).
 * @returns Saldo disponible.
 *
 * @example
 * saldoFavorDisponible([21750, -10000]); // 11750
 */
export function saldoFavorDisponible(movimientos: readonly number[]): number {
  return movimientos.reduce((suma, valor) => suma + valor, 0);
}

/**
 * Valida que se pueda usar un valor del saldo a favor (en un abono con la
 * forma «Saldo a favor» o en un reintegro en dinero, D-128, D-130).
 *
 * @param valor - Valor a usar.
 * @param disponible - Saldo a favor disponible del tercero.
 * @returns El valor validado.
 * @throws {ErrorDeNegocio} Si no es un entero positivo o supera el disponible.
 *
 * @example
 * validarUsoSaldoFavor(10000, 21750); // 10000
 */
export function validarUsoSaldoFavor(valor: number, disponible: number): number {
  if (!Number.isSafeInteger(valor) || valor <= 0) {
    invalido('El valor debe ser un valor en pesos mayor que cero.');
  }
  if (valor > disponible) {
    invalido(
      `El valor (${formatearPesos(valor)}) supera el saldo a favor disponible (${formatearPesos(Math.max(disponible, 0))}).`,
    );
  }
  return valor;
}

/**
 * Valida que se pueda reversar un uso del saldo a favor al anular el abono o
 * el reintegro que lo usó: siempre se puede (el saldo vuelve). En cambio,
 * reversar un saldo a favor **generado** (anular una devolución que lo
 * generó) exige que siga disponible.
 *
 * @param generado - Lo que el documento había generado en el libro (positivo).
 * @param disponible - Saldo a favor disponible del tercero.
 * @throws {ErrorDeNegocio} Si el tercero ya usó parte de lo generado.
 *
 * @example
 * validarReversoGenerado(89500, 125100); // no lanza
 */
export function validarReversoGenerado(generado: number, disponible: number): void {
  if (generado > disponible) {
    invalido(
      `Este documento generó ${formatearPesos(generado)} de saldo a favor y el tercero ya usó parte ` +
        `(le quedan ${formatearPesos(Math.max(disponible, 0))}). Anule primero el abono o el reintegro que lo usó.`,
    );
  }
}
