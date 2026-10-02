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
