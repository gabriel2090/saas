import { ErrorDeNegocio } from './errores';

/**
 * Milisegundos de un día, para la aritmética de fechas sin hora.
 */
const MS_POR_DIA = 86_400_000;

/**
 * Plazo máximo en días de una factura (casi tres años): un número mayor es
 * casi seguro un error de digitación.
 */
export const PLAZO_MAXIMO_DIAS = 999;

/**
 * Patrón de una fecha sin hora: `AAAA-MM-DD`.
 */
const PATRON_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Convierte una fecha `AAAA-MM-DD` en milisegundos UTC de su medianoche. Se
 * trabaja en UTC para que sumar días no dependa del horario del equipo.
 *
 * @param fecha - Fecha sin hora.
 * @returns Milisegundos, o `null` si la fecha no existe (p. ej. 2026-02-30).
 */
function aMilisegundos(fecha: string): number | null {
  const m = PATRON_FECHA.exec(fecha);
  if (!m) {
    return null;
  }
  const [, anio = '', mes = '', dia = ''] = m;
  const ms = Date.UTC(Number(anio), Number(mes) - 1, Number(dia));
  const comprobada = new Date(ms);
  // Date.UTC acepta «30 de febrero» y lo corre a marzo: se compara de vuelta.
  if (
    comprobada.getUTCFullYear() !== Number(anio) ||
    comprobada.getUTCMonth() !== Number(mes) - 1 ||
    comprobada.getUTCDate() !== Number(dia)
  ) {
    return null;
  }
  return ms;
}

/**
 * Convierte milisegundos UTC de medianoche en `AAAA-MM-DD`.
 *
 * @param ms - Milisegundos.
 * @returns Fecha sin hora.
 */
