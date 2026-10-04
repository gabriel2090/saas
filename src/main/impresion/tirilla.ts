import type { AbonoDetalle } from '../../data/repositorios/abonos.repo';
import type { FacturaClienteDetalle } from '../../data/repositorios/ventas.repo';
import { formatearCantidad } from '../../shared/formato/cantidades';
import { formatearFecha, formatearFechaHoraTirilla } from '../../shared/formato/fechas';
import { pesosEnLetras } from '../../shared/formato/letras';
import { agruparMiles } from '../../shared/formato/moneda';
import type { DatosNegocio } from '../../shared/maestros';
import { encabezadoNegocio, escaparHtml, MARCA_SALDO_INICIAL } from './plantillas';

/**
 * Ancho del papel de la impresora térmica, en milímetros (§11.1).
 */
export const ANCHO_TIRILLA_MM = 80;

/**
 * Estilo de la tirilla de 80 mm. El área imprimible de estas impresoras es de
 * unos 72 mm, por eso el contenido no ocupa todo el ancho del papel.
 */
const ESTILO_TIRILLA = `
  @page { size: ${ANCHO_TIRILLA_MM}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #000; line-height: 1.3; }
  .tirilla { width: 72mm; margin: 0 auto; padding: 2mm 1mm 6mm; }
  .encabezado { text-align: center; }
  .encabezado__nombre { font-size: 11pt; font-weight: bold; }
  .titulo { margin-top: 6px; text-align: center; font-size: 11pt; font-weight: bold; }
  .numero { text-align: center; font-size: 13pt; font-weight: bold; }
  .leyenda { margin: 3px 0; text-align: center; font-size: 11pt; font-weight: bold; letter-spacing: 1px; }
  .centro { text-align: center; }
  .bloque { margin-top: 6px; }
  .fila { display: flex; justify-content: space-between; gap: 4px; }
  .negrita { font-weight: bold; }
  .lineas { width: 100%; margin-top: 6px; border-collapse: collapse; }
  .lineas th { padding: 2px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; text-align: left; }
  .lineas td { padding: 2px 0; vertical-align: top; }
  .lineas .num { text-align: right; white-space: nowrap; padding-left: 4px; }
  .detalle { font-size: 8pt; }
  .separador { margin: 4px 0; border-top: 1px dashed #000; }
  .total { font-size: 12pt; font-weight: bold; }
  .ahorro { margin: 6px 0; padding: 4px; border: 1px dashed #000; text-align: center; font-weight: bold; }
  .recuadro { margin: 6px 0; padding: 4px; border: 1px dashed #000; }
`;

/**
 * Datos para la tirilla de una factura de venta.
 */
export interface DatosTirillaFactura {
  /** Datos del negocio. */
  negocio: DatosNegocio;
  /** Factura con sus líneas y su cliente. */
  factura: FacturaClienteDetalle;
  /** Si es una reimpresión (§9.3). */
  reimpresion: boolean;
}

/**
 * Nombre de la unidad como lo imprime la tirilla actual (F-08).
 *
 * @param unidad - Unidad del producto.
 * @returns `UNIDAD` o `KILO`.
 */
function unidadTirilla(unidad: FacturaClienteDetalle['lineas'][number]['unidad']): string {
  return unidad === 'KG' ? 'KILO' : 'UNIDAD';
}

/**
 * Línea de condición de pago: `CREDITO, 8 DIAS` con el vencimiento, o
 * `CONTADO` con la forma de pago (F-06).
 *
 * @param factura - Factura.
 * @returns HTML de la línea.
 */
function condicionTirilla(factura: FacturaClienteDetalle): string {
  if (factura.condicion === 'credito') {
    return `<div class="fila negrita"><span>CREDITO, ${factura.plazoDias} DIAS</span><span>${formatearFecha(factura.vence)}</span></div>`;
  }
  const forma = factura.formaPagoNombre
    ? `, ${escaparHtml(factura.formaPagoNombre.toUpperCase())}`
    : '';
  return `<div class="negrita">CONTADO${forma}</div>`;
}

/**
 * Datos del cliente (F-09). Solo se imprimen los campos que tienen valor.
 *
 * @param cliente - Cliente de la factura.
 * @returns HTML del bloque.
 */
