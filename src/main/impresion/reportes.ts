import { sumarDias } from '../../domain/calendario';
import { textoSaldoNeto } from '../../domain/estado-cuenta';
import { etiquetaAccion } from '../../domain/historial';
import { textoDias } from '../../domain/reportes';
import type { ReporteEstadoCuenta } from '../../shared/estadoCuenta';
import { formatearCantidad } from '../../shared/formato/cantidades';
import { formatearFecha, formatearFechaHora } from '../../shared/formato/fechas';
import { agruparMiles, formatearPesos } from '../../shared/formato/moneda';
import { MAXIMO_REGISTROS_HISTORIAL, type ReporteHistorial } from '../../shared/historial';
import type { ReporteKardex } from '../../shared/kardex';
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
    <th class="num">${cliente ? 'Abonado' : 'Pagado'}</th><th class="num">Devuelto /<br />corregido</th><th class="num">Saldo</th></tr>`;
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
    nota: `Saldo = total − ${cliente ? 'abonado' : 'pagado'} − devuelto / corregido (devoluciones y correcciones que bajaron el total).`,
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

/**
 * Datos para imprimir el kardex.
 */
export interface DatosImpresionKardex {
  /** Datos del negocio. */
  negocio: DatosNegocio;
  /** Kardex ya calculado. */
  reporte: ReporteKardex;
}

/**
 * Describe en palabras el producto, la bodega y el periodo de un kardex (va
 * en el reporte impreso y en Excel).
 *
 * @param reporte - Kardex calculado.
 * @returns Texto de los filtros.
 */
export function filtrosKardex(reporte: ReporteKardex): string {
  const p = reporte.producto;
  const bodega = reporte.bodega === null ? 'Todas las bodegas' : `Bodega ${reporte.bodega}`;
  return `Producto ${p.codigo} - ${p.nombre} (${p.unidad}) · ${bodega} · del ${formatearFecha(reporte.desde)} al ${formatearFecha(reporte.hasta)}`;
}

/**
 * Arma el kardex de un producto en hoja carta: saldo anterior, movimientos
 * con saldo corrido y totales del periodo. La columna «Bodega» solo aparece
 * cuando el kardex junta todas las bodegas.
 *
 * @param datos - Negocio y kardex.
 * @returns Documento HTML.
 */
export function reporteKardexHtml(datos: DatosImpresionKardex): string {
  const { reporte } = datos;
  const { unidad } = reporte.producto;
  const todas = reporte.bodega === null;
  /**
   * Celda de una cantidad; vacía si es cero.
   *
   * @param milesimas - Cantidad.
   * @param clase - Clase extra.
   * @returns HTML de la celda.
   */
  const celda = (milesimas: number, clase = ''): string =>
    `<td class="num${clase}">${milesimas === 0 ? '' : formatearCantidad(milesimas, unidad)}</td>`;
  /**
   * Celda del saldo (siempre visible, en negrita si es negativo).
   *
   * @param milesimas - Saldo.
   * @returns HTML de la celda.
   */
  const celdaSaldo = (milesimas: number): string =>
    `<td class="num${milesimas < 0 ? ' negativo' : ''}">${formatearCantidad(milesimas, unidad)}</td>`;
  const encabezado = `<tr><th>Fecha</th><th>Movimiento</th><th>Documento</th><th>Tercero</th>${todas ? '<th>Bodega</th>' : ''}
    <th class="num">Entrada</th><th class="num">Salida</th><th class="num">Saldo</th><th class="num">Costo unit.</th></tr>`;
  const vacias = todas ? 5 : 4;
  const cuerpo = reporte.filas
    .map((f) => {
      const marca = f.marca ? ` <strong>${escaparHtml(f.marca)}</strong>` : '';
      return `<tr><td>${formatearFechaHora(f.fecha)}</td><td>${escaparHtml(f.movimiento)}</td>
        <td>${escaparHtml(f.documento)}${marca}</td><td>${escaparHtml(f.tercero)}</td>${todas ? `<td>${escaparHtml(f.bodega)}</td>` : ''}
        ${celda(f.entrada)}${celda(f.salida)}${celdaSaldo(f.saldo)}
        <td class="num">${agruparMiles(f.costoUnitario)}</td></tr>`;
    })
    .join('');
  const sinMovimientos =
    reporte.filas.length === 0
      ? `<tr><td colspan="${vacias + 4}">Sin movimientos en el periodo.</td></tr>`
      : '';
  const tabla = `<table><thead>${encabezado}</thead><tbody>
    <tr class="subtotal"><td colspan="${vacias}">Saldo anterior al ${formatearFecha(reporte.desde)}</td><td></td><td></td>
    ${celdaSaldo(reporte.saldoAnterior)}<td></td></tr>${cuerpo}${sinMovimientos}
    <tr class="total"><td colspan="${vacias}">Totales del periodo · ${reporte.filas.length} movimientos</td>
    ${celda(reporte.entradas)}${celda(reporte.salidas)}${celdaSaldo(reporte.saldoFinal)}<td></td></tr></tbody></table>`;
  const p = reporte.producto;
  return documentoReporte({
    negocio: datos.negocio,
    titulo: 'KARDEX',
    corte: reporte.corte,
    filtros: filtrosKardex(reporte),
    resumen: [
      ['Saldo anterior', formatearCantidad(reporte.saldoAnterior, unidad)],
      ['Entradas', formatearCantidad(reporte.entradas, unidad)],
      ['Salidas', formatearCantidad(reporte.salidas, unidad)],
      ['Saldo final', formatearCantidad(reporte.saldoFinal, unidad)],
      ['Valor al costo actual', formatearPesos(reporte.valorCostoActual)],
    ],
    tabla,
    nota: `Saldo anterior + entradas − salidas = saldo final. Costo actual: ${formatearPesos(p.costo)} por ${p.unidad === 'KG' ? 'kilo' : 'unidad'}.`,
  });
}

/**
 * Datos para imprimir el historial de cambios.
 */
export interface DatosImpresionHistorial {
  /** Datos del negocio. */
  negocio: DatosNegocio;
  /** Consulta ya hecha. */
  reporte: ReporteHistorial;
  /** Filtros aplicados, en palabras. */
  filtros: string;
}

/**
 * Arma el listado del historial de cambios en hoja carta.
 *
 * @param datos - Negocio, consulta y filtros.
 * @returns Documento HTML.
 */
export function reporteHistorialHtml(datos: DatosImpresionHistorial): string {
  const { reporte } = datos;
  const cuerpo = reporte.registros
    .map(
      (r) => `<tr><td>${formatearFechaHora(r.fecha)}</td><td>${escaparHtml(r.tipo)}</td>
        <td>${escaparHtml(r.documento)}</td><td>${escaparHtml(etiquetaAccion(r.accion))}</td>
        <td>${escaparHtml(r.resumen)}</td></tr>`,
    )
    .join('');
  const tabla = `<table><thead><tr><th>Fecha y hora</th><th>Tipo</th><th>Documento</th><th>Acción</th>
    <th>Resumen</th></tr></thead><tbody>${
      cuerpo || '<tr><td colspan="5">Sin cambios con estos filtros.</td></tr>'
    }</tbody></table>`;
  return documentoReporte({
    negocio: datos.negocio,
    titulo: 'HISTORIAL DE CAMBIOS',
    corte: reporte.corte,
    filtros: datos.filtros,
    resumen: [['Registros', agruparMiles(reporte.registros.length)]],
    tabla,
    nota: reporte.truncado
      ? `Se muestran los ${agruparMiles(MAXIMO_REGISTROS_HISTORIAL)} cambios más recientes; acote el periodo o los filtros para ver el resto.`
      : 'El historial no se puede editar ni borrar.',
  });
}

/**
 * Datos para imprimir el estado de cuenta.
 */
export interface DatosImpresionEstadoCuenta {
  /** Datos del negocio. */
  negocio: DatosNegocio;
  /** Estado de cuenta ya calculado. */
  reporte: ReporteEstadoCuenta;
}

/**
 * Estilo del estado de cuenta (maqueta docs/maquetas/estado-cuenta.html).
 * El encabezado va en el `thead` de una tabla que envuelve toda la hoja:
 * Chromium repite el `thead` en cada página al imprimir y al guardar el PDF.
 *
 * @param pie - Texto del pie de cada hoja.
 * @returns Hoja de estilo.
 */
function estiloEstadoCuenta(pie: string): string {
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
  @media screen { body { padding: 12mm; } }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  .hoja > thead > tr > td, .hoja > tbody > tr > td { padding: 0; border: none; }
  .hoja > thead > tr > td { padding-bottom: 4px; }
  .encabezado { display: flex; justify-content: space-between; gap: 16px; padding-bottom: 6px; border-bottom: 2px solid #000; }
  .encabezado__negocio { line-height: 1.35; }
  .encabezado__negocio strong { display: block; font-size: 12pt; }
  .encabezado__titulo { text-align: right; line-height: 1.35; }
  .encabezado__titulo strong { display: block; font-size: 13pt; letter-spacing: 1px; }
  .tercero { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px 16px; margin-top: 8px; padding: 5px 8px; border: 1px solid #000; }
  h3 { margin: 0; font-size: 9.5pt; text-transform: uppercase; }
  .tabla tr { break-inside: avoid; }
  .tabla tr.titulo th { padding: 12px 0 4px; border: none; }
  .tabla th { padding: 3px 4px; border-top: 1px solid #000; border-bottom: 1px solid #000; text-align: left; }
  .tabla td { padding: 2px 4px; border-bottom: 1px dotted #999; vertical-align: top; }
  .tabla .total td { border-top: 1px solid #000; border-bottom: none; font-weight: bold; }
  .num { text-align: right; white-space: nowrap; }
  .vencida .dias { font-weight: bold; }
  .resumen { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 12px; break-inside: avoid; }
  .resumen div { padding: 4px 8px; border: 1px solid #000; }
  .resumen strong { display: block; font-size: 10.5pt; }
  .nota { margin-top: 14px; padding-top: 5px; border-top: 1px solid #000; color: #444; font-size: 8pt; }
`;
}

