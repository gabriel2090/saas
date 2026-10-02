import { read, utils, write, type WorkBook } from 'xlsx';
import type { ErrorFila, FilaImportacion, FormatoNumerico } from '../../shared/importacion';

/**
 * Celda leída: texto, o número si en Excel la celda es numérica (D-40).
 */
export type CeldaLeida = string | number;

/**
 * Hoja leída de un archivo: encabezados (primera fila) y filas de datos.
 */
export interface HojaLeida {
  /** Encabezados de la primera fila (texto, vacío si la celda lo está). */
  encabezados: string[];
  /** Filas de datos con su número real en la hoja. */
  filas: { numero: number; celdas: CeldaLeida[] }[];
}

/**
 * Cifras significativas con que se toma un número de Excel: quita el ruido
 * de coma flotante de las fórmulas (`12.300000000000001` → `12.3`).
 */
const CIFRAS_EXCEL = 15;

/**
 * Escribe el valor de una celda numérica de Excel en el formato elegido,
 * sin separador de miles, para que se lea tal cual (D-40).
 *
 * @param valor - Número de la celda.
 * @param formato - Formato numérico elegido.
 * @returns Texto como `12.5` (punto decimal) o `12,5` (coma decimal).
 *
 * @example
 * textoNumero(13200, 'coma-decimal'); // '13200'
 * textoNumero(12.5, 'coma-decimal');  // '12,5'
 */
export function textoNumero(valor: number, formato: FormatoNumerico): string {
  const texto = String(Number(valor.toPrecision(CIFRAS_EXCEL)));
  return formato === 'coma-decimal' ? texto.replace('.', ',') : texto;
}

/**
 * Libro abierto con los nombres de sus hojas.
 */
export interface LibroLeido {
  /** Libro de SheetJS. */
  libro: WorkBook;
  /** Nombres de las hojas en orden. */
  hojas: string[];
}

/**
 * Decodifica un CSV: primero como UTF-8 y, si no es válido, como Windows-1252
 * (el formato en que Excel en español guarda «CSV delimitado por comas»).
 *
 * @param bytes - Contenido del archivo.
 * @returns Texto del archivo.
 *
 * @example
 * decodificarCsv(new TextEncoder().encode('Código;Nombre')); // 'Código;Nombre'
 */
export function decodificarCsv(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/**
 * Abre un archivo CSV o de Excel.
 *
 * En los CSV no se interpretan los valores (`raw`): así una identificación
 * como `001234` no pierde los ceros y los números se leen como se escribieron.
 *
 * @param nombre - Nombre del archivo (define si es CSV por la extensión).
 * @param bytes - Contenido del archivo.
 * @returns El libro y sus hojas.
 * @throws {Error} Si el archivo no se puede leer como hoja de cálculo.
 */
export function abrirLibro(nombre: string, bytes: Uint8Array): LibroLeido {
  const libro = /\.csv$/i.test(nombre)
    ? read(decodificarCsv(bytes), { type: 'string', raw: true })
    : read(bytes, { type: 'array' });
  return { libro, hojas: libro.SheetNames };
}

/**
 * Convierte el valor crudo de una celda en una celda leída. Los números de
 * Excel se conservan como número (su valor, no su formato en pantalla).
 *
 * @param valor - Valor crudo de la celda.
 * @returns Número, o texto sin espacios sobrantes.
 */
function leerCelda(valor: unknown): CeldaLeida {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? valor : '';
  }
  return textoCelda(valor);
}

/**
 * Convierte el valor de una celda en texto (encabezados y celdas no numéricas).
 *
 * @param valor - Valor crudo de la celda.
 * @returns Texto sin espacios sobrantes.
 */
function textoCelda(valor: unknown): string {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? String(valor) : '';
  }
  if (typeof valor === 'string') {
    return valor.trim();
  }
  if (typeof valor === 'boolean') {
    return valor ? 'SI' : 'NO';
  }
  return '';
}

/**
 * Lee una hoja: la primera fila son los encabezados; las filas vacías se
 * omiten pero los números de fila siguen siendo los de la hoja, para que el
 * usuario encuentre cada error en su archivo.
 *
 * @param libro - Libro abierto.
 * @param hoja - Nombre de la hoja.
 * @returns Encabezados y filas.
 * @throws {Error} Si la hoja no existe.
 */
export function leerHoja(libro: WorkBook, hoja: string): HojaLeida {
  const datos = libro.Sheets[hoja];
  if (!datos) {
    throw new Error(`La hoja «${hoja}» no existe.`);
  }
  const primeraFila = datos['!ref'] ? utils.decode_range(datos['!ref']).s.r + 1 : 1;
  const matriz = utils.sheet_to_json<unknown[]>(datos, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: true,
  });
  const [encabezados = [], ...resto] = matriz;
  const filas: HojaLeida['filas'] = [];
  resto.forEach((fila, i) => {
    const celdas = fila.map(leerCelda);
    if (celdas.some((c) => c !== '')) {
      filas.push({ numero: primeraFila + i + 1, celdas });
    }
  });
  return { encabezados: encabezados.map(textoCelda), filas };
}

/**
 * Arma las filas a importar según la columna asignada a cada campo. Las
 * celdas numéricas se escriben en el formato elegido para que el proceso
 * principal las lea tal cual, sin importar el formato de las celdas de texto.
 *
 * @param hoja - Hoja leída.
 * @param mapeo - Campo → índice de columna (o `null` si no se asignó).
 * @param formato - Formato numérico elegido por el usuario.
 * @returns Filas con solo los campos asignados.
 *
 * @example
 * armarFilas({ encabezados: ['Cod', 'Costo'], filas: [{ numero: 2, celdas: ['7', 12.5] }] },
 *            { codigo: 0, costo: 1 }, 'coma-decimal');
 * // [{ numero: 2, valores: { codigo: '7', costo: '12,5' } }]
 */
export function armarFilas(
  hoja: HojaLeida,
  mapeo: Readonly<Record<string, number | null>>,
  formato: FormatoNumerico,
): FilaImportacion[] {
  return hoja.filas.map(({ numero, celdas }) => {
    const valores: Record<string, string> = {};
    for (const [campo, indice] of Object.entries(mapeo)) {
      if (indice !== null) {
        const celda = celdas[indice] ?? '';
        valores[campo] = typeof celda === 'number' ? textoNumero(celda, formato) : celda;
      }
    }
    return { numero, valores };
  });
}

/**
 * Crea el reporte de errores en XLSX: una fila por error con el número de
 * fila, el campo, el mensaje y los datos originales de esa fila.
 *
 * @param errores - Errores de la validación o la importación.
 * @param hoja - Hoja leída (para copiar los datos originales).
 * @param etiquetas - Campo → nombre en pantalla.
 * @returns Contenido del archivo XLSX.
 */
export function crearReporteErrores(
  errores: readonly ErrorFila[],
  hoja: HojaLeida,
  etiquetas: Readonly<Record<string, string>>,
): Uint8Array {
  const porNumero = new Map(hoja.filas.map((f) => [f.numero, f.celdas]));
  const filas = [
    ['Fila', 'Campo', 'Error', ...hoja.encabezados],
    ...errores.map((e) => [
      e.fila,
      e.campo === null ? '' : (etiquetas[e.campo] ?? e.campo),
      e.mensaje,
      ...(porNumero.get(e.fila) ?? []),
    ]),
  ];
  const libro = utils.book_new();
  utils.book_append_sheet(libro, utils.aoa_to_sheet(filas), 'Errores');
  return new Uint8Array(write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}
