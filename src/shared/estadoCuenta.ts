import type { TipoCartera } from './reportes';

/**
 * Filtros del estado de cuenta de un cliente o de un proveedor (D-149).
 */
export interface PeticionEstadoCuenta {
  /** Cliente o proveedor. */
  tipo: TipoCartera;
  /** Código del tercero. */
  terceroCodigo: number;
  /** Primer día del periodo, `AAAA-MM-DD`. */
  desde: string;
  /** Último día del periodo, `AAAA-MM-DD` (los pendientes se calculan a ese día). */
  hasta: string;
}

/**
 * Datos del tercero en el recuadro del estado de cuenta.
 */
export interface TerceroEstadoCuenta {
  /** Código. */
  codigo: number;
  /** Nombre o razón social. */
  nombre: string;
  /** Tipo de identificación, p. ej. `CC` o `NIT`. */
  tipoIdentificacion: string;
  /** Número de identificación. */
  numeroIdentificacion: string;
  /** Celular. */
  celular: string;
  /** Dirección con el barrio, p. ej. `CARR 25 #122-04 LA PRADERA`. */
  direccion: string;
  /** Tope de crédito (solo clientes), o `null` sin tope. */
  tope: number | null;
}

/**
 * Renglón de «Movimientos del periodo». El saldo es neto: lo que se debe
 * menos el saldo a favor (negativo = a favor del tercero).
 */
export interface MovimientoEstadoCuenta {
  /** Día del movimiento, `AAAA-MM-DD`. */
  fecha: string;
  /** Documento, p. ej. `Factura 84765`, `Compra 37 v2` o `Abono 33`. */
  documento: string;
  /** Marca junto al documento si después se anuló (`ANULADA`, `ANULADO`), o vacía. */
  marca: string;
  /** Detalle en palabras, p. ej. `Crédito 8 días, vence 17/09/2026`. */
  detalle: string;
  /** Lo que aumenta el saldo neto (0 si no). */
  cargo: number;
  /** Lo que disminuye el saldo neto (0 si no). */
  abono: number;
  /** Saldo neto después del movimiento. */
  saldo: number;
}

/**
 * Documento con saldo al último día del periodo.
 */
export interface PendienteEstadoCuenta {
  /** Documento, p. ej. `Factura 84790` o `Compra 31 · FE-5521`. */
  documento: string;
  /** Fecha del documento, `AAAA-MM-DD`. */
  fecha: string;
  /** Vencimiento, `AAAA-MM-DD`. */
  vence: string;
  /** Si ya estaba vencido el último día del periodo. */
  vencida: boolean;
  /** Días vencido si `vencida`; si no, días que faltan (0 = vence ese día). */
  dias: number;
  /** Total vigente a esa fecha. */
  total: number;
  /** Lo aplicado por abonos activos a esa fecha. */
  abonado: number;
  /** Devoluciones y correcciones que bajaron el saldo (total − abonado − saldo). */
  devuelto: number;
  /** Saldo pendiente (> 0). */
  saldo: number;
}

/**
 * Cifras del recuadro final del estado de cuenta.
 */
export interface ResumenEstadoCuenta {
  /** Suma de los saldos pendientes. */
  pendiente: number;
  /** Parte vencida del saldo pendiente. */
  vencido: number;
  /** Saldo a favor del tercero al último día del periodo. */
  saldoFavor: number;
  /** Saldo pendiente menos saldo a favor (negativo si el saldo a favor es mayor). */
  neto: number;
}

/**
 * Estado de cuenta de un cliente o de un proveedor para un periodo (D-149).
 */
export interface ReporteEstadoCuenta {
  /** Cliente o proveedor. */
  tipo: TipoCartera;
  /** Momento en que se generó (ISO con zona). */
  corte: string;
  /** Tercero. */
  tercero: TerceroEstadoCuenta;
  /** Primer día del periodo. */
  desde: string;
  /** Último día del periodo. */
  hasta: string;
  /** Saldo neto al cierre del día anterior a `desde`. */
  saldoAnterior: number;
  /** Movimientos del periodo, del más antiguo al más reciente. */
  movimientos: MovimientoEstadoCuenta[];
  /** Suma de los cargos del periodo. */
  cargos: number;
  /** Suma de los abonos del periodo. */
  abonos: number;
  /** Saldo neto al final del periodo. */
  saldoFinal: number;
  /** Documentos con saldo al último día, del vencimiento más antiguo al más reciente. */
  pendientes: PendienteEstadoCuenta[];
  /** Recuadro final. */
  resumen: ResumenEstadoCuenta;
}

/**
 * Caracteres que Windows no admite en un nombre de archivo.
 */
const CARACTERES_PROHIBIDOS = /[<>:"/\\|?*]/g;

/**
 * Nombre del PDF del estado de cuenta: el tercero y el último día del
 * periodo en `dd-mm-aaaa` (D-165). Se quitan los caracteres que Windows no
 * admite en un nombre de archivo.
 *
 * @param nombreTercero - Nombre del cliente o del proveedor.
 * @param hasta - Último día del periodo, `AAAA-MM-DD`.
 * @returns Nombre del archivo con extensión `.pdf`.
 *
 * @example
 * nombreArchivoEstadoCuenta('AGRINA S.A.S.', '2026-10-04');
 * // 'Estado de cuenta AGRINA S.A.S. 04-10-2026.pdf'
 */
export function nombreArchivoEstadoCuenta(nombreTercero: string, hasta: string): string {
  const [anio, mes, dia] = hasta.split('-');
  const nombre = nombreTercero.replace(CARACTERES_PROHIBIDOS, ' ').replace(/\s+/g, ' ').trim();
  return `Estado de cuenta ${nombre} ${dia ?? ''}-${mes ?? ''}-${anio ?? ''}.pdf`;
}