function clienteTirilla(cliente: FacturaClienteDetalle['cliente']): string {
  const campos: [string, string][] = [
    ['NIT', cliente.numeroIdentificacion],
    ['DIR', cliente.direccion],
    ['BARRIO', cliente.barrio],
    ['CIUDAD', cliente.ciudad],
    ['TEL', cliente.celular],
  ];
  const filas = campos
    .filter(([, valor]) => valor.trim() !== '')
    .map(([etiqueta, valor]) => `<div>${etiqueta}: ${escaparHtml(valor)}</div>`)
    .join('');
  return `<div class="bloque"><div class="negrita">CLIENTE: ${cliente.codigo}-${escaparHtml(cliente.nombre)}</div>${filas}</div>`;
}

/**
 * Recuadro CORRECCION de una factura corregida (D-122): total anterior,
 * diferencia, lo abonado y cómo queda el dinero.
 *
 * @param factura - Factura con su última corrección.
 * @returns HTML del recuadro, o vacío si no se ha corregido.
 */
function recuadroCorreccion(factura: FacturaClienteDetalle): string {
  const c = factura.correccion;
  if (!c) {
    return '';
  }
  const fila = (etiqueta: string, valor: number, negrita = false): string =>
    `<div class="fila${negrita ? ' negrita' : ''}"><span>${etiqueta}</span><span>${agruparMiles(valor)}</span></div>`;
  let cierre: string;
  if (c.reintegro) {
    cierre = fila(
      c.reintegro.sentido === 'entrega' ? 'DEVUELTO' : 'COBRADO',
      c.reintegro.valor,
      true,
    );
  } else if (c.saldoFavor > 0) {
    cierre = fila('SALDO A FAVOR', c.saldoFavor, true);
  } else {
    cierre = fila('SALDO PENDIENTE', factura.saldo, true);
  }
  return `<div class="recuadro">
      <div class="centro negrita">CORRECCION</div>
      ${fila('Total anterior', c.totalAnterior)}
      ${fila('Diferencia', factura.total - c.totalAnterior)}
      ${factura.condicion === 'credito' ? fila('Abonado', c.abonado) : ''}
      ${cierre}
    </div>`;
}

/**
 * Arma la tirilla de 80 mm de una factura de venta, con el formato de la
 * tirilla actual del negocio (F-01 a F-09, D-92): sin «NDEF», con «SALDO
 * CREDITO» igual al saldo de esta factura y «SU AHORRO FUE DE» solo si hubo
 * ahorro. Lleva REIMPRESION o ANULADA cuando corresponde, y CORREGIDA con la
 * versión, la fecha de la corrección y su recuadro si se corrigió (D-122).
 *
 * @param datos - Negocio, factura y si es reimpresión.
 * @returns Documento HTML completo.
 */
export function tirillaFactura(datos: DatosTirillaFactura): string {
  const { negocio, factura } = datos;
  const leyendas = [
    datos.reimpresion ? '<div class="leyenda">REIMPRESION</div>' : '',
    factura.estado === 'anulada' ? '<div class="leyenda">ANULADA</div>' : '',
    factura.correccion
      ? `<div class="leyenda">CORREGIDA</div><div class="centro detalle">Versión ${factura.version} · ${formatearFechaHoraTirilla(factura.correccion.fecha)}</div>`
      : '',
  ].join('');
  const filas = factura.lineas
    .map(
      (l) => `<tr>
        <td>${escaparHtml(l.productoNombre)}<div class="detalle">x ${unidadTirilla(l.unidad)} · $${agruparMiles(l.precio)}</div></td>
        <td class="num">${formatearCantidad(l.cantidad, 'KG')}</td>
        <td class="num">${agruparMiles(l.total)}</td>
      </tr>`,
    )
    .join('');
  const ahorro =
    factura.ahorro > 0
      ? `<div class="ahorro">SU AHORRO FUE DE: $${agruparMiles(factura.ahorro)}</div>`
      : '';
  const cajas = factura.cajasEmpaque === null ? '______' : String(factura.cajasEmpaque);
  const fecha = formatearFechaHoraTirilla(factura.fecha);
  const cuerpo = `
    ${encabezadoNegocio(negocio)}
    <div class="titulo">FACTURA DE VENTA</div>
    <div class="numero">${factura.numero}</div>
    <div class="bloque">
      <div>Fecha Generación: ${fecha}</div>
      <div>Fecha Expedición: ${fecha}</div>
    </div>
    ${leyendas}
    <div class="bloque">${condicionTirilla(factura)}</div>
    ${clienteTirilla(factura.cliente)}
    <table class="lineas">
      <thead><tr><th>Producto</th><th class="num">Cant</th><th class="num">Valor</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="separador"></div>
    <div>LINEAS: ${factura.lineas.length}</div>
    <div class="bloque negrita">SON: ${pesosEnLetras(factura.total)}</div>
    <div class="bloque fila total"><span>TOTAL</span><span>${agruparMiles(factura.total)}</span></div>
    <div class="fila"><span>SALDO CREDITO</span><span>${agruparMiles(factura.saldo)}</span></div>
    <div class="fila"><span>CAMBIO</span><span>${agruparMiles(factura.cambio ?? 0)}</span></div>
    ${recuadroCorreccion(factura)}
    ${ahorro}
    <div class="bloque centro negrita">GRACIAS POR SU COMPRA</div>
    <div class="bloque">No.Cajas Empaque: ${cajas}</div>`;
  return documentoTirilla(`Factura ${factura.numero}`, cuerpo);
}

