/**
 * Tipos compartidos de la Fase 4a: corrección y anulación de facturas,
 * devoluciones, saldo a favor y reintegros (§9.1, §9.2). Los usan las
 * ventanas de corrección y de devolución y el proceso principal.
 */

import type { EstadoAbono, TipoAbono } from './abonos';
import type { DescuentoCompra } from './compras';
import type { UnidadMedida } from './formato/cantidades';
import type { EscalaPrecio, PreciosProducto } from './maestros';
import type { CondicionPago } from './ventas';

/**
 * Tercero dueño de una factura, de un saldo a favor o de un reintegro.
 */
export type TipoTercero = TipoAbono;

/**
 * Tipo de devolución: de venta (reingresa) o de compra (sale).
 */
export type TipoDevolucion = 'venta' | 'compra';

/**
 * Tipos de devolución aceptados, para validar peticiones.
 */
export const TIPOS_DEVOLUCION: readonly TipoDevolucion[] = ['venta', 'compra'];

/**
 * Sentido de un reintegro: el negocio entrega el dinero o lo recibe (D-128).
 */
export type SentidoReintegro = 'entrega' | 'recibe';

/**
 * Origen de un reintegro (D-128): pagar en dinero un saldo a favor, o la
 * diferencia de una venta de contado corregida, devuelta o anulada.
 */
export type OrigenReintegro = 'saldo_favor' | 'documento';

/**
 * Situación de cartera de una factura (D-127).
 */
export interface CarteraDeFactura {
  /** Total vigente. */
  total: number;
  /** Lo aplicado por abonos activos. */
  aplicado: number;
  /** Lo devuelto por devoluciones activas. */
  devuelto: number;
  /** Lo que la factura trasladó al saldo a favor (neto). */
  trasladado: number;
  /** Saldo pendiente: total − aplicado − devuelto + trasladado. */
  saldo: number;
}

/**
 * Abono aplicado a una factura, para el panel «Abonos aplicados».
 */
export interface AbonoDeFactura {
  /** Id del abono. */
  id: number;
  /** Número del abono. */
  numero: number;
  /** Fecha del abono, `AAAA-MM-DD`. */
  fecha: string;
  /** Forma de pago. */
  formaPagoNombre: string;
  /** Lo que el abono le aplicó a esta factura. */
  valor: number;
  /** Estado del abono. */
  estado: EstadoAbono;
  /** `contado` si es el abono automático de una compra «Pagada de contado». */
  origen: 'manual' | 'contado';
}

/**
 * Versión de una factura, para el panel «Versiones».
 */
export interface VersionDeFactura {
  /** Número de versión (1 es la original). */
  version: number;
  /** Fecha ISO en que se guardó. */
  fecha: string;
  /** Total de esa versión. */
  total: number;
  /** Motivo de la corrección (`null` en la original o si no se escribió). */
  motivo: string | null;
}

/**
 * Devolución de una factura, para la lista de devoluciones.
 */
export interface DevolucionResumen {
  /** Id interno. */
  id: number;
  /** Venta o compra. */
  tipo: TipoDevolucion;
  /** Número (consecutivo de su tipo). */
  numero: number;
  /** Fecha ISO en que se guardó. */
  fecha: string;
  /** Bodega a la que reingresó o de la que salió. */
  bodegaNombre: string;
  /** Total devuelto. */
  total: number;
  /** Motivo. */
  motivo: string;
  /** Estado. */
  estado: 'activa' | 'anulada';
}

/**
 * Cantidad ya devuelta de un renglón por devoluciones activas.
 */
export interface DevueltoDeRenglon {
  /** Renglón de la versión vigente. */
  renglon: number;
  /** Milésimas devueltas. */
  cantidad: number;
}

/**
 * Producto de una línea guardada.
 */
export interface ProductoDeLinea {
  /** Código. */
  codigo: number;
  /** Nombre. */
  nombre: string;
  /** Unidad de medida. */
  unidad: UnidadMedida;
}

/**
 * Línea vigente de una factura de cliente.
 */
export interface LineaVentaDeFactura {
  /** Renglón en la versión vigente. */
  renglon: number;
  /** Producto. */
  producto: ProductoDeLinea;
  /** Escala con que se vendió. */
  escala: EscalaPrecio;
  /** Cantidad en milésimas. */
  cantidad: number;
  /** Precio de la escala al vender. */
  precioEscala: number;
  /** Precio vendido. */
  precio: number;
  /** Costo del producto al vender. */
  costo: number;
  /** Total de la línea. */
  total: number;
}

