/**
 * Texto que se muestra cuando no hay porcentaje (costo en cero, D-32).
 */
export const SIN_PORCENTAJE = '—';

/**
 * Formatea un porcentaje guardado en décimas de punto porcentual, con un
 * decimal y punto decimal (como las cantidades, D-13).
 *
 * @param decimas - Décimas de porcentaje (174 = 17.4 %), o `null` si no aplica.
 * @returns Texto como `17.4 %`, `-1.5 %` o `—`.
 *
 * @example
 * formatearPorcentaje(174);  // '17.4 %'
 * formatearPorcentaje(-15);  // '-1.5 %'
 * formatearPorcentaje(null); // '—'
 */
export function formatearPorcentaje(decimas: number | null): string {
  if (decimas === null) {
    return SIN_PORCENTAJE;
  }
  const signo = decimas < 0 ? '-' : '';
  const absoluto = Math.abs(decimas);
  return `${signo}${Math.floor(absoluto / 10)}.${absoluto % 10} %`;
}
