import { textoDias } from '../../domain/reportes';
import { formatearCantidad } from '../../shared/formato/cantidades';
import { formatearFecha, formatearFechaHora } from '../../shared/formato/fechas';
import { agruparMiles, formatearPesos } from '../../shared/formato/moneda';
import type { DatosNegocio } from '../../shared/maestros';
import type { ReporteCartera, ReporteInventario } from '../../shared/reportes';
import { escaparHtml, MARCA_SALDO_INICIAL } from './plantillas';

/**
 * Estilo de la plantilla carta común de los reportes (D-145). El número de
 * página va en el margen inferior con las cajas de margen de `@page`, así
 * sale igual al imprimir y al guardar el PDF (D-156). `thead` se repite en
 * cada hoja.
 *
 * @param pie - Texto del pie de cada hoja (título y corte).
 * @returns Hoja de estilo.
 */
function estiloReporte(pie: string): string {
  // Se quitan comillas, barras y «<» para que el texto no cierre la cadena CSS ni la etiqueta.
  const pieCss = pie.replace(/["\\<>]/g, '');
  return `
  @page {
    size: letter;
    margin: 12mm 12mm 16mm;
    @bottom-left { content: "${pieCss}"; font: 8pt Arial, Helvetica, sans-serif; color: #444; }
    @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 8pt Arial, Helvetica, sans-serif; color: #444; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; color: #000; }
  .encabezado { display: flex; justify-content: space-between; gap: 16px; padding-bottom: 6px; border-bottom: 2px solid #000; }
  .encabezado__negocio { line-height: 1.35; }
  .encabezado__negocio strong { display: block; font-size: 12pt; }
  .encabezado__titulo { text-align: right; line-height: 1.35; }
  .encabezado__titulo strong { display: block; font-size: 13pt; letter-spacing: 1px; }
  .filtros { margin: 6px 0; color: #333; }
  .resumen { display: flex; gap: 6px; margin: 8px 0; }
  .resumen div { flex: 1; padding: 4px 6px; border: 1px solid #000; }
  .resumen strong { display: block; font-size: 10.5pt; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th { padding: 3px 4px; border-top: 1px solid #000; border-bottom: 1px solid #000; text-align: left; }
  td { padding: 2px 4px; border-bottom: 1px dotted #999; }
  .num { text-align: right; white-space: nowrap; }
  .grupo td { padding-top: 6px; border-bottom: 1px solid #000; font-weight: bold; }
  .grupo span { font-weight: normal; }
  .subtotal td { border-bottom: 1px solid #000; font-weight: bold; }
  .total td { border-top: 2px solid #000; border-bottom: none; font-size: 9.5pt; font-weight: bold; }
  .vencida .dias, .negativo { font-weight: bold; }
  .nota { margin-top: 10px; color: #333; }
`;
}

/**
 * Partes de un reporte en hoja carta.
 */
interface PartesReporte {
  /** Datos del negocio (encabezado). */
  negocio: DatosNegocio;
  /** Título en mayúsculas, p. ej. `CUENTAS POR COBRAR`. */
  titulo: string;
  /** Momento del corte (ISO). */
  corte: string;
  /** Filtros aplicados, en palabras. */
  filtros: string;
  /** Cifras del resumen: etiqueta y valor ya formateado. */
  resumen: readonly [string, string][];
  /** HTML de la tabla (ya escapado). */
  tabla: string;
  /** Nota al pie de la tabla. */
  nota: string;
}

/**
 * Arma un reporte completo con la plantilla carta común: encabezado del
 * negocio, título y corte, filtros, resumen, tabla y nota. Sin scripts y con
 * una política de seguridad que solo admite estilos en línea.
 *
 * @param partes - Partes del reporte.
 * @returns Documento HTML.
 */
function documentoReporte(partes: PartesReporte): string {
  const { negocio } = partes;
  const datosNegocio = [
    negocio.nit ? `NIT: ${escaparHtml(negocio.nit)}` : '',
    [negocio.direccion, negocio.telefono].filter(Boolean).map(escaparHtml).join(' · '),
  ]
    .filter(Boolean)
    .map((l) => `<div>${l}</div>`)
    .join('');
  const resumen = partes.resumen
    .map(
      ([etiqueta, valor]) =>
        `<div>${escaparHtml(etiqueta)}<strong>${escaparHtml(valor)}</strong></div>`,
    )
    .join('');
  const pie = `${partes.titulo} · corte ${formatearFechaHora(partes.corte)}`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'" />
<title>${escaparHtml(partes.titulo)}</title>
<style>${estiloReporte(pie)}</style>
</head>
<body>
<div class="encabezado">
  <div class="encabezado__negocio"><strong>${escaparHtml(negocio.nombre || 'NOMBRE DEL NEGOCIO SIN CONFIGURAR')}</strong>${datosNegocio}</div>
  <div class="encabezado__titulo"><strong>${escaparHtml(partes.titulo)}</strong>Corte: ${formatearFechaHora(partes.corte)}</div>
</div>
<div class="filtros">${escaparHtml(partes.filtros)}</div>
<div class="resumen">${resumen}</div>
${partes.tabla}
<div class="nota">${escaparHtml(partes.nota)}</div>
</body>
</html>`;
}

/**
 * Datos para imprimir el reporte de cartera.
 */
export interface DatosImpresionCartera {
  /** Datos del negocio. */
  negocio: DatosNegocio;
  /** Reporte ya calculado. */
  reporte: ReporteCartera;
  /** Filtros aplicados, en palabras. */
  filtros: string;
}

/**
 * Título de cada reporte de cartera.
 */
export const TITULOS_CARTERA = {
  cliente: 'Cuentas por cobrar',
  proveedor: 'Cuentas por pagar',
} as const;

/**
 * Arma el reporte de cuentas por cobrar o por pagar en hoja carta (D-148).
 *
 * @param datos - Negocio, reporte y filtros.
 * @returns Documento HTML.
 */
export function reporteCarteraHtml(datos: DatosImpresionCartera): string {
  const { reporte } = datos;
  const cliente = reporte.tipo === 'cliente';
  const columnas = cliente ? 8 : 9;
  const etiquetaDoc = cliente ? 'facturas' : 'compras';
  const encabezado = `<tr>${cliente ? '<th>Factura</th>' : '<th>Compra</th><th>Factura del proveedor</th>'}
    <th>Fecha</th><th>Vence</th><th class="num">Días</th><th class="num">Total</th>
    <th class="num">${cliente ? 'Abonado' : 'Pagado'}</th><th class="num">Devuelto</th><th class="num">Saldo</th></tr>`;
  const vacias = cliente ? 4 : 5;
  const cuerpo = reporte.grupos
    .map((g) => {
      const t = g.tercero;
      const extra = [
        t.identificacion,
        t.celular,
        t.tope !== null ? `tope ${formatearPesos(t.tope)}` : '',
        g.documentos.length === 0 ? 'sin documentos pendientes' : '',
      ]
        .filter(Boolean)
        .map(escaparHtml)
        .join(' · ');
      const filas = g.documentos
        .map((d) => {
          const marca = d.saldoInicial ? `${MARCA_SALDO_INICIAL} ` : '';
          const documento = cliente
            ? `<td>${marca}${d.numero}</td>`
            : `<td>${marca}${d.numero}</td><td>${escaparHtml(d.referencia)}</td>`;
          return `<tr class="${d.vencida ? 'vencida' : ''}">${documento}<td>${formatearFecha(d.fecha)}</td>
            <td>${formatearFecha(d.vence)}</td><td class="num dias">${textoDias(d)}</td>
            <td class="num">${agruparMiles(d.total)}</td><td class="num">${agruparMiles(d.abonado)}</td>
            <td class="num">${agruparMiles(d.devuelto)}</td><td class="num">${agruparMiles(d.saldo)}</td></tr>`;
        })
        .join('');
      const subtotal = [
        `Saldo ${agruparMiles(g.saldo)}`,
        g.documentos.length > 0 ? `vencido ${agruparMiles(g.vencido)}` : '',
        `a favor ${agruparMiles(g.saldoFavor)}`,
        g.saldoFavor > 0 && g.saldo > 0 ? `neto ${agruparMiles(g.neto)}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      return `<tr class="grupo"><td colspan="${columnas}">${t.codigo} - ${escaparHtml(t.nombre)} <span>· ${extra}</span></td></tr>
        ${filas}
        <tr class="subtotal"><td colspan="${vacias}">${subtotal}</td>
        <td></td><td></td><td></td><td class="num">${agruparMiles(g.saldo)}</td></tr>`;
    })
    .join('');
  const r = reporte.resumen;
  const terceros = `${r.terceros} ${cliente ? 'clientes' : 'proveedores'}`;
  const tabla = `<table><thead>${encabezado}</thead><tbody>${cuerpo}
    <tr class="total"><td colspan="${vacias}">Total · ${terceros}</td><td></td><td></td><td></td>
    <td class="num">${agruparMiles(r.total)}</td></tr></tbody></table>`;
  return documentoReporte({
    negocio: datos.negocio,
    titulo: TITULOS_CARTERA[reporte.tipo].toUpperCase(),
    corte: reporte.corte,
    filtros: datos.filtros,
    resumen: [
      [cliente ? 'Total por cobrar' : 'Total por pagar', formatearPesos(r.total)],
      [`Vencido (${r.documentosVencidos} ${etiquetaDoc})`, formatearPesos(r.vencido)],
      [`Por vencer (${r.documentosPorVencer} ${etiquetaDoc})`, formatearPesos(r.porVencer)],
      ['Saldos a favor', formatearPesos(r.saldoFavor)],
      ['Neto', formatearPesos(r.neto)],
    ],
    tabla,
    nota: 'Saldo = total − abonado − devuelto. «Devuelto» incluye devoluciones y correcciones que bajaron el total.',
  });
}