/**
 * Datos comunes de una factura (de cliente o de proveedor) abierta para
 * corregirla, anularla o devolverle mercancía.
 */
interface FacturaParaCorregirBase {
  /** Id interno. */
  id: number;
  /** Número (de venta, o interno de la compra). */
  numero: number;
  /** Plazo en días. */
  plazoDias: number;
  /** Vencimiento, `AAAA-MM-DD`. */
  vence: string;
  /** Bodega. */
  bodegaId: number;
  /** Nombre de la bodega. */
  bodegaNombre: string;
  /** Versión vigente. */
  version: number;
  /** Estado. */
  estado: 'activa' | 'anulada';
  /** Fecha ISO de la anulación, o `null`. */
  anuladaEn: string | null;
  /** Motivo de la anulación, o `null`. */
  motivoAnulacion: string | null;
  /** Cliente o proveedor. */
  tercero: { codigo: number; nombre: string; identificacion: string };
  /** Cartera de la factura. */
  cartera: CarteraDeFactura;
  /** Saldo a favor disponible del tercero. */
  saldoFavor: number;
  /** Abonos aplicados (activos y anulados). */
  abonos: AbonoDeFactura[];
  /** Versiones, de la original a la vigente. */
  versiones: VersionDeFactura[];
  /** Devoluciones (activas y anuladas), de la más reciente a la más antigua. */
  devoluciones: DevolucionResumen[];
  /** Lo ya devuelto por renglón (devoluciones activas). */
  yaDevuelto: DevueltoDeRenglon[];
}

/**
 * Factura de cliente abierta para corregirla, anularla o devolverle mercancía.
 */
export interface FacturaClienteParaCorregir extends FacturaParaCorregirBase {
  /** Fecha ISO en que se guardó la original. */
  fecha: string;
  /** Venta hecha en la app o saldo inicial importado (sin líneas). */
  origen: 'venta' | 'saldo_inicial';
  /** Contado o crédito. */
  condicion: CondicionPago;
  /** Forma de pago (contado) o `null`. */
  formaPagoId: number | null;
  /** Nombre de la forma de pago, o `null`. */
  formaPagoNombre: string | null;
  /** «Su ahorro fue de». */
  ahorro: number;
  /** Líneas de la versión vigente. */
  lineas: LineaVentaDeFactura[];
}

/**
 * Producto de una línea de compra, con lo que necesita el cálculo del costo.
 */
export interface ProductoDeLineaCompra extends ProductoDeLinea {
  /** Costo actual del producto. */
  costo: number;
  /** Precios de las tres escalas. */
  precios: PreciosProducto;
  /** Proveedor al que pertenece. */
  proveedorCodigo: number;
}

/**
 * Línea vigente de una factura de proveedor.
 */
export interface LineaCompraDeFactura {
  /** Renglón en la versión vigente. */
  renglon: number;
  /** Producto. */
  producto: ProductoDeLineaCompra;
  /** Cantidad en milésimas. */
  cantidad: number;
  /** Costo unitario facturado. */
  costoUnitario: number;
  /** Total de la línea. */
  total: number;
  /** Parte del flete. */
  flete: number;
  /** Parte del descuento. */
  descuento: number;
  /** Costo nuevo que resultó para la línea. */
  costoNuevo: number;
}

/**
 * Situación del costo de un producto frente a una compra (D-126).
 */
export interface CostoDeProductoEnCompra {
  /** Código del producto. */
  productoCodigo: number;
  /** Si la compra es la última compra activa del producto. */
  esUltima: boolean;
  /** Costo nuevo del producto en la compra activa anterior, o `null`. */
  costoCompraAnterior: number | null;
  /** Número de la compra activa anterior, o `null`. */
  compraAnterior: number | null;
  /** Compra activa posterior que fija el costo (si no es la última), o `null`. */
  compraPosterior: { numero: number; fecha: string } | null;
}

/**
 * Factura de proveedor abierta para corregirla, anularla o devolverle mercancía.
 */
