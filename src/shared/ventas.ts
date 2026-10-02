/**
 * Tipos compartidos de las ventas (factura de cliente, §7) y de las cuentas
 * por cobrar: los usan la ventana de facturar y el proceso principal.
 */

import type { ResumenDeuda } from './compras';
import type { EscalaPrecio } from './maestros';

/**
 * Condición de pago de una factura de cliente (§7).
 */
export type CondicionPago = 'contado' | 'credito';

/**
 * Número de borradores simultáneos de la ventana de facturar (§7).
 */
export const NUMERO_BORRADORES = 6;

/**
 * Código del cliente «Consumidor final», creado por el sistema (D-37).
 */
export const CODIGO_CONSUMIDOR_FINAL = 0;

/**
 * Línea de una factura nueva.
 */
export interface LineaVentaNueva {
  /** Producto. */
  productoCodigo: number;
  /** Escala elegida para la línea (§7). */
  escala: EscalaPrecio;
  /** Cantidad en milésimas. */
  cantidad: number;
  /** Precio alterado con F7, o `null` para vender al precio vigente de la escala. */
  precioAlterado: number | null;
}

/**
 * Pago de una factura de contado (D-90).
 */
export interface PagoContado {
  /** Forma de pago. */
  formaPagoId: number;
  /**
   * Lo que entregó el cliente, si la forma de pago calcula el cambio; `null`
   * si no se escribió (se toma el valor exacto) o la forma no calcula cambio.
   */
  recibido: number | null;
}

/**
 * Datos para guardar una factura de cliente.
 */
export interface PeticionGuardarFactura {
  /** Borrador del que sale (se vacía en la misma transacción), o `null`. */
  ranura: number | null;
  /** Cliente («Consumidor final» = 0). */
  clienteCodigo: number;
  /** Contado o crédito. */
  condicion: CondicionPago;
  /** Plazo en días (solo crédito; 0 en contado). */
  plazoDias: number;
  /** Bodega de donde sale la mercancía. */
  bodegaId: number;
  /** Líneas. */
  lineas: LineaVentaNueva[];
  /** Pago si es de contado; `null` a crédito. */
  contado: PagoContado | null;
  /** «No. cajas de empaque» (opcional, D-91). */
  cajasEmpaque: number | null;
}

/**
 * Resultado de guardar una factura de cliente.
 */
export interface FacturaGuardada {
  /** Id interno. */
  id: number;
  /** Número asignado. */
  numero: number;
  /** Total. */
  total: number;
  /** Cambio a devolver (contado con forma que calcula cambio), o `null`. */
  cambio: number | null;
}

/**
 * Factura vencida más antigua de un cliente, para explicar un bloqueo de crédito.
 */
export interface FacturaVencida {
  /** Número de la factura. */
  numero: number;
  /** Vencimiento, `AAAA-MM-DD`. */
  vence: string;
}

/**
 * Situación de crédito de un cliente (§5.2, S-03).
 */
export interface CreditoCliente {
  /** Tope de crédito en pesos, o `null` sin tope. */
  tope: number | null;
  /** Deuda actual, total y vencida. */
  deuda: ResumenDeuda;
  /** La factura vencida más antigua con saldo, o `null`. */
  vencidaMasAntigua: FacturaVencida | null;
  /** Plazo de su última factura a crédito no anulada, o `null` si no tiene (D-94). */
  ultimoPlazo: number | null;
}

/**
 * Datos generales de la ventana de facturar.
 */
export interface ContextoFacturar {
  /** Número que tendrá la próxima factura (se asigna al guardar). */
  siguienteNumero: number;
  /** Día de hoy, `AAAA-MM-DD`, según el reloj del proceso principal. */
  hoy: string;
  /** Si hay impresora térmica configurada (si no, se abre el diálogo de Windows, D-88). */
  impresoraConfigurada: boolean;
}

/**
 * Borrador guardado de la ventana de facturar (D-89). El contenido es el
 * formulario tal como lo serializa la pantalla.
 */
export interface BorradorGuardado {
  /** Ranura de 1 a {@link NUMERO_BORRADORES}. */
  ranura: number;
  /** Formulario en JSON. */
  contenido: string;
  /** Fecha ISO del último autoguardado. */
  actualizadoEn: string;
}

/**
 * Petición para autoguardar un borrador.
 */
export interface PeticionGuardarBorrador {
  /** Ranura de 1 a {@link NUMERO_BORRADORES}. */
  ranura: number;
  /** Formulario en JSON. */
  contenido: string;
}

/**
 * Configuración de la facturación que se edita en «Datos del negocio» (D-84, D-88).
 */
export interface ConfiguracionFacturacion {
  /** Número que tendrá la próxima factura de cliente. */
  siguienteNumero: number;
  /** Número más alto ya usado, o `null` si aún no hay facturas (el siguiente debe superarlo). */
  ultimoNumero: number | null;
  /** Nombre de la impresora térmica en Windows, o `null` si no se ha elegido. */
  impresora: string | null;
}

/**
 * Petición para guardar la configuración de la facturación.
 */
export interface PeticionConfigurarFacturacion {
  /** Número que tendrá la próxima factura de cliente. */
  siguienteNumero: number;
  /** Impresora térmica, o `null` para usar el diálogo de Windows. */
  impresora: string | null;
}

/**
 * Impresora instalada en Windows.
 */
export interface ImpresoraSistema {
  /** Nombre con que la conoce Windows. */
  nombre: string;
  /** Nombre para mostrar. */
  nombreVisible: string;
}