/**
 * Datos para imprimir el inventario valorizado.
 */
export interface DatosImpresionInventario {
  /** Datos del negocio. */
  negocio: DatosNegocio;
  /** Reporte ya calculado. */
  reporte: ReporteInventario;
  /** Filtros aplicados, en palabras. */
  filtros: string;
}

/**
 * Arma el inventario valorizado en hoja carta (D-147, D-156).
 *
 * @param datos - Negocio, reporte y filtros.
 * @returns Documento HTML.
 */
export function reporteInventarioHtml(datos: DatosImpresionInventario): string {
  const { reporte } = datos;
  const r = reporte.resumen;
  const columnasBodega = reporte.bodegas
    .map((b) => `<th class="num">${escaparHtml(b.nombre)}</th>`)
    .join('');
  const encabezado = `<tr><th class="num">Código</th><th>Producto</th><th>Und</th><th>Proveedor</th>${columnasBodega}
    <th class="num">Existencia</th><th class="num">Costo</th><th class="num">Valor</th></tr>`;
  const celdaCantidad = (milesimas: number, unidad: 'UND' | 'KG'): string =>
    `<td class="num${milesimas < 0 ? ' negativo' : ''}">${formatearCantidad(milesimas, unidad)}</td>`;
  const cuerpo = reporte.filas
    .map((f) => {
      const valor = f.valor === 0 && f.valorNegativo < 0 ? f.valorNegativo : f.valor;
      const inactivo = f.activo ? '' : ' (inactivo)';
      return `<tr><td class="num">${f.codigo}</td><td>${escaparHtml(f.nombre)}${inactivo}</td><td>${f.unidad}</td>
        <td>${escaparHtml(f.proveedorNombre)}</td>${f.porBodega.map((c) => celdaCantidad(c, f.unidad)).join('')}
        ${celdaCantidad(f.existencia, f.unidad)}<td class="num">${agruparMiles(f.costo)}</td>
        <td class="num${valor < 0 ? ' negativo' : ''}">${agruparMiles(valor)}</td></tr>`;
    })
    .join('');
  const totalesBodega = r.valorPorBodega
    .map((v) => `<td class="num">${agruparMiles(v)}</td>`)
    .join('');
  const tabla = `<table><thead>${encabezado}</thead><tbody>${cuerpo}
    <tr class="total"><td colspan="4">Total · ${reporte.filas.length} productos</td>${totalesBodega}<td></td><td></td>
    <td class="num">${agruparMiles(r.valorTotal)}</td></tr></tbody></table>`;
  const resumen: [string, string][] = [
    ['Productos con existencia', agruparMiles(r.productosConExistencia)],
    ...reporte.bodegas.map((b, i): [string, string] => [
      `Valor en ${b.nombre}`,
      formatearPesos(r.valorPorBodega[i] ?? 0),
    ]),
    ['Valor total', formatearPesos(r.valorTotal)],
    [
      `Existencias negativas (${r.productosNegativos} productos, no suman)`,
      formatearPesos(r.valorNegativo),
    ],
  ];
  return documentoReporte({
    negocio: datos.negocio,
    titulo: 'INVENTARIO VALORIZADO',
    corte: reporte.corte,
    filtros: datos.filtros,
    resumen,
    tabla,
    nota: 'Valorizado al costo actual de cada producto. El total suma solo las existencias positivas; las negativas se informan aparte.',
  });
}