export interface FacturaProveedorParaCorregir extends FacturaParaCorregirBase {
  /** Fecha de la factura, `AAAA-MM-DD`. */
  fecha: string;
  /** Número de la factura del proveedor. */
  numeroProveedor: string;
  /** Compra hecha en la app o saldo inicial importado (sin líneas). */
  origen: 'compra' | 'saldo_inicial';
  /** Subtotal vigente. */
  subtotal: number;
  /** Flete vigente. */
  flete: number;
  /** Si el flete lo cobra el proveedor (D-59). */
  fleteProveedor: boolean;
  /** Descuento tal como se escribió. */
  descuento: DescuentoCompra;
  /** Descuento en pesos. */
  descuentoPesos: number;
  /** Si el descuento se reparte en el costo (D-47). */
  descuentoEnCosto: boolean;
  /** Abono automático si fue «Pagada de contado», o `null`. */
  abonoContado: { id: number; numero: number } | null;
  /** Líneas de la versión vigente. */
  lineas: LineaCompraDeFactura[];
  /** Situación del costo de cada producto de la compra. */
  costos: CostoDeProductoEnCompra[];
}

/**
 * Cambio pedido en una línea de venta.
 */
export interface CambioLineaVentaPedido {
  /** Renglón de la versión vigente. */
  renglon: number;
  /** Cantidad nueva en milésimas (0 quita la línea). */
  cantidad: number;
  /** Precio nuevo. */
  precio: number;
}

/**
 * Datos para corregir una factura de cliente.
 */
export interface PeticionCorregirVenta {
  /** Id de la factura. */
  facturaId: number;
  /** Versión que se corrigió en pantalla (evita guardar dos veces, o sobre otra corrección). */
  version: number;
  /** Cambios por línea (las líneas sin cambio pueden faltar). */
  cambios: CambioLineaVentaPedido[];
  /** Motivo (opcional). */
  motivo: string;
}

/**
 * Cambio pedido en una línea de compra.
 */
export interface CambioLineaCompraPedido {
  /** Renglón de la versión vigente. */
  renglon: number;
  /** Cantidad nueva en milésimas (0 quita la línea). */
  cantidad: number;
  /** Costo unitario nuevo. */
  costoUnitario: number;
}

/**
 * Datos para corregir una factura de proveedor.
 */
export interface PeticionCorregirCompra {
  /** Id de la factura. */
  facturaId: number;
  /** Versión que se corrigió en pantalla. */
  version: number;
  /** Cambios por línea. */
  cambios: CambioLineaCompraPedido[];
  /** Flete nuevo. */
  flete: number;
  /** Descuento nuevo. */
  descuento: DescuentoCompra;
  /** Motivo (opcional). */
  motivo: string;
}

/**
 * Datos para anular una factura de cliente o de proveedor.
 */
export interface PeticionAnularFactura {
  /** Cliente (factura de venta) o proveedor (compra). */
  tipo: TipoTercero;
  /** Id de la factura. */
  facturaId: number;
  /** Versión que se vio en pantalla. */
  version: number;
  /** Motivo (opcional). */
  motivo: string;
}

/**
 * Reintegro registrado por una operación.
 */
export interface ReintegroGenerado {
  /** Id interno. */
  id: number;
  /** Número del reintegro. */
  numero: number;
  /** Entrega o recibe. */
  sentido: SentidoReintegro;
  /** Valor. */
  valor: number;
  /** Forma de pago. */
  formaPagoNombre: string;
}

/**
 * Cambio del costo de un producto hecho por una corrección o una anulación de compra.
 */
export interface CambioCostoProducto {
  /** Código del producto. */
  productoCodigo: number;
  /** Costo anterior. */
  anterior: number;
  /** Costo nuevo. */
  nuevo: number;
}

/**
 * Resultado de guardar una corrección.
 */
export interface CorreccionGuardada {
  /** Id de la factura. */
  facturaId: number;
  /** Número de la factura. */
  numero: number;
  /** Versión nueva. */
  version: number;
  /** Total anterior. */
  totalAnterior: number;
  /** Total nuevo. */
  total: number;
  /** Saldo de la factura después. */
  saldo: number;
  /** Movimiento del saldo a favor (positivo: se generó; negativo: se recuperó). */
  movimientoFavor: number;
  /** Reintegro de una venta de contado, o `null`. */
  reintegro: ReintegroGenerado | null;
  /** Costos de producto que cambiaron (compras). */
  costos: CambioCostoProducto[];
}

/**
 * Resultado de anular una factura.
 */
export interface AnulacionGuardada {
  /** Número de la factura. */
  numero: number;
  /** Movimiento del saldo a favor. */
  movimientoFavor: number;
  /** Reintegro de una venta de contado, o `null`. */
  reintegro: ReintegroGenerado | null;
  /** Costos de producto que volvieron al de la compra anterior. */
  costos: CambioCostoProducto[];
  /** Número del abono automático de contado que se anuló con la compra, o `null`. */
  abonoContadoAnulado: number | null;
}

