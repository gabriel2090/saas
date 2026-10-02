import { agruparMiles } from './moneda';

/**
 * Unidades de medida de los productos.
 */
export type UnidadMedida = 'UND' | 'KG';

/**
 * Milésimas que equivalen a una unidad entera (1 und = 1 kg = 1000).
 */
export const MILESIMAS_POR_UNIDAD = 1000;

/**
 * Formatea una cantidad guardada en milésimas.
 *
 * Las unidades (UND) se muestran sin decimales; los kilogramos (KG) con tres
 * decimales separados por punto, porque la coma ya es el separador de miles (D-13).
 *
 * @param milesimas - Cantidad en milésimas (entero).
 * @param unidad - Unidad de medida del producto.
 * @returns Texto como `3` (UND) o `1.500` (KG).
 * @throws {RangeError} Si la cantidad no es un entero seguro.
 *
 * @example
 * formatearCantidad(1500, 'KG');  // '1.500'
 * formatearCantidad(3000, 'UND'); // '3'
 */
export function formatearCantidad(milesimas: number, unidad: UnidadMedida): string {
  if (!Number.isSafeInteger(milesimas)) {
    throw new RangeError(
      `La cantidad debe ser un entero en milésimas; se recibió ${String(milesimas)}.`,
    );
  }
  const signo = milesimas < 0 ? '-' : '';
  const absoluto = Math.abs(milesimas);
  const enteros = Math.floor(absoluto / MILESIMAS_POR_UNIDAD);
  if (unidad === 'UND') {
    return `${signo}${agruparMiles(enteros)}`;
  }
  const decimales = String(absoluto % MILESIMAS_POR_UNIDAD).padStart(3, '0');
  return `${signo}${agruparMiles(enteros)}.${decimales}`;
}

/**
 * Convierte el texto escrito por el usuario en milésimas.
 *
 * Acepta punto como separador decimal e ignora las comas de miles. Para UND
 * exige un número entero.
 *
 * @param texto - Texto escrito, p. ej. `1.5`, `2`, `1,250.250`.
 * @param unidad - Unidad de medida del producto.
 * @returns La cantidad en milésimas, o `null` si el texto no es válido.
 *
 * @example
 * leerCantidad('1.5', 'KG'); // 1500
 * leerCantidad('2', 'UND');  // 2000
 * leerCantidad('1.5', 'UND'); // null
 */
export function leerCantidad(texto: string, unidad: UnidadMedida): number | null {
  const limpio = texto.trim().replace(/,/g, '');
  const coincidencia = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(limpio);
  if (!coincidencia) {
    return null;
  }
  const [, signo = '', enteros = '0', decimales = ''] = coincidencia;
  if (unidad === 'UND' && decimales !== '' && Number(decimales) !== 0) {
    return null;
  }
  const valor = Number(enteros) * MILESIMAS_POR_UNIDAD + Number(decimales.padEnd(3, '0'));
  if (!Number.isSafeInteger(valor)) {
    return null;
  }
  return signo === '-' ? -valor : valor;
}
