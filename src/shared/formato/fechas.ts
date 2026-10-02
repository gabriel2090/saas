/**
 * Expresión que reconoce una fecha ISO 8601 con hora, opcionalmente con
 * milisegundos y desfase horario. Se usa para leer las partes tal como se
 * guardaron, sin reinterpretarlas en la zona horaria del equipo.
 */
const PATRON_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?/;

/**
 * Rellena un número con ceros a la izquierda.
 *
 * @param valor - Número a rellenar.
 * @param largo - Largo total deseado.
 * @returns El número como texto con ceros a la izquierda.
 */
function rellenar(valor: number, largo = 2): string {
  return String(valor).padStart(largo, '0');
}

/**
 * Genera la fecha y hora en ISO 8601 con el desfase horario local (D-06),
 * p. ej. `2026-10-01T23:30:00.000-05:00`. Así el «día» de un documento es el
 * día local del negocio y no el de UTC.
 *
 * @param fecha - Momento a convertir (por defecto, ahora).
 * @returns Texto ISO 8601 con desfase local.
 */
export function aIsoLocal(fecha: Date = new Date()): string {
  const desfaseMin = -fecha.getTimezoneOffset();
  const signo = desfaseMin >= 0 ? '+' : '-';
  const abs = Math.abs(desfaseMin);
  return (
    `${fecha.getFullYear()}-${rellenar(fecha.getMonth() + 1)}-${rellenar(fecha.getDate())}` +
    `T${rellenar(fecha.getHours())}:${rellenar(fecha.getMinutes())}:${rellenar(fecha.getSeconds())}` +
    `.${rellenar(fecha.getMilliseconds(), 3)}${signo}${rellenar(Math.floor(abs / 60))}:${rellenar(abs % 60)}`
  );
}

/**
 * Extrae las partes de una fecha ISO tal como fueron escritas.
 *
 * @param iso - Fecha ISO 8601.
 * @returns Año, mes, día, hora, minuto y segundo.
 * @throws {RangeError} Si el texto no es una fecha ISO válida.
 */
function partesIso(iso: string): {
  anio: string;
  mes: string;
  dia: string;
  hora: number;
  minuto: string;
  segundo: string;
} {
  const m = PATRON_ISO.exec(iso);
  if (!m) {
    throw new RangeError(`Fecha inválida: «${iso}».`);
  }
  const [, anio = '', mes = '', dia = '', hora = '00', minuto = '00', segundo = '00'] = m;
  return { anio, mes, dia, hora: Number(hora), minuto, segundo };
}

/**
 * Formatea una fecha ISO como `dd/mm/aaaa`.
 *
 * @param iso - Fecha ISO 8601.
 * @returns Texto como `01/10/2026`.
 * @throws {RangeError} Si el texto no es una fecha ISO válida.
 */
export function formatearFecha(iso: string): string {
  const { anio, mes, dia } = partesIso(iso);
  return `${dia}/${mes}/${anio}`;
}

/**
 * Formatea la hora de una fecha ISO en formato de 12 horas.
 *
 * @param iso - Fecha ISO 8601 con hora.
 * @returns Texto como `11:30 p. m.` o `12:05 a. m.`.
 * @throws {RangeError} Si el texto no es una fecha ISO válida.
 *
 * @example
 * formatearHora('2026-10-01T23:30:00-05:00'); // '11:30 p. m.'
 * formatearHora('2026-10-01T00:05:00-05:00'); // '12:05 a. m.'
 */
export function formatearHora(iso: string): string {
  const { hora, minuto } = partesIso(iso);
  const sufijo = hora < 12 ? 'a. m.' : 'p. m.';
  const hora12 = hora % 12 === 0 ? 12 : hora % 12;
  return `${hora12}:${minuto} ${sufijo}`;
}

/**
 * Formatea una fecha ISO como `dd/mm/aaaa hh:mm a. m./p. m.`.
 *
 * @param iso - Fecha ISO 8601 con hora.
 * @returns Fecha y hora legibles.
 * @throws {RangeError} Si el texto no es una fecha ISO válida.
 */
export function formatearFechaHora(iso: string): string {
  return `${formatearFecha(iso)} ${formatearHora(iso)}`;
}

/**
 * Formatea una fecha ISO como la imprime la tirilla actual del negocio (F-03):
 * `dd/mm/aaaa hh:mm:ss AM/PM`, con la hora en dos dígitos.
 *
 * @param iso - Fecha ISO 8601 con hora.
 * @returns Texto como `30/09/2026 05:26:36 PM`.
 * @throws {RangeError} Si el texto no es una fecha ISO válida.
 *
 * @example
 * formatearFechaHoraTirilla('2026-09-30T17:26:36-05:00'); // '30/09/2026 05:26:36 PM'
 */
export function formatearFechaHoraTirilla(iso: string): string {
  const { hora, minuto, segundo } = partesIso(iso);
  const hora12 = hora % 12 === 0 ? 12 : hora % 12;
  const sufijo = hora < 12 ? 'AM' : 'PM';
  return `${formatearFecha(iso)} ${rellenar(hora12)}:${minuto}:${segundo} ${sufijo}`;
}

/**
 * Lee una fecha escrita en pantalla como `dd/mm/aaaa` (día y mes pueden ir
 * con un dígito) y la convierte al formato de la base de datos.
 *
 * @param texto - Fecha escrita.
 * @returns Fecha `AAAA-MM-DD`, o `null` si no es una fecha del calendario.
 *
 * @example
 * leerFecha('2/10/2026');  // '2026-10-02'
 * leerFecha('31/02/2026'); // null
 */
export function leerFecha(texto: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto.trim());
  if (!m) {
    return null;
  }
  const [, dia = '', mes = '', anio = ''] = m;
  const fecha = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia)));
  if (
    fecha.getUTCFullYear() !== Number(anio) ||
    fecha.getUTCMonth() !== Number(mes) - 1 ||
    fecha.getUTCDate() !== Number(dia)
  ) {
    return null;
  }
  return `${anio}-${rellenar(Number(mes))}-${rellenar(Number(dia))}`;
}
