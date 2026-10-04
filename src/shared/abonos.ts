import type { ResumenDeuda } from './compras';

/**
 * A quién se le abona: un cliente (cuentas por cobrar) o un proveedor
 * (cuentas por pagar). Ambos funcionan igual (§8).
 */
export type TipoAbono = 'cliente' | 'proveedor';

/**
 * Tipos de abono aceptados, para validar peticiones.
 */
export const TIPOS_ABONO: readonly TipoAbono[] = ['cliente', 'proveedor'];

/**
 * Estado de un abono.
 */
export type EstadoAbono = 'activo' | 'anulado';

/**
 * Factura (de cliente o de proveedor) con saldo pendiente.
 */
export interface FacturaPendiente {
  /** Id interno de la factura. */
  id: number;
  /**
   * Número de la factura: el de la factura de venta, o el número interno de
   * la compra.
   */
  numero: number;
  /** Número de la factura del proveedor (vacío en las de cliente). */
  referencia: string;
  /** Si es un saldo inicial importado del sistema anterior (D-86). */
  saldoInicial: boolean;
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
  /** Id de la factura. */
  facturaId: number;
  /** Valor aplicado. */
  valor: number;
}

/**
 * Aplicación de un abono guardado, con los datos de la factura para mostrarla.
 */
export interface AplicacionAbonoDetalle extends AplicacionAbono {
  /** Número de la factura (de venta o interno de la compra). */
  facturaNumero: number;
  /** Número de la factura del proveedor (vacío en las de cliente). */
  referencia: string;
  /** Si la factura es un saldo inicial. */
  saldoInicial: boolean;
  /** Saldo actual de la factura (para explicar el efecto de anular, D-62). */
  saldoActual: number;
}

/**
 * Abono guardado, para la lista de abonos anteriores y el recibo.
 */
export interface AbonoResumen {
  /** Id interno. */
  id: number;
  /** Cliente o proveedor. */
  tipo: TipoAbono;
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
 * Lo que la ventana de abono necesita al elegir el cliente o el proveedor.
 */
export interface ContextoAbonoTercero {
  /** Deuda actual (lo que debe el cliente, o lo que se le debe al proveedor). */
  deuda: ResumenDeuda;
  /** Facturas con saldo, de la más antigua a la más reciente (D-51). */
  facturas: FacturaPendiente[];
  /** Abonos anteriores, del más reciente al más antiguo. */
  abonos: AbonoResumen[];
  /** Saldo a favor disponible del tercero (D-120). */
  saldoFavor: number;
}

/**
 * Datos generales de la ventana de abono.
 */
export interface ContextoAbono {
  /** Número que tendrá el próximo abono (se confirma al guardar). */
  siguienteNumero: number;
  /** Día de hoy, `AAAA-MM-DD`. */
  hoy: string;
  /** Forma de pago de sistema «Saldo a favor» (D-130), que no está en el catálogo editable. */
  formaSaldoFavor: { id: number; nombre: string };
}

/**
 * Petición del contexto de un cliente o proveedor en la ventana de abono.
 */
export interface PeticionContextoAbono {
  /** Cliente o proveedor. */
  tipo: TipoAbono;
  /** Código del tercero. */
  codigo: number;
}

/**
 * Datos para guardar un abono.
 */
export interface PeticionGuardarAbono {
  /** Cliente o proveedor. */
  tipo: TipoAbono;
  /** Código del cliente o del proveedor. */
  terceroCodigo: number;
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
