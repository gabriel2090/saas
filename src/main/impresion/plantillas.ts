import type { AbonoDetalle } from '../../data/repositorios/abonos.repo';
import { formatearFecha, formatearFechaHora } from '../../shared/formato/fechas';
import { agruparMiles, formatearPesos } from '../../shared/formato/moneda';
import type { DatosNegocio } from '../../shared/maestros';

/**
 * Estilo común de los documentos en hoja carta (D-52). El documento no
 * lleva scripts y su política de seguridad solo admite estilos en línea.
 */
const ESTILO_CARTA = `
  @page { size: letter; margin: 15mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #000; }
  .hoja { max-width: 190mm; margin: 0 auto; padding: 8mm 0; }
  .encabezado { text-align: center; line-height: 1.35; }
  .encabezado__nombre { font-size: 15pt; font-weight: bold; }
  .titulo { margin: 14px 0 4px; text-align: center; font-size: 13pt; font-weight: bold; }
  .leyenda { margin: 4px 0; text-align: center; font-size: 13pt; font-weight: bold; letter-spacing: 2px; }
  .datos { width: 100%; margin: 12px 0; border-collapse: collapse; }
  .datos th { width: 28%; padding: 3px 6px; text-align: left; font-weight: normal; color: #333; }
  .datos td { padding: 3px 6px; }
  .tabla { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .tabla th, .tabla td { padding: 5px 6px; border-bottom: 1px solid #999; }
  .tabla th { text-align: left; border-bottom: 2px solid #000; }
  .num { text-align: right; }
  .total td { border-bottom: none; border-top: 2px solid #000; font-size: 13pt; font-weight: bold; }
  .pie { margin-top: 18px; font-size: 9pt; color: #333; }
`;

/**
 * Escapa un texto para insertarlo en HTML (los datos vienen del usuario).
 *
 * @param texto - Texto a escapar.
 * @returns Texto seguro para HTML.
 *
 * @example
 * escaparHtml('A & B <c>'); // 'A &amp; B &lt;c&gt;'
 */
export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Arma un documento HTML completo en hoja carta.
 *
 * @param titulo - Título del documento (pestaña y nombre del PDF).
 * @param cuerpo - HTML del contenido, ya escapado.
 * @returns Documento HTML.
 */
function documentoCarta(titulo: string, cuerpo: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'" />
<title>${escaparHtml(titulo)}</title>
<style>${ESTILO_CARTA}</style>
</head>
<body><div class="hoja">${cuerpo}</div></body>
</html>`;
}

/**
 * Encabezado con los datos del negocio (F-01), igual en todos los documentos.
 * Cada plantilla define el estilo de `.encabezado` y `.encabezado__nombre`.
 *
 * @param negocio - Datos del negocio.
 * @returns HTML del encabezado.
 */
export function encabezadoNegocio(negocio: DatosNegocio): string {
  const lineas = [
    `<div class="encabezado__nombre">${escaparHtml(negocio.nombre || 'NOMBRE DEL NEGOCIO SIN CONFIGURAR')}</div>`,
    negocio.nit ? `<div>NIT: ${escaparHtml(negocio.nit)}</div>` : '',
    negocio.regimen ? `<div>${escaparHtml(negocio.regimen.toUpperCase())}</div>` : '',
    negocio.direccion || negocio.telefono
      ? `<div>DIR: ${escaparHtml(negocio.direccion)} - TEL: ${escaparHtml(negocio.telefono)}</div>`
      : '',
  ];
  return `<div class="encabezado">${lineas.join('')}</div>`;
}

/**
 * Datos para el recibo de un abono.
 */
export interface DatosReciboAbono {
  /** Datos del negocio. */
  negocio: DatosNegocio;
  /** Abono con su reparto. */
  abono: AbonoDetalle;
  /** Si es una reimpresión (§9.3, D-63). */
  reimpresion: boolean;
  /** Fecha ISO de la impresión. */
  impresoEn: string;
}

/**
 * Marca que acompaña al número de una factura que es saldo inicial (D-86).
 */
export const MARCA_SALDO_INICIAL = 'Saldo inicial';

/**
 * Arma el recibo de un abono (de cliente o de proveedor) en hoja carta (§8,
 * D-52, D-93). Lleva la leyenda REIMPRESION cuando corresponde (§9.3) y
 * ANULADO si el abono se anuló.
 *
 * @param datos - Negocio, abono y tipo de impresión.
 * @returns Documento HTML.
 */
export function reciboAbono(datos: DatosReciboAbono): string {
  const { negocio, abono } = datos;
  const cliente = abono.tipo === 'cliente';
  const leyendas = [
    datos.reimpresion ? '<div class="leyenda">REIMPRESION</div>' : '',
    abono.estado === 'anulado' ? '<div class="leyenda">ANULADO</div>' : '',
  ].join('');
  const marca = (saldoInicial: boolean): string =>
    saldoInicial ? ` (${MARCA_SALDO_INICIAL})` : '';
  const filas = abono.aplicaciones
    .map((a) =>
      cliente
        ? `<tr><td>${a.facturaNumero}${marca(a.saldoInicial)}</td><td class="num">${agruparMiles(a.valor)}</td></tr>`
        : `<tr><td>${a.facturaNumero}</td><td>${escaparHtml(a.referencia)}${marca(a.saldoInicial)}</td><td class="num">${agruparMiles(a.valor)}</td></tr>`,
    )
    .join('');
  const encabezadoTabla = cliente
    ? '<th>Factura</th><th class="num">Valor aplicado</th>'
    : '<th>Compra</th><th>Factura del proveedor</th><th class="num">Valor aplicado</th>';
  const columnasTotal = cliente ? 1 : 2;
  const tercero = cliente ? 'Cliente' : 'Proveedor';
  const observacion = abono.observacion
    ? `<tr><th>Observación</th><td>${escaparHtml(abono.observacion)}</td></tr>`
    : '';
  const anulacion =
    abono.estado === 'anulado' && abono.anuladoEn
      ? `<tr><th>Anulado el</th><td>${formatearFechaHora(abono.anuladoEn)}${
          abono.motivoAnulacion ? ` · ${escaparHtml(abono.motivoAnulacion)}` : ''
        }</td></tr>`
      : '';
  const cuerpo = `
    ${encabezadoNegocio(negocio)}
    <div class="titulo">RECIBO DE ABONO ${cliente ? 'DE CLIENTE' : 'A PROVEEDOR'} No. ${abono.numero}</div>
    ${leyendas}
    <table class="datos">
      <tr><th>Fecha del abono</th><td>${formatearFecha(abono.fecha)}</td></tr>
      <tr><th>${tercero}</th><td>${abono.terceroCodigo} - ${escaparHtml(abono.terceroNombre)}</td></tr>
      <tr><th>Identificación</th><td>${escaparHtml(abono.terceroIdentificacion)}</td></tr>
      <tr><th>Forma de pago</th><td>${escaparHtml(abono.formaPagoNombre)}</td></tr>
      ${observacion}
      ${anulacion}
    </table>
    <table class="tabla">
      <thead><tr>${encabezadoTabla}</tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr class="total"><td colspan="${columnasTotal}">TOTAL DEL ABONO</td><td class="num">${formatearPesos(abono.valor)}</td></tr></tfoot>
    </table>
    <div class="pie">Registrado: ${formatearFechaHora(abono.registradoEn)} · Impreso: ${formatearFechaHora(datos.impresoEn)}</div>`;
  return documentoCarta(`Recibo de abono ${abono.numero}`, cuerpo);
}
