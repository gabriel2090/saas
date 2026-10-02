/**
 * Formatea un valor en pesos enteros con separador de miles por coma y sin
 * decimales, igual que la factura actual (D-02).
 *
 * @param pesos - Valor en pesos enteros (puede ser negativo).
 * @returns Texto como `$ 1,250,000` o `-$ 1,250,000`.
 * @throws {RangeError} Si el valor no es un entero seguro: el dinero nunca se maneja con decimales.
 *
 * @example
 * formatearPesos(1250000); // '$ 1,250,000'
 * formatearPesos(-500);    // '-$ 500'
 */
export function formatearPesos(pesos: number): string {
  if (!Number.isSafeInteger(pesos)) {
    throw new RangeError(`El valor en pesos debe ser un entero; se recibió ${String(pesos)}.`);
  }
  const signo = pesos < 0 ? '-' : '';
  return `${signo}$ ${agruparMiles(Math.abs(pesos))}`;
}

/**
 * Agrupa un entero no negativo en miles separados por coma.
 *
 * Se implementa a mano en lugar de `Intl.NumberFormat` para que el resultado
 * no dependa de la configuración regional de Windows.
 *
 * @param valor - Entero no negativo.
 * @returns Texto con comas cada tres dígitos, p. ej. `1,250,000`.
 */
export function agruparMiles(valor: number): string {
  return String(valor).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Verifica que las comas de un número escrito sean separadores de miles bien
 * puestos (`1,250,000.5`). Así «12,5» (coma decimal) se rechaza en lugar de
 * leerse como 125.
 *
 * @param texto - Número escrito, sin espacios ni signo de pesos.
 * @returns `true` si no tiene comas o si todas agrupan de a tres cifras.
 *
 * @example
 * comasDeMilesValidas('1,250.5'); // true
 * comasDeMilesValidas('12,5');    // false
 */
export function comasDeMilesValidas(texto: string): boolean {
  return !texto.includes(',') || /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(texto);
}

/**
 * Lee un valor en pesos escrito por el usuario o en un archivo. Acepta
 * `13200`, `13,200`, `$ 13,200` y `13200.00`; rechaza centavos distintos de
 * cero porque el dinero se guarda en pesos enteros (§3). La coma es
 * separador de miles (D-02).
 *
 * @param texto - Texto escrito.
 * @returns Pesos enteros, o `null` si no es un valor válido.
 *
 * @example
 * leerPesos('$ 13,200');  // 13200
 * leerPesos('13200.00');  // 13200
 * leerPesos('13200.50');  // null
 * leerPesos('15.000');    // null (ambiguo: ¿quince mil o quince?)
 */
export function leerPesos(texto: string): number | null {
  const sinSimbolos = texto.replace(/[$\s]/g, '');
  if (!comasDeMilesValidas(sinSimbolos)) {
    return null;
  }
  const coincidencia = /^(\d+)(?:\.(\d+))?$/.exec(sinSimbolos.replace(/,/g, ''));
  if (!coincidencia) {
    return null;
  }
  const [, enteros = '', decimales = ''] = coincidencia;
  // «15.000» puede ser quince mil (punto de miles) o quince pesos: se rechaza
  // en lugar de adivinar y guardar un valor mil veces menor (D-40).
  if (decimales.length === 3 && !texto.includes(',')) {
    return null;
  }
  if (decimales !== '' && Number(decimales) !== 0) {
    return null;
  }
  const valor = Number(enteros);
  return Number.isSafeInteger(valor) ? valor : null;
}