/**
 * Cantidad pedida para devolver de una línea.
 */
export interface LineaDevolucionPedida {
  /** Renglón de la factura. */
  renglon: number;
  /** Milésimas a devolver (0 no devuelve esa línea). */
  cantidad: number;
}

/**
 * Datos para guardar una devolución.
 */
export interface PeticionGuardarDevolucion {
  /** Venta o compra. */
  tipo: TipoDevolucion;
  /** Id de la factura. */
  facturaId: number;
  /** Versión de la factura que se vio en pantalla. */
  version: number;
  /**
   * Cuántas devoluciones (activas y anuladas) tenía la factura al cargarla:
   * si cambió, la devolución ya se guardó (doble pulsación) u otra la cambió.
   */
  devolucionesConocidas: number;
  /** Bodega a la que reingresa (venta) o de la que sale (compra). */
  bodegaId: number;
  /** Cantidades pedidas. */
  lineas: LineaDevolucionPedida[];
  /** Motivo (opcional). */
  motivo: string;
}

/**
 * Resultado de guardar una devolución.
 */
export interface DevolucionGuardada {
  /** Id interno. */
  id: number;
  /** Número de la devolución. */
  numero: number;
  /** Total devuelto. */
  total: number;
  /** Saldo de la factura después. */
  saldo: number;
  /** Saldo a favor que generó. */
  movimientoFavor: number;
  /** Reintegro de una venta de contado, o `null`. */
  reintegro: ReintegroGenerado | null;
}

/**
 * Datos para anular un documento por su id (devolución, reintegro o ajuste).
 */
export interface PeticionAnularDocumento {
  /** Id interno. */
  id: number;
  /** Motivo (opcional). */
  motivo: string;
}

/**
 * Resultado de anular una devolución.
 */
export interface DevolucionAnulada {
  /** Número de la devolución. */
  numero: number;
  /** Saldo de la factura después. */
  saldo: number;
  /** Movimiento del saldo a favor (0 o negativo). */
  movimientoFavor: number;
  /** Reintegro de una venta de contado (se vuelve a cobrar), o `null`. */
  reintegro: ReintegroGenerado | null;
}

/**
 * Datos generales de la ventana de devolución.
 */
export interface ContextoDevolucion {
  /** Número que tendrá la próxima devolución de ese tipo. */
  siguienteNumero: number;
}

/**
 * Reintegro guardado, para la lista de reintegros del tercero.
 */
export interface ReintegroResumen {
  /** Id interno. */
  id: number;
  /** Número. */
  numero: number;
  /** Cliente o proveedor. */
  tipo: TipoTercero;
  /** Entrega o recibe. */
  sentido: SentidoReintegro;
  /** Saldo a favor o documento. */
  origen: OrigenReintegro;
  /** Documento que lo originó, p. ej. `Factura 84772` (solo origen documento). */
  documento: string | null;
  /** Fecha ISO en que se registró. */
  fecha: string;
  /** Forma de pago. */
  formaPagoNombre: string;
  /** Valor. */
  valor: number;
  /** Observación. */
  observacion: string;
  /** Estado. */
  estado: 'activo' | 'anulado';
  /** Fecha ISO de la anulación, o `null`. */
  anuladoEn: string | null;
  /** Motivo de la anulación, o `null`. */
  motivoAnulacion: string | null;
}

/**
 * Petición del saldo a favor de un tercero.
 */
export interface PeticionSaldoFavor {
  /** Cliente o proveedor. */
  tipo: TipoTercero;
  /** Código del tercero. */
  codigo: number;
}

/**
 * Saldo a favor de un tercero con sus reintegros.
 */
export interface SaldoFavorTercero {
  /** Saldo a favor disponible. */
  disponible: number;
  /** Reintegros del tercero, del más reciente al más antiguo. */
  reintegros: ReintegroResumen[];
}

/**
 * Datos para devolver en dinero un saldo a favor (reintegro, D-128).
 */
export interface PeticionReintegrar {
  /** Cliente o proveedor. */
  tipo: TipoTercero;
  /** Código del tercero. */
  terceroCodigo: number;
  /** Forma de pago (dinero; no la de sistema). */
  formaPagoId: number;
  /** Valor. */
  valor: number;
  /** Observación (opcional). */
  observacion: string;
  /**
   * Saldo a favor que se vio en pantalla: si cambió, el reintegro ya se
   * guardó (doble pulsación) u otra operación lo cambió.
   */
  disponibleEsperado: number;
}
