import type { AbonoDetalle } from '../../data/repositorios/abonos.repo';
import type { FacturaClienteDetalle } from '../../data/repositorios/ventas.repo';
import type { FacturaProveedorParaCorregir } from '../../shared/correcciones';
import { formatearCantidad, type UnidadMedida } from '../../shared/formato/cantidades';
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
 * Leyendas de estado que puede llevar cualquier documento de tirilla.
 */
export interface LeyendasTirilla {
  /** Si es una reimpresión (§9.3). */
  reimpresion: boolean;
  /** `ANULADA` (facturas) o `ANULADO` (abonos) si se anuló; `null` si está activo. */
  anulacion: 'ANULADA' | 'ANULADO' | null;
  /** Versión vigente y fecha ISO de la última corrección, o `null` si no se corrigió. */
  correccion: { version: number; fecha: string } | null;
}

/**
 * Bloque de leyendas, igual en todos los documentos de tirilla (D-122, §9.3):
 * REIMPRESION, ANULADA o ANULADO, y CORREGIDA con la versión y la fecha.
 *
 * @param leyendas - Qué leyendas lleva.
 * @returns HTML de las leyendas (vacío si no lleva ninguna).
 */
export function leyendasTirilla(leyendas: LeyendasTirilla): string {
  return [
    leyendas.reimpresion ? '<div class="leyenda">REIMPRESION</div>' : '',
    leyendas.anulacion ? `<div class="leyenda">${leyendas.anulacion}</div>` : '',
    leyendas.correccion
      ? `<div class="leyenda">CORREGIDA</div><div class="centro detalle">Versión ${leyendas.correccion.version} · ${formatearFechaHoraTirilla(leyendas.correccion.fecha)}</div>`
      : '',
  ].join('');
}

/**
 * Bloque del tercero (cliente o proveedor): código y nombre en negrita y,
 * debajo, solo los datos que tienen valor.
 *
 * @param etiqueta - `CLIENTE` o `PROVEEDOR`.
 * @param codigo - Código del tercero.
 * @param nombre - Nombre.
 * @param campos - Etiqueta y valor de cada dato (se omiten los vacíos).
 * @returns HTML del bloque.
 */
function terceroTirilla(
  etiqueta: 'CLIENTE' | 'PROVEEDOR',
  codigo: number,
  nombre: string,
  campos: readonly [string, string][],
): string {
  const filas = campos
    .filter(([, valor]) => valor.trim() !== '')
    .map(([dato, valor]) => `<div>${dato ? `${dato}: ` : ''}${escaparHtml(valor)}</div>`)
    .join('');
  return `<div class="bloque"><div class="negrita">${etiqueta}: ${codigo}-${escaparHtml(nombre)}</div>${filas}</div>`;
}

/**
 * Fila de dos columnas con un valor en pesos.
 *
 * @param etiqueta - Texto de la izquierda.
 * @param valor - Pesos.
 * @param clase - Clases extra (`negrita`, `total`…).
 * @returns HTML de la fila.
 */
function filaPesos(etiqueta: string, valor: number, clase = ''): string {
  return `<div class="fila${clase ? ` ${clase}` : ''}"><span>${etiqueta}</span><span>${agruparMiles(valor)}</span></div>`;
}

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
function unidadTirilla(unidad: UnidadMedida): string {
  return unidad === 'KG' ? 'KILO' : 'UNIDAD';
}

/**
 * Fila de producto de la tabla de líneas, igual en la factura de venta y en
 * la de proveedor: nombre con la unidad y el precio debajo, cantidad y total.
 *
 * @param nombre - Nombre del producto.
 * @param unidad - Unidad de medida.
 * @param precio - Precio (venta) o costo unitario (compra).
 * @param cantidad - Cantidad en milésimas.
 * @param total - Total de la línea.
 * @returns HTML de la fila.
 */