/**
 * Arma el estado de cuenta en hoja carta (D-149, maqueta
 * docs/maquetas/estado-cuenta.html): encabezado del negocio y del tercero en
 * cada página, movimientos del periodo con saldo anterior y saldo corrido,
 * documentos pendientes al último día con sus días, el recuadro final y
 * «Página N de M» en el pie.
 *
 * @param datos - Negocio y estado de cuenta.
 * @returns Documento HTML.
 */
export function reporteEstadoCuentaHtml(datos: DatosImpresionEstadoCuenta): string {
  const { negocio, reporte } = datos;
  const cliente = reporte.tipo === 'cliente';
  const t = reporte.tercero;
  const titulo = `Estado de cuenta ${t.nombre}`;
  const lineaNegocio = [negocio.nit ? `NIT ${negocio.nit}` : '', negocio.regimen]
    .filter(Boolean)
    .map(escaparHtml)
    .join(' · ');
  const lineaContacto = [negocio.direccion, negocio.telefono ? `Tel. ${negocio.telefono}` : '']
    .filter(Boolean)
    .map(escaparHtml)
    .join(' · ');
  const tercero = cliente
    ? `<span><b>Cliente:</b> ${t.codigo} - ${escaparHtml(t.nombre)}</span>
       <span><b>${escaparHtml(t.tipoIdentificacion)}:</b> ${escaparHtml(t.numeroIdentificacion)}</span>
       <span><b>Cel.:</b> ${escaparHtml(t.celular)}</span>
       <span><b>Dirección:</b> ${escaparHtml(t.direccion)}</span>
       <span><b>Tope de crédito:</b> ${t.tope === null ? 'Sin tope' : formatearPesos(t.tope)}</span><span></span>`
    : `<span><b>Proveedor:</b> ${t.codigo} - ${escaparHtml(t.nombre)}</span>
       <span><b>${escaparHtml(t.tipoIdentificacion)}:</b> ${escaparHtml(t.numeroIdentificacion)}</span>
       <span><b>Cel.:</b> ${escaparHtml(t.celular)}</span>
       <span><b>Dirección:</b> ${escaparHtml(t.direccion)}</span><span></span><span></span>`;
  const encabezado = `<div class="encabezado">
    <div class="encabezado__negocio"><strong>${escaparHtml(negocio.nombre || 'NOMBRE DEL NEGOCIO SIN CONFIGURAR')}</strong>${lineaNegocio}${lineaContacto ? `<br />${lineaContacto}` : ''}</div>
    <div class="encabezado__titulo"><strong>ESTADO DE CUENTA</strong>${cliente ? 'CLIENTE' : 'PROVEEDOR'}<br />Periodo ${formatearFecha(reporte.desde)} a ${formatearFecha(reporte.hasta)}<br />Generado ${formatearFechaHora(reporte.corte)}</div>
  </div>
  <div class="tercero">${tercero}</div>`;

  /**
   * Celda de un valor; vacía si es cero.
   *
   * @param valor - Pesos.
   * @returns HTML de la celda.
   */
  const celda = (valor: number): string =>
    `<td class="num">${valor === 0 ? '' : agruparMiles(valor)}</td>`;
  const movimientos = reporte.movimientos
    .map((m) => {
      const marca = m.marca ? ` <strong>${escaparHtml(m.marca)}</strong>` : '';
      return `<tr><td>${formatearFecha(m.fecha)}</td><td>${escaparHtml(m.documento)}${marca}</td>
        <td>${escaparHtml(m.detalle)}</td>${celda(m.cargo)}${celda(m.abono)}
        <td class="num">${textoSaldoNeto(m.saldo)}</td></tr>`;
    })
    .join('');
  // El título va en el thead para que no quede solo al pie de una hoja y se repita en la siguiente.
  const tablaMovimientos = `<table class="tabla"><thead>
    <tr class="titulo"><th colspan="6"><h3>Movimientos del periodo</h3></th></tr><tr><th>Fecha</th><th>Documento</th><th>Detalle</th>
    <th class="num">Cargos</th><th class="num">Abonos</th><th class="num">Saldo</th></tr></thead><tbody>
    <tr><td>${formatearFecha(sumarDias(reporte.desde, -1))}</td><td></td><td>Saldo anterior</td><td></td><td></td>
    <td class="num">${textoSaldoNeto(reporte.saldoAnterior)}</td></tr>${movimientos}
    <tr class="total"><td colspan="3">Totales del periodo</td><td class="num">${agruparMiles(reporte.cargos)}</td>
    <td class="num">${agruparMiles(reporte.abonos)}</td><td class="num">${textoSaldoNeto(reporte.saldoFinal)}</td></tr>
    </tbody></table>`;

  const pendientes = reporte.pendientes
    .map(
      (p) => `<tr class="${p.vencida ? 'vencida' : ''}"><td>${escaparHtml(p.documento)}</td>
        <td>${formatearFecha(p.fecha)}</td><td>${formatearFecha(p.vence)}</td>
        <td class="num dias">${textoDias(p)}</td><td class="num">${agruparMiles(p.total)}</td>
        <td class="num">${agruparMiles(p.abonado)}</td><td class="num">${agruparMiles(p.devuelto)}</td>
        <td class="num">${agruparMiles(p.saldo)}</td></tr>`,
    )
    .join('');
  const sinPendientes =
    reporte.pendientes.length === 0
      ? `<tr><td colspan="8">No tiene ${cliente ? 'facturas' : 'compras'} con saldo a esta fecha.</td></tr>`
      : '';
  const tablaPendientes = `<table class="tabla"><thead>
    <tr class="titulo"><th colspan="8"><h3>${cliente ? 'Facturas pendientes' : 'Compras pendientes'} al ${formatearFecha(reporte.hasta)}</h3></th></tr>
    <tr><th>Documento</th><th>Fecha</th><th>Vence</th>
    <th class="num">Días</th><th class="num">Total</th><th class="num">Abonado</th>
    <th class="num">Devuelto / corregido</th><th class="num">Saldo</th></tr></thead><tbody>${pendientes}${sinPendientes}
    <tr class="total"><td colspan="7">Total pendiente</td><td class="num">${agruparMiles(reporte.resumen.pendiente)}</td></tr>
    </tbody></table>`;

  const r = reporte.resumen;
  const resumen = [
    ['Saldo pendiente', formatearPesos(r.pendiente)],
    ['Vencido', formatearPesos(r.vencido)],
    [
      cliente ? 'Saldo a favor del cliente' : 'Saldo a favor del negocio',
      formatearPesos(r.saldoFavor),
    ],
    [r.neto < 0 ? 'Neto a favor' : 'Neto a pagar', formatearPesos(Math.abs(r.neto))],
  ]
    .map(([etiqueta, valor]) => `<div>${etiqueta}<strong>${valor}</strong></div>`)
    .join('');
  const nota = `La columna Saldo es lo que se debe menos el saldo a favor. ${
    cliente
      ? 'Las ventas de contado no aparecen porque no afectan la cuenta.'
      : 'Las compras pagadas de contado aparecen con su abono automático.'
  }`;
  const pie = `${titulo} · generado ${formatearFechaHora(reporte.corte)}`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'" />
<title>${escaparHtml(titulo)}</title>
<style>${estiloEstadoCuenta(pie)}</style>
</head>
<body>
<table class="hoja">
<thead><tr><td>${encabezado}</td></tr></thead>
<tbody><tr><td>
${tablaMovimientos}
${tablaPendientes}
<div class="resumen">${resumen}</div>
<p class="nota">${nota}</p>
</td></tr></tbody>
</table>
</body>
</html>`;
}
