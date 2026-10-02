/**
 * Alfabeto de la clave de recuperación: 32 símbolos sin los que se confunden
 * al copiarlos a mano (sin I, O, 0 ni 1). Con 32 símbolos cada uno aporta
 * exactamente 5 bits, así que un byte aleatorio se reparte sin sesgo.
 */
export const ALFABETO_CLAVE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Cantidad de símbolos de la clave (24 × 5 bits = 120 bits de azar).
 */
export const LARGO_CLAVE = 24;

/**
 * Símbolos por grupo al mostrarla (`ABCD-EFGH-…`).
 */
const TAMANO_GRUPO = 4;

/**
 * Genera una clave de recuperación a partir de bytes aleatorios.
 *
 * El azar se recibe como parámetro para que la regla sea pura y se pueda
 * probar; en producción se le pasa `crypto.randomBytes(LARGO_CLAVE)`.
 *
 * @param bytesAleatorios - Al menos {@link LARGO_CLAVE} bytes aleatorios.
 * @returns Clave en grupos de 4 separados por guion.
 * @throws {RangeError} Si no hay suficientes bytes.
 *
 * @example
 * generarClaveRecuperacion(new Uint8Array(24)); // 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA'
 */
export function generarClaveRecuperacion(bytesAleatorios: Uint8Array): string {
  if (bytesAleatorios.length < LARGO_CLAVE) {
    throw new RangeError(`Se necesitan ${LARGO_CLAVE} bytes aleatorios.`);
  }
  let compacta = '';
  for (let i = 0; i < LARGO_CLAVE; i++) {
    // 256 es múltiplo de 32: tomar los 5 bits bajos no favorece ningún símbolo.
    compacta += ALFABETO_CLAVE[(bytesAleatorios[i] ?? 0) & 31];
  }
  return formatearClaveRecuperacion(compacta);
}

/**
 * Agrupa una clave compacta en bloques de 4 separados por guion.
 *
 * @param compacta - Clave sin separadores.
 * @returns Clave agrupada.
 *
 * @example
 * formatearClaveRecuperacion('ABCDEFGH'); // 'ABCD-EFGH'
 */
export function formatearClaveRecuperacion(compacta: string): string {
  const grupos: string[] = [];
  for (let i = 0; i < compacta.length; i += TAMANO_GRUPO) {
    grupos.push(compacta.slice(i, i + TAMANO_GRUPO));
  }
  return grupos.join('-');
}

/**
 * Convierte lo que escribe el usuario a la forma compacta con que se guarda
 * el hash: ignora espacios, guiones y mayúsculas/minúsculas.
 *
 * @param texto - Clave escrita por el usuario.
 * @returns La clave compacta en mayúsculas, o `null` si no tiene el largo o
 *   los símbolos de una clave válida.
 *
 * @example
 * normalizarClaveRecuperacion(' abcd-efgh-jkmn-pqrs-tuvw-xyz2 '); // 'ABCDEFGHJKMNPQRSTUVWXYZ2'
 * normalizarClaveRecuperacion('1234'); // null
 */
export function normalizarClaveRecuperacion(texto: string): string | null {
  const compacta = texto.replace(/[\s-]/g, '').toUpperCase();
  if (compacta.length !== LARGO_CLAVE) {
    return null;
  }
  for (const simbolo of compacta) {
    if (!ALFABETO_CLAVE.includes(simbolo)) {
      return null;
    }
  }
  return compacta;
}
