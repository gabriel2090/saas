import { utils, write, type CellObject, type WorkSheet } from 'xlsx';
import { diasEntre } from '../../domain/calendario';
import { MILESIMAS_POR_UNIDAD } from '../../shared/formato/cantidades';
import { formatearFechaHora } from '../../shared/formato/fechas';
import type { ReporteCartera, ReporteInventario } from '../../shared/reportes';

/**
 * Formato de Excel de los valores en pesos: miles con separador y sin decimales.
 */
const FORMATO_PESOS = '#,##0';

/**
 * Formato de Excel de las cantidades en kilogramos (tres decimales, D-13).
 */
const FORMATO_KG = '#,##0.000';

/**
 * Formato de Excel de las fechas.
 */
const FORMATO_FECHA = 'dd/mm/yyyy';

/**
 * Celda a escribir: texto, número con formato o fecha `AAAA-MM-DD`.
 */
type Celda = string | { n: number; z?: string } | { fecha: string };

/**
 * Número de serie de Excel de una fecha sin hora (días desde el 30/12/1899).
 * Se calcula sin `Date` local para que no dependa de la zona del equipo.
 *
 * @param fecha - Fecha `AAAA-MM-DD`.
 * @returns Número de serie.
 *
 * @example
 * serieExcel('2026-10-04'); // 46299
 */
export function serieExcel(fecha: string): number {
  return diasEntre('1899-12-30', fecha);
}

/**
 * Valor en pesos como celda numérica.
 *
 * @param valor - Pesos enteros.
 * @returns Celda.
 */
function pesos(valor: number): Celda {
  return { n: valor, z: FORMATO_PESOS };
}

/**
 * Convierte una celda a la representación de SheetJS.
 *
 * @param celda - Celda a escribir.
 * @returns Celda de SheetJS.
 */
function aCelda(celda: Celda): CellObject {
  if (typeof celda === 'string') {
    return { t: 's', v: celda };
  }
  if ('fecha' in celda) {
    return { t: 'n', v: serieExcel(celda.fecha), z: FORMATO_FECHA };
  }
  return celda.z === undefined ? { t: 'n', v: celda.n } : { t: 'n', v: celda.n, z: celda.z };
}

/**
 * Arma una hoja: tres renglones de título (nombre, corte y filtros), una
 * fila en blanco, los encabezados y los datos, con el filtro automático de
 * Excel sobre la tabla.
 *
 * @param titulo - Nombre del reporte.
 * @param corte - Momento del corte (ISO).
 * @param filtros - Filtros en palabras.
 * @param encabezados - Encabezados de columna.
 * @param filas - Filas de datos.
 * @param anchos - Ancho de cada columna en caracteres.
 * @returns Hoja de SheetJS.
 */
function armarHoja(
  titulo: string,
  corte: string,
  filtros: string,
  encabezados: readonly string[],
  filas: readonly (readonly Celda[])[],
  anchos: readonly number[],
): WorkSheet {
  const renglones: (readonly Celda[])[] = [
    [titulo],
    [`Corte: ${formatearFechaHora(corte)}`],
    [filtros],
    [],
    encabezados,
    ...filas,
  ];
  const hoja = utils.aoa_to_sheet(renglones.map((r) => r.map(aCelda)));
  const filaEncabezado = 4;
  const ultimaFila = filaEncabezado + filas.length;
  hoja['!autofilter'] = {
    ref: utils.encode_range({
      s: { r: filaEncabezado, c: 0 },
      e: { r: ultimaFila, c: encabezados.length - 1 },
    }),
  };
  hoja['!cols'] = anchos.map((wch) => ({ wch }));
  return hoja;
}

/**
 * Convierte un libro a bytes XLSX.
 *
 * @param hojas - Nombre y hoja, en orden.
 * @returns Contenido del archivo.
 */
