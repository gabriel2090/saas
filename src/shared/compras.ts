/**
 * Tipos compartidos de las compras (factura de proveedor, §6) y de las
 * cuentas por pagar: los usan la pantalla y el proceso principal.
 */

/**
 * Cómo se escribió el descuento de la compra (D-47).
 */
export type ModoDescuento = 'pesos' | 'porcentaje';

/**
 * Descuento de la compra tal como se escribió.
 */
export interface DescuentoCompra {
  /** Pesos o porcentaje. */
  modo: ModoDescuento;
  /** Pesos enteros, o centésimas de porcentaje (250 = 2.50 %) (D-69). */
  valor: number;
}

/**
 * Línea de una compra nueva.
 */
export interface LineaCompraNueva {
  /** Producto. */
  productoCodigo: number;
  /** Cantidad en milésimas. */
  cantidad: number;
  /** Costo unitario facturado por el proveedor, en pesos. */
  costoUnitario: number;
}

/**
 * Datos para guardar una factura de proveedor.
 */
export interface PeticionGuardarCompra {
  /** Proveedor. */
  proveedorCodigo: number;
  /** Número de la factura del proveedor (texto libre). */
  numeroProveedor: string;
  /** Fecha de la factura, `AAAA-MM-DD` (D-55). */
  fecha: string;
  /** Plazo en días. */
  plazoDias: number;
  /** Bodega donde entra la mercancía. */
  bodegaId: number;
  /** Orden de compra (opcional, D-57). */
  ordenCompra: string;
  /** Líneas. */
  lineas: LineaCompraNueva[];
  /** Flete a distribuir en el costo, en pesos (0 si no hay). */
  flete: number;
  /** Si el flete lo cobra el proveedor y suma al total a pagar (D-59). */
  fleteProveedor: boolean;
  /** Descuento. */
  descuento: DescuentoCompra;
  /** Si el descuento se reparte en el costo de los productos (D-47). */
  descuentoEnCosto: boolean;
  /** «Pagada de contado» con su forma de pago, o `null` (D-48). */
  contado: { formaPagoId: number } | null;
}

/**
 * Resultado de guardar una compra.
 */
export interface CompraGuardada {
  /** Id interno. */
  id: number;
  /** Número interno de la compra (D-54). */
  numero: number;
  /** Total a pagar. */
  total: number;
  /** Número del abono automático si fue de contado, o `null`. */
  abonoNumero: number | null;
}

/**
 * Deuda de un proveedor (§5.3).
 */
export interface ResumenDeuda {
  /** Suma de los saldos de sus facturas activas. */
  total: number;
  /** Parte de esa suma que ya venció. */
  vencido: number;
}

/**
 * Lo que la ventana de compra necesita al elegir un proveedor.
 */
export interface ContextoCompraProveedor {
  /** Deuda actual. */
  deuda: ResumenDeuda;
  /** Plazo de su última compra no anulada, o 0 (D-67). */
  ultimoPlazo: number;
}

/**
 * Datos generales de la ventana de compra.
 */
export interface ContextoCompra {
  /** Número que tendrá la próxima compra (se confirma al guardar). */
  siguienteNumero: number;
  /** Día de hoy, `AAAA-MM-DD`, según el reloj del proceso principal. */
  hoy: string;
}

/**
 * Stock de un producto en una bodega.
 */
export interface StockProducto {
  /** Producto. */
  productoCodigo: number;
  /** Cantidad en milésimas (suma del kardex). */
  cantidad: number;
}
