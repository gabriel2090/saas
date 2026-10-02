import type { AplicacionAbono } from '../shared/abonos';
import type { ResumenDeuda } from '../shared/compras';
import { diasEntre } from './calendario';
import { ErrorDeNegocio } from './errores';
import { limpiarTexto } from './texto';

/**
 * Largo máximo de la observación de un abono y del motivo de una anulación.
 */
export const LARGO_MAXIMO_OBSERVACION = 150;

/**
 * Factura con saldo, tal como la necesita el reparto de un abono.
 */
export interface SaldoFactura {
  /** Id de la factura. */
  id: number;
  /** Saldo pendiente. */
  saldo: number;
}

/**
 * Factura con saldo y vencimiento, para calcular la deuda.
 */
export interface SaldoConVencimiento {
  /** Saldo pendiente. */
  saldo: number;
  /** Vencimiento, `AAAA-MM-DD`. */
  vence: string;
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
 * Saldo de una factura: total menos lo aplicado por abonos activos (§8). Si
 * los abonos superan el total (posible tras una corrección de la Fase 4), el
 * saldo es negativo: un saldo a favor.
 *
 * @param total - Total de la factura.
 * @param aplicado - Suma de lo aplicado por abonos activos.
 * @returns Saldo pendiente.
 */
export function saldoFactura(total: number, aplicado: number): number {
  return total - aplicado;
}

/**
 * Deuda de un tercero: suma de saldos positivos y la parte vencida (la que
 * venció antes de hoy).
 *
 * @param facturas - Facturas activas con su saldo y vencimiento.
 * @param hoy - Día de hoy, `AAAA-MM-DD`.
 * @returns Deuda total y vencida.
 *
 * @example
 * resumenDeuda([{ saldo: 380000, vence: '2026-09-19' }, { saldo: 825700, vence: '2026-10-05' }], '2026-10-02');
 * // { total: 1205700, vencido: 380000 }
 */
export function resumenDeuda(facturas: readonly SaldoConVencimiento[], hoy: string): ResumenDeuda {
  let total = 0;
  let vencido = 0;
  for (const { saldo, vence } of facturas) {
    if (saldo <= 0) {
      continue;
    }
    total += saldo;
    if (diasEntre(hoy, vence) < 0) {
      vencido += saldo;
    }
  }
  return { total, vencido };
}

/**
 * Reparte el valor de un abono entre las facturas, de la primera a la
 * última (el llamador las pasa de la más antigua a la más reciente, D-51),
 * sin pasar del saldo de ninguna. Si el valor supera la deuda, lo que sobra
 * queda sin aplicar (la validación lo rechazará al guardar, D-71).
 *
 * @param valor - Valor del abono (≥ 0).
 * @param facturas - Facturas con saldo, en el orden de aplicación.
 * @returns Valor a aplicar a cada factura, en el mismo orden (puede ser 0).
 *
 * @example
 * repartirAbono(1000000, [{ id: 9, saldo: 380000 }, { id: 11, saldo: 825700 }, { id: 13, saldo: 1244300 }]);
 * // [{ facturaId: 9, valor: 380000 }, { facturaId: 11, valor: 620000 }, { facturaId: 13, valor: 0 }]
 */
export function repartirAbono(valor: number, facturas: readonly SaldoFactura[]): AplicacionAbono[] {
  let restante = Math.max(valor, 0);
  return facturas.map(({ id, saldo }) => {
    const aplicado = Math.min(restante, Math.max(saldo, 0));
    restante -= aplicado;
    return { facturaId: id, valor: aplicado };
  });
}

/**
 * Valida el reparto de un abono antes de guardarlo (§8, D-51, D-71):
 *
 * - El valor es un entero positivo.
 * - Cada aplicación es a una factura con saldo, una sola vez, con un valor
 *   entero que no pasa del saldo de esa factura.
 * - Lo aplicado suma exactamente el valor del abono (no hay anticipos).
 *
 * @param valor - Valor del abono.
 * @param aplicaciones - Reparto escrito (las de valor 0 se descartan).
 * @param saldos - Saldo actual de cada factura pendiente del tercero (id → saldo).
 * @returns Las aplicaciones con valor mayor que cero.
 * @throws {ErrorDeNegocio} Si alguna regla no se cumple.
 *
 * @example
 * validarAplicaciones(500, [{ facturaId: 1, valor: 500 }, { facturaId: 2, valor: 0 }], new Map([[1, 800], [2, 100]]));
 * // [{ facturaId: 1, valor: 500 }]
 */
export function validarAplicaciones(
  valor: number,
  aplicaciones: readonly AplicacionAbono[],
  saldos: ReadonlyMap<number, number>,
): AplicacionAbono[] {
  if (!Number.isSafeInteger(valor) || valor <= 0) {
    invalido('El valor del abono debe ser un valor en pesos mayor que cero.');
  }
  const vistas = new Set<number>();
  let suma = 0;
  const conValor: AplicacionAbono[] = [];
  for (const { facturaId, valor: aplicado } of aplicaciones) {
    if (vistas.has(facturaId)) {
      invalido('Una misma factura aparece dos veces en el reparto del abono.');
    }
    vistas.add(facturaId);
    if (!Number.isSafeInteger(aplicado) || aplicado < 0) {
      invalido('Lo aplicado a cada factura debe ser un valor en pesos, sin signo negativo.');
    }
    if (aplicado === 0) {
      continue;
    }
    const saldo = saldos.get(facturaId);
    if (saldo === undefined || saldo <= 0) {
      invalido(
        'Una de las facturas del reparto ya no tiene saldo pendiente. Vuelva a cargar el proveedor.',
      );
    }
    if (aplicado > saldo) {
      invalido('Lo aplicado a una factura no puede ser mayor que su saldo.');
    }
    suma += aplicado;
    conValor.push({ facturaId, valor: aplicado });
  }
  if (suma !== valor) {
    invalido(
      suma < valor
        ? 'Falta repartir parte del abono entre las facturas: lo aplicado debe sumar el valor del abono.'
        : 'Lo aplicado a las facturas suma más que el valor del abono.',
    );
  }
  return conValor;
}

/**
 * Valida un texto opcional de un abono (observación o motivo de anulación).
 *
 * @param texto - Texto escrito.
 * @param campo - Nombre del campo para el mensaje.
 * @returns Texto limpio (puede ser vacío).
 * @throws {ErrorDeNegocio} Si es muy largo.
 */
export function validarTextoAbono(texto: string, campo: string): string {
  const limpio = limpiarTexto(texto);
  if (limpio.length > LARGO_MAXIMO_OBSERVACION) {
    invalido(`El campo «${campo}» admite máximo ${LARGO_MAXIMO_OBSERVACION} caracteres.`);
  }
  return limpio;
}
