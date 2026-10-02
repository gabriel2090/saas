import type { ResumenDeuda } from './compras';

/**
 * Estado de un abono.
 */
export type EstadoAbono = 'activo' | 'anulado';

/**
 * Factura de proveedor con saldo pendiente.
 */
export interface FacturaPendiente {
  /** Id interno de la compra. */
  id: number;
  /** Número interno de la compra. */
  numero: number;
  /** Número de la factura del proveedor. */
  numeroProveedor: string;
  /** Fecha de la factura, `AAAA-MM-DD`. */
  fecha: string;
  /** Vencimiento, `AAAA-MM-DD`. */
  vence: string;
  /** Total de la factura. */
  total: number;
  /** Saldo pendiente (total menos abonos activos). */
  saldo: number;
}

/**
 * Parte de un abono aplicada a una factura.
 */
export interface AplicacionAbono {
  /** Id de la compra. */
  facturaId: number;
  /** Valor aplicado. */
  valor: number;
}

/**
 * Aplicación de un abono guardado, con los datos de la compra para mostrarla.
 */
export interface AplicacionAbonoDetalle extends AplicacionAbono {
  /** Número interno de la compra. */
  compraNumero: number;
  /** Número de la factura del proveedor. */
  numeroProveedor: string;
  /** Saldo actual de la compra (para explicar el efecto de anular, D-62). */
  saldoActual: number;
}

/**
 * Abono guardado, para la lista de abonos anteriores y el recibo.
 */
export interface AbonoResumen {
  /** Id interno. */
  id: number;
  /** Número del abono. */
  numero: number;
  /** Fecha, `AAAA-MM-DD`. */
  fecha: string;
  /** Forma de pago. */
  formaPagoNombre: string;
  /** Valor. */
  valor: number;
  /** Observación. */
  observacion: string;
  /** `contado` si lo creó una compra «Pagada de contado» (D-48). */
  origen: 'manual' | 'contado';
  /** Estado. */
  estado: EstadoAbono;
  /** Fecha ISO de la anulación, o `null`. */
  anuladoEn: string | null;
  /** Motivo de la anulación, o `null`. */
  motivoAnulacion: string | null;
  /** Facturas a las que se aplicó. */
  aplicaciones: AplicacionAbonoDetalle[];
}

/**
 * Lo que la ventana de abono necesita al elegir un proveedor.
 */
export interface ContextoAbonoProveedor {
  /** Deuda actual. */
  deuda: ResumenDeuda;
  /** Facturas con saldo, de la más antigua a la más reciente (D-51). */
  facturas: FacturaPendiente[];
  /** Abonos anteriores, del más reciente al más antiguo. */
  abonos: AbonoResumen[];
}

/**
 * Datos generales de la ventana de abono.
 */
export interface ContextoAbono {
  /** Número que tendrá el próximo abono (se confirma al guardar). */
  siguienteNumero: number;
  /** Día de hoy, `AAAA-MM-DD`. */
  hoy: string;
}

/**
 * Datos para guardar un abono a proveedor.
 */
export interface PeticionGuardarAbono {
  /** Proveedor. */
  proveedorCodigo: number;
  /** Fecha, `AAAA-MM-DD` (D-71). */
  fecha: string;
  /** Forma de pago. */
  formaPagoId: number;
  /** Valor del abono. */
  valor: number;
  /** Observación (se imprime en el recibo). */
  observacion: string;
  /** Reparto entre facturas; debe sumar el valor (D-71). */
  aplicaciones: AplicacionAbono[];
}

/**
 * Resultado de guardar un abono.
 */
export interface AbonoGuardado {
  /** Id interno. */
  id: number;
  /** Número del abono. */
  numero: number;
}

/**
 * Datos para anular un abono.
 */
export interface PeticionAnularAbono {
  /** Id del abono. */
  id: number;
  /** Motivo (opcional, puede ir vacío). */
  motivo: string;
}