function libroXlsx(hojas: readonly [string, WorkSheet][]): Uint8Array {
  const libro = utils.book_new();
  for (const [nombre, hoja] of hojas) {
    utils.book_append_sheet(libro, hoja, nombre);
  }
  return new Uint8Array(write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

/**
 * Exporta el inventario valorizado a Excel (D-145): una fila por producto con
 * una columna por bodega; cantidades y valores como números.
 *
 * @param reporte - Reporte calculado.
 * @param filtros - Filtros en palabras.
 * @returns Contenido del archivo XLSX.
 */
export function inventarioXlsx(reporte: ReporteInventario, filtros: string): Uint8Array {
  const cantidad = (milesimas: number, unidad: 'UND' | 'KG'): Celda => ({
    n: milesimas / MILESIMAS_POR_UNIDAD,
    z: unidad === 'KG' ? FORMATO_KG : FORMATO_PESOS,
  });
  const filas = reporte.filas.map((f): Celda[] => [
    { n: f.codigo },
    f.nombre,
    f.unidad,
    f.proveedorNombre,
    f.activo ? 'Sí' : 'No',
    ...f.porBodega.map((c) => cantidad(c, f.unidad)),
    cantidad(f.existencia, f.unidad),
    pesos(f.costo),
    pesos(f.valor),
    pesos(f.valorNegativo),
  ]);
  const r = reporte.resumen;
  filas.push([
    `Total · ${reporte.filas.length} productos`,
    '',
    '',
    '',
    '',
    ...reporte.bodegas.map(() => ''),
    '',
    '',
    pesos(r.valorTotal),
    pesos(r.valorNegativo),
  ]);
  const encabezados = [
    'Código',
    'Producto',
    'Und',
    'Proveedor',
    'Activo',
    ...reporte.bodegas.map((b) => b.nombre),
    'Existencia total',
    'Costo unitario',
    'Valor a costo',
    'Valor negativo (no suma)',
  ];
  const anchos = [9, 40, 6, 30, 7, ...reporte.bodegas.map(() => 13), 14, 13, 15, 16];
  return libroXlsx([
    [
      'Inventario',
      armarHoja('Inventario valorizado', reporte.corte, filtros, encabezados, filas, anchos),
    ],
  ]);
}

/**
 * Exporta las cuentas por cobrar o por pagar a Excel (D-145): la hoja
 * «Documentos» con una fila por documento y la hoja «Por cliente» o «Por
 * proveedor» con el subtotal de cada tercero.
 *
 * @param reporte - Reporte calculado.
 * @param titulo - «Cuentas por cobrar» o «Cuentas por pagar».
 * @param filtros - Filtros en palabras.
 * @returns Contenido del archivo XLSX.
 */
export function carteraXlsx(reporte: ReporteCartera, titulo: string, filtros: string): Uint8Array {
  const cliente = reporte.tipo === 'cliente';
  const tercero = cliente ? 'Cliente' : 'Proveedor';
  const documentos = reporte.grupos.flatMap((g) =>
    g.documentos.map((d): Celda[] => [
      { n: g.tercero.codigo },
      g.tercero.nombre,
      g.tercero.identificacion,
      { n: d.numero },
      ...(cliente ? [] : [d.referencia]),
      d.saldoInicial ? 'Sí' : 'No',
      { fecha: d.fecha },
      { fecha: d.vence },
      d.vencida ? 'Vencida' : 'Por vencer',
      { n: d.dias },
      pesos(d.total),
      pesos(d.abonado),
      pesos(d.devuelto),
      pesos(d.saldo),
    ]),
  );
  const encabezadosDocumentos = [
    'Código',
    tercero,
    'Identificación',
    cliente ? 'Factura' : 'Compra',
    ...(cliente ? [] : ['Factura del proveedor']),
    'Saldo inicial',
    'Fecha',
    'Vence',
    'Estado',
    'Días (vencida o por vencer)',
    'Total',
    cliente ? 'Abonado' : 'Pagado',
    'Devuelto / corregido',
    'Saldo',
  ];
  const anchosDocumentos = [
    9,
    34,
    18,
    10,
    ...(cliente ? [] : [18]),
    8,
    11,
    11,
    11,
    12,
    13,
    13,
    13,
    13,
  ];

  const r = reporte.resumen;
  const porTercero = reporte.grupos.map((g): Celda[] => [
    { n: g.tercero.codigo },
    g.tercero.nombre,
    g.tercero.identificacion,
    g.tercero.celular,
    { n: g.documentos.length },
    pesos(g.saldo),
    pesos(g.vencido),
    pesos(g.saldo - g.vencido),
    pesos(g.saldoFavor),
    pesos(g.neto),
  ]);
  porTercero.push([
    `Total · ${r.terceros} ${cliente ? 'clientes' : 'proveedores'}`,
    '',
    '',
    '',
    { n: r.documentosVencidos + r.documentosPorVencer },
    pesos(r.total),
    pesos(r.vencido),
    pesos(r.porVencer),
    pesos(r.saldoFavor),
    pesos(r.neto),
  ]);
  const encabezadosTercero = [
    'Código',
    tercero,
    'Identificación',
    'Celular',
    'Documentos',
    'Saldo',
    'Vencido',
    'Por vencer',
    'Saldo a favor',
    'Neto',
  ];
  return libroXlsx([
    [
      'Documentos',
      armarHoja(
        titulo,
        reporte.corte,
        filtros,
        encabezadosDocumentos,
        documentos,
        anchosDocumentos,
      ),
    ],
    [
      `Por ${tercero.toLowerCase()}`,
      armarHoja(
        titulo,
        reporte.corte,
        filtros,
        encabezadosTercero,
        porTercero,
        [9, 34, 18, 14, 11, 13, 13, 13, 13, 13],
      ),
    ],
  ]);
}