/**
 * Arma un documento HTML completo de tirilla.
 *
 * @param titulo - Título del documento.
 * @param cuerpo - HTML del contenido, ya escapado.
 * @returns Documento HTML.
 */
function documentoTirilla(titulo: string, cuerpo: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'" />
<title>${escaparHtml(titulo)}</title>
<style>${ESTILO_TIRILLA}</style>
</head>
<body><div class="tirilla">${cuerpo}</div></body>
</html>`;
}

/**
 * Datos para la tirilla del recibo de un abono de cliente.
 */
export interface DatosTirillaAbono {
  /** Datos del negocio. */
  negocio: DatosNegocio;
  /** Abono de cliente con su reparto. */
  abono: AbonoDetalle;
  /** Lo que el cliente sigue debiendo en total al imprimir. */
  deudaActual: number;
  /** Si es una reimpresión (§9.3). */
  reimpresion: boolean;
  /** Fecha ISO de la impresión. */
  impresoEn: string;
}

/**
 * Arma la tirilla de 80 mm del recibo de un abono de cliente (D-93): número,
 * fecha, cliente, forma de pago, facturas abonadas con el saldo que les queda,
 * total en números y letras, y lo que el cliente sigue debiendo. Lleva
 * REIMPRESION o ANULADO cuando corresponde.
 *
 * @param datos - Negocio, abono, deuda actual y si es reimpresión.
 * @returns Documento HTML completo.
 */
export function tirillaReciboAbono(datos: DatosTirillaAbono): string {
  const { negocio, abono } = datos;
  const leyendas = [
    datos.reimpresion ? '<div class="leyenda">REIMPRESION</div>' : '',
    abono.estado === 'anulado' ? '<div class="leyenda">ANULADO</div>' : '',
  ].join('');
  const filas = abono.aplicaciones
    .map(
      (a) => `<tr>
        <td>${a.facturaNumero}${a.saldoInicial ? `<div class="detalle">${MARCA_SALDO_INICIAL.toUpperCase()}</div>` : ''}</td>
        <td class="num">${agruparMiles(a.valor)}</td>
        <td class="num">${agruparMiles(a.saldoActual)}</td>
      </tr>`,
    )
    .join('');
  const observacion = abono.observacion
    ? `<div class="bloque">OBS: ${escaparHtml(abono.observacion)}</div>`
    : '';
  const cuerpo = `
    ${encabezadoNegocio(negocio)}
    <div class="titulo">RECIBO DE ABONO</div>
    <div class="numero">${abono.numero}</div>
    <div class="bloque">
      <div>Fecha: ${formatearFecha(abono.fecha)}</div>
      <div>Registrado: ${formatearFechaHoraTirilla(abono.registradoEn)}</div>
    </div>
    ${leyendas}
    <div class="bloque">
      <div class="negrita">CLIENTE: ${abono.terceroCodigo}-${escaparHtml(abono.terceroNombre)}</div>
      <div>${escaparHtml(abono.terceroIdentificacion)}</div>
    </div>
    <div class="bloque negrita">FORMA DE PAGO: ${escaparHtml(abono.formaPagoNombre.toUpperCase())}</div>
    <table class="lineas">
      <thead><tr><th>Factura</th><th class="num">Abono</th><th class="num">Saldo</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="separador"></div>
    <div class="bloque negrita">SON: ${pesosEnLetras(abono.valor)}</div>
    <div class="bloque fila total"><span>TOTAL ABONO</span><span>${agruparMiles(abono.valor)}</span></div>
    <div class="fila"><span>SALDO PENDIENTE</span><span>${agruparMiles(datos.deudaActual)}</span></div>
    ${observacion}
    <div class="bloque centro negrita">GRACIAS POR SU PAGO</div>
    <div class="bloque detalle">Impreso: ${formatearFechaHoraTirilla(datos.impresoEn)}</div>`;
  return documentoTirilla(`Recibo de abono ${abono.numero}`, cuerpo);
}