function deMilisegundos(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Indica si un texto es una fecha `AAAA-MM-DD` que existe en el calendario.
 *
 * @param fecha - Texto a revisar.
 * @returns `true` si es válida.
 *
 * @example
 * esFechaValida('2026-02-28'); // true
 * esFechaValida('2026-02-30'); // false
 */
export function esFechaValida(fecha: string): boolean {
  return aMilisegundos(fecha) !== null;
}

/**
 * Toma el día de una fecha ISO con hora y desfase (D-06), tal como se escribió:
 * el día local del negocio.
 *
 * @param iso - Fecha ISO, p. ej. `2026-10-02T01:49:00.000-05:00`.
 * @returns `AAAA-MM-DD`.
 * @throws {RangeError} Si el texto no empieza por una fecha válida.
 */
export function diaDeIso(iso: string): string {
  const dia = iso.slice(0, 10);
  if (!esFechaValida(dia)) {
    throw new RangeError(`Fecha inválida: «${iso}».`);
  }
  return dia;
}

/**
 * Suma días a una fecha sin hora.
 *
 * @param fecha - Fecha `AAAA-MM-DD`.
 * @param dias - Días a sumar (pueden ser negativos).
 * @returns La fecha resultante.
 * @throws {RangeError} Si la fecha no es válida.
 *
 * @example
 * sumarDias('2026-10-02', 30); // '2026-11-01'
 */
export function sumarDias(fecha: string, dias: number): string {
  const ms = aMilisegundos(fecha);
  if (ms === null) {
    throw new RangeError(`Fecha inválida: «${fecha}».`);
  }
  return deMilisegundos(ms + dias * MS_POR_DIA);
}

/**
 * Primer día del mes anterior a una fecha: inicio del periodo por defecto
 * del kardex y del estado de cuenta.
 *
 * @param hoy - Fecha `AAAA-MM-DD`.
 * @returns `AAAA-MM-01` del mes anterior.
 * @throws {RangeError} Si la fecha no es válida.
 *
 * @example
 * primerDiaMesAnterior('2026-10-04'); // '2026-09-01'
 * primerDiaMesAnterior('2026-01-31'); // '2025-12-01'
 */
export function primerDiaMesAnterior(hoy: string): string {
  return `${sumarDias(`${hoy.slice(0, 8)}01`, -1).slice(0, 8)}01`;
}

/**
 * Días que van de una fecha a otra (positivo si `hasta` es posterior).
 *
 * @param desde - Fecha inicial.
 * @param hasta - Fecha final.
 * @returns Días de diferencia.
 * @throws {RangeError} Si alguna fecha no es válida.
 *
 * @example
 * diasEntre('2026-10-02', '2026-10-05'); // 3
 * diasEntre('2026-10-02', '2026-09-19'); // -13
 */
export function diasEntre(desde: string, hasta: string): number {
  const a = aMilisegundos(desde);
  const b = aMilisegundos(hasta);
  if (a === null || b === null) {
    throw new RangeError(`Fechas inválidas: «${desde}», «${hasta}».`);
  }
  return Math.round((b - a) / MS_POR_DIA);
}

/**
 * Valida la fecha de un documento escrita por el usuario: debe existir y no
 * puede ser futura (D-55, D-71).
 *
 * @param fecha - Fecha `AAAA-MM-DD`.
 * @param hoy - Día de hoy `AAAA-MM-DD`.
 * @returns La misma fecha.
 * @throws {ErrorDeNegocio} Si no es válida o es posterior a hoy.
 */
export function validarFechaDocumento(fecha: string, hoy: string): string {
  if (!esFechaValida(fecha)) {
    throw new ErrorDeNegocio('VALIDACION', 'La fecha no es válida: use el formato dd/mm/aaaa.');
  }
  if (diasEntre(hoy, fecha) > 0) {
    throw new ErrorDeNegocio('VALIDACION', 'La fecha no puede ser posterior a hoy.');
  }
  return fecha;
}

/**
 * Valida el plazo en días de una factura.
 *
 * @param plazo - Plazo escrito.
 * @returns El mismo plazo.
 * @throws {ErrorDeNegocio} Si no es un entero entre 0 y {@link PLAZO_MAXIMO_DIAS}.
 */
export function validarPlazo(plazo: number): number {
  if (!Number.isSafeInteger(plazo) || plazo < 0 || plazo > PLAZO_MAXIMO_DIAS) {
    throw new ErrorDeNegocio(
      'VALIDACION',
      `El plazo debe ser un número entero de días entre 0 y ${PLAZO_MAXIMO_DIAS}.`,
    );
  }
  return plazo;
}

/**
 * Calcula el vencimiento de una factura: fecha + plazo en días (§6).
 *
 * @param fecha - Fecha de la factura.
 * @param plazo - Plazo en días.
 * @returns Fecha de vencimiento.
 * @throws {RangeError} Si la fecha no es válida.
 *
 * @example
 * calcularVencimiento('2026-10-02', 30); // '2026-11-01'
 */
export function calcularVencimiento(fecha: string, plazo: number): string {
  return sumarDias(fecha, plazo);
}

/**
 * Describe el vencimiento de una factura con saldo, como se muestra en la
 * lista de facturas pendientes.
 *
 * @param vence - Fecha de vencimiento.
 * @param hoy - Día de hoy.
 * @returns Texto y si está vencida.
 *
 * @example
 * textoVencimiento('2026-09-19', '2026-10-02'); // { texto: 'Vencida hace 13 días', vencida: true }
 * textoVencimiento('2026-10-02', '2026-10-02'); // { texto: 'Vence hoy', vencida: false }
 * textoVencimiento('2026-10-03', '2026-10-02'); // { texto: 'Vence mañana', vencida: false }
 */
export function textoVencimiento(vence: string, hoy: string): { texto: string; vencida: boolean } {
  const dias = diasEntre(hoy, vence);
  if (dias < 0) {
    const atraso = -dias;
    return { texto: `Vencida hace ${atraso} ${atraso === 1 ? 'día' : 'días'}`, vencida: true };
  }
  if (dias === 0) {
    return { texto: 'Vence hoy', vencida: false };
  }
  if (dias === 1) {
    return { texto: 'Vence mañana', vencida: false };
  }
  return { texto: `Vence en ${dias} días`, vencida: false };
}