function filaProducto(
  nombre: string,
  unidad: UnidadMedida,
  precio: number,
  cantidad: number,
  total: number,
): string {
  return `<tr>
        <td>${escaparHtml(nombre)}<div class="detalle">x ${unidadTirilla(unidad)} · $${agruparMiles(precio)}</div></td>
        <td class="num">${formatearCantidad(cantidad, 'KG')}</td>
        <td class="num">${agruparMiles(total)}</td>
      </tr>`;
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
  return terceroTirilla('CLIENTE', cliente.codigo, cliente.nombre, [
    ['NIT', cliente.numeroIdentificacion],
    ['DIR', cliente.direccion],
    ['BARRIO', cliente.barrio],
    ['CIUDAD', cliente.ciudad],
    ['TEL', cliente.celular],
  ]);
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
  let cierre: string;
  if (c.reintegro) {
    cierre = filaPesos(
      c.reintegro.sentido === 'entrega' ? 'DEVUELTO' : 'COBRADO',
      c.reintegro.valor,
      'negrita',
    );
  } else if (c.saldoFavor > 0) {
    cierre = filaPesos('SALDO A FAVOR', c.saldoFavor, 'negrita');
  } else {
    cierre = filaPesos('SALDO PENDIENTE', factura.saldo, 'negrita');
  }
  return `<div class="recuadro">
      <div class="centro negrita">CORRECCION</div>
      ${filaPesos('Total anterior', c.totalAnterior)}
      ${filaPesos('Diferencia', factura.total - c.totalAnterior)}
      ${factura.condicion === 'credito' ? filaPesos('Abonado', c.abonado) : ''}
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
  const leyendas = leyendasTirilla({
    reimpresion: datos.reimpresion,
    anulacion: factura.estado === 'anulada' ? 'ANULADA' : null,
    correccion: factura.correccion
      ? { version: factura.version, fecha: factura.correccion.fecha }
      : null,
  });
  const filas = factura.lineas
    .map((l) => filaProducto(l.productoNombre, l.unidad, l.precio, l.cantidad, l.total))
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
 * Datos para la tirilla del recibo de un abono (de cliente o a proveedor).
 */
export interface DatosTirillaAbono {
  /** Datos del negocio. */
  negocio: DatosNegocio;
  /** Abono con su reparto. */
  abono: AbonoDetalle;
  /** Lo que se sigue debiendo en total al imprimir (el cliente, o el negocio al proveedor). */
  deudaActual: number;
  /** Si es una reimpresión (§9.3). */
  reimpresion: boolean;
  /** Fecha ISO de la impresión. */
  impresoEn: string;
}

/**
 * Arma la tirilla de 80 mm del recibo de un abono (D-93, D-143): número,
 * fecha, cliente o proveedor, forma de pago, facturas abonadas con el saldo
 * que les queda, total en números y letras, y lo que se sigue debiendo. En
 * los abonos a proveedor cada compra muestra el número de la factura del
 * proveedor. Lleva REIMPRESION o ANULADO cuando corresponde.
 *
 * @param datos - Negocio, abono, deuda actual y si es reimpresión.
 * @returns Documento HTML completo.
 */
export function tirillaReciboAbono(datos: DatosTirillaAbono): string {
  const { negocio, abono } = datos;
  const cliente = abono.tipo === 'cliente';
  const leyendas = leyendasTirilla({
    reimpresion: datos.reimpresion,
    anulacion: abono.estado === 'anulado' ? 'ANULADO' : null,
    correccion: null,
  });
  const filas = abono.aplicaciones
    .map((a) => {
      const detalle = [
        cliente ? '' : escaparHtml(a.referencia),
        a.saldoInicial ? MARCA_SALDO_INICIAL.toUpperCase() : '',
      ]
        .filter((d) => d !== '')
        .join(' · ');
      return `<tr>
        <td>${a.facturaNumero}${detalle ? `<div class="detalle">${detalle}</div>` : ''}</td>
        <td class="num">${agruparMiles(a.valor)}</td>
        <td class="num">${agruparMiles(a.saldoActual)}</td>
      </tr>`;
    })
    .join('');
  const observacion = abono.observacion
    ? `<div class="bloque">OBS: ${escaparHtml(abono.observacion)}</div>`
    : '';
  const cuerpo = `
    ${encabezadoNegocio(negocio)}
    <div class="titulo">${cliente ? 'RECIBO DE ABONO' : 'ABONO A PROVEEDOR'}</div>
    <div class="numero">${abono.numero}</div>
    <div class="bloque">
      <div>Fecha: ${formatearFecha(abono.fecha)}</div>
      <div>Registrado: ${formatearFechaHoraTirilla(abono.registradoEn)}</div>
    </div>
    ${leyendas}
    ${terceroTirilla(cliente ? 'CLIENTE' : 'PROVEEDOR', abono.terceroCodigo, abono.terceroNombre, [
      ['', abono.terceroIdentificacion],
    ])}
    <div class="bloque negrita">FORMA DE PAGO: ${escaparHtml(abono.formaPagoNombre.toUpperCase())}</div>
    <table class="lineas">
      <thead><tr><th>${cliente ? 'Factura' : 'Compra'}</th><th class="num">Abono</th><th class="num">Saldo</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="separador"></div>
    <div class="bloque negrita">SON: ${pesosEnLetras(abono.valor)}</div>
    ${filaPesos('TOTAL ABONO', abono.valor, 'bloque total')}
    ${filaPesos('SALDO PENDIENTE', datos.deudaActual)}
    ${observacion}
    ${cliente ? '<div class="bloque centro negrita">GRACIAS POR SU PAGO</div>' : ''}
    <div class="bloque detalle">Impreso: ${formatearFechaHoraTirilla(datos.impresoEn)}</div>`;
  return documentoTirilla(`Recibo de abono ${abono.numero}`, cuerpo);
}

/**
 * Datos para la tirilla de una factura de proveedor.
 */
export interface DatosTirillaCompra {
  /** Datos del negocio. */
  negocio: DatosNegocio;
  /** Compra con su versión vigente, su cartera y sus versiones. */
  compra: FacturaProveedorParaCorregir;
  /** Si es una reimpresión (§9.3). */
  reimpresion: boolean;
  /** Fecha ISO de la impresión. */
  impresoEn: string;
}

/**
 * Arma la tirilla de 80 mm de una factura de proveedor (D-143), con las
 * mismas piezas que la factura de venta: encabezado, leyendas, tercero y
 * tabla de productos con el costo unitario. Debajo van el subtotal, el flete,
 * el descuento, el total, lo pagado, lo devuelto y el saldo; si se corrigió,
 * el recuadro CORRECCION con el total anterior y la diferencia.
 *
 * @param datos - Negocio, compra, si es reimpresión y fecha de impresión.
 * @returns Documento HTML completo.
 */
export function tirillaFacturaProveedor(datos: DatosTirillaCompra): string {
  const { negocio, compra } = datos;
  const { cartera } = compra;
  const anterior = compra.versiones.at(-2);
  const vigente = compra.versiones.at(-1);
  const leyendas = leyendasTirilla({
    reimpresion: datos.reimpresion,
    anulacion: compra.estado === 'anulada' ? 'ANULADA' : null,
    correccion:
      compra.version > 1 && vigente ? { version: compra.version, fecha: vigente.fecha } : null,
  });
  const condicion = compra.abonoContado
    ? '<div class="negrita">PAGADA DE CONTADO</div>'
    : `<div class="fila negrita"><span>CREDITO, ${compra.plazoDias} DIAS</span><span>${formatearFecha(compra.vence)}</span></div>`;
  const filas = compra.lineas
    .map((l) =>
      filaProducto(l.producto.nombre, l.producto.unidad, l.costoUnitario, l.cantidad, l.total),
    )
    .join('');
  const saldo = compra.estado === 'anulada' ? 0 : cartera.saldo;
  const correccion =
    compra.version > 1 && anterior
      ? `<div class="recuadro">
      <div class="centro negrita">CORRECCION</div>
      ${filaPesos('Total anterior', anterior.total)}
      ${filaPesos('Diferencia', cartera.total - anterior.total)}
      ${filaPesos('Pagado', cartera.aplicado)}
      ${
        cartera.trasladado > 0
          ? filaPesos('SALDO A FAVOR', cartera.trasladado, 'negrita')
          : filaPesos('SALDO PENDIENTE', saldo, 'negrita')
      }
    </div>`
      : '';
  const cuerpo = `
    ${encabezadoNegocio(negocio)}
    <div class="titulo">FACTURA DE PROVEEDOR</div>
    <div class="numero">${escaparHtml(compra.numeroProveedor)}</div>
    <div class="bloque">
      <div>Compra No.: ${compra.numero}</div>
      <div>Fecha: ${formatearFecha(compra.fecha)}</div>
      <div>Bodega: ${escaparHtml(compra.bodegaNombre)}</div>
    </div>
    ${leyendas}
    <div class="bloque">${condicion}</div>
    ${terceroTirilla('PROVEEDOR', compra.tercero.codigo, compra.tercero.nombre, [
      ['', compra.tercero.identificacion],
    ])}
    <table class="lineas">
      <thead><tr><th>Producto</th><th class="num">Cant</th><th class="num">Valor</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="separador"></div>
    <div>LINEAS: ${compra.lineas.length}</div>
    ${filaPesos('SUBTOTAL', compra.subtotal, 'bloque')}
    ${compra.flete > 0 ? filaPesos(compra.fleteProveedor ? 'FLETE' : 'FLETE (en el costo)', compra.flete) : ''}
    ${compra.descuentoPesos > 0 ? filaPesos('DESCUENTO', -compra.descuentoPesos) : ''}
    <div class="bloque negrita">SON: ${pesosEnLetras(cartera.total)}</div>
    ${filaPesos('TOTAL', cartera.total, 'bloque total')}
    ${filaPesos('PAGADO', cartera.aplicado)}
    ${cartera.devuelto > 0 ? filaPesos('DEVUELTO', cartera.devuelto) : ''}
    ${filaPesos('SALDO', saldo)}
    ${correccion}
    <div class="bloque detalle">Impreso: ${formatearFechaHoraTirilla(datos.impresoEn)}</div>`;
  return documentoTirilla(`Compra ${compra.numero}`, cuerpo);
}
