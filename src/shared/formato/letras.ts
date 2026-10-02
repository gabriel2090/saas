/**
 * Nombres de las unidades del 0 al 29, que en español son palabras propias.
 */
const HASTA_VEINTINUEVE: readonly string[] = [
  'CERO',
  'UNO',
  'DOS',
  'TRES',
  'CUATRO',
  'CINCO',
  'SEIS',
  'SIETE',
  'OCHO',
  'NUEVE',
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISÉIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
  'VEINTE',
  'VEINTIUNO',
  'VEINTIDÓS',
  'VEINTITRÉS',
  'VEINTICUATRO',
  'VEINTICINCO',
  'VEINTISÉIS',
  'VEINTISIETE',
  'VEINTIOCHO',
  'VEINTINUEVE',
];

/**
 * Decenas desde el 30 (índice = decena).
 */
const DECENAS: readonly string[] = [
  '',
  '',
  '',
  'TREINTA',
  'CUARENTA',
  'CINCUENTA',
  'SESENTA',
  'SETENTA',
  'OCHENTA',
  'NOVENTA',
];

/**
 * Centenas (índice = centena); el 100 exacto es «CIEN».
 */
const CENTENAS: readonly string[] = [
  '',
  'CIENTO',
  'DOSCIENTOS',
  'TRESCIENTOS',
  'CUATROCIENTOS',
  'QUINIENTOS',
  'SEISCIENTOS',
  'SETECIENTOS',
  'OCHOCIENTOS',
  'NOVECIENTOS',
];

/**
 * Mayor valor que se escribe en letras (casi un billón).
 */
const MAXIMO = 999_999_999_999;

/**
 * Escribe un número de 1 a 999.
 *
 * @param n - Número de 1 a 999.
 * @param apocope - Si «UNO» final se acorta a «UN» (antes de MIL, MILLONES o PESOS).
 * @returns Texto en mayúsculas.
 */
function menorQueMil(n: number, apocope: boolean): string {
  if (n === 100) {
    return 'CIEN';
  }
  const centena = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (centena > 0) {
    partes.push(CENTENAS[centena] ?? '');
  }
  if (resto > 0) {
    let texto: string;
    if (resto < 30) {
      texto = HASTA_VEINTINUEVE[resto] ?? '';
    } else {
      const unidad = resto % 10;
      texto = DECENAS[Math.floor(resto / 10)] ?? '';
      if (unidad > 0) {
        texto += ` Y ${HASTA_VEINTINUEVE[unidad] ?? ''}`;
      }
    }
    if (apocope) {
      texto = texto.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/UNO$/, 'UN');
    }
    partes.push(texto);
  }
  return partes.join(' ');
}

/**
 * Escribe un número de 1 a 999,999.
 *
 * @param n - Número de 1 a 999,999.
 * @param apocope - Si «UNO» final se acorta a «UN».
 * @returns Texto en mayúsculas.
 */
function menorQueMillon(n: number, apocope: boolean): string {
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (miles === 1) {
    partes.push('MIL');
  } else if (miles > 1) {
    partes.push(`${menorQueMil(miles, true)} MIL`);
  }
  if (resto > 0) {
    partes.push(menorQueMil(resto, apocope));
  }
  return partes.join(' ');
}

/**
 * Escribe un valor en pesos con letras, como la línea «SON:» de la factura
 * actual (§7, F-01).
 *
 * @param pesos - Valor en pesos enteros, de 0 a 999,999,999,999.
 * @returns Texto en mayúsculas terminado en «PESOS M/L».
 * @throws {RangeError} Si el valor no es un entero en ese rango.
 *
 * @example
 * pesosEnLetras(79250);   // 'SETENTA Y NUEVE MIL DOSCIENTOS CINCUENTA PESOS M/L'
 * pesosEnLetras(1);       // 'UN PESO M/L'
 * pesosEnLetras(21000);   // 'VEINTIÚN MIL PESOS M/L'
 * pesosEnLetras(2000000); // 'DOS MILLONES DE PESOS M/L'
 */
export function pesosEnLetras(pesos: number): string {
  if (!Number.isSafeInteger(pesos) || pesos < 0 || pesos > MAXIMO) {
    throw new RangeError(`No se puede escribir en letras el valor ${String(pesos)}.`);
  }
  if (pesos === 0) {
    return 'CERO PESOS M/L';
  }
  const millones = Math.floor(pesos / 1_000_000);
  const resto = pesos % 1_000_000;
  const partes: string[] = [];
  if (millones === 1) {
    partes.push('UN MILLÓN');
  } else if (millones > 1) {
    partes.push(`${menorQueMillon(millones, true)} MILLONES`);
  }
  if (resto > 0) {
    partes.push(menorQueMillon(resto, true));
  }
  // «Un millón de pesos», pero «un millón quinientos mil pesos».
  const moneda = resto === 0 ? 'DE PESOS' : pesos === 1 ? 'PESO' : 'PESOS';
  return `${partes.join(' ')} ${moneda} M/L`;
}
