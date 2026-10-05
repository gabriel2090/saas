import type { DocumentoVisible } from './kardex';

/**
 * Conceptos del cierre de caja, en el orden en que se muestran (D-153).
 */
export const CONCEPTOS_CIERRE = [
  'ventas',
  'abonosClientes',
  'reintegrosRecibe',
  'abonosProveedores',
  'reintegrosEntrega',
  'anulacionesAnteriores',
] as const;

/**
 * Concepto del cierre de caja.
 */
export type ConceptoCierre = (typeof CONCEPTOS_CIERRE)[number];

/**
 * Signo con que cada concepto entra al movimiento del tramo. Las
 * anulaciones de días anteriores ya traen su signo en cada valor.
 */
export const SIGNO_CONCEPTO: Readonly<Record<ConceptoCierre, 1 | -1>> = {
  ventas: 1,
  abonosClientes: 1,
  reintegrosRecibe: 1,
  abonosProveedores: -1,
  reintegrosEntrega: -1,
  anulacionesAnteriores: 1,
};

/**
 * Nombre de cada concepto en pantalla y en el impreso.
 */
export const NOMBRE_CONCEPTO: Readonly<Record<ConceptoCierre, string>> = {
  ventas: 'Ventas de contado',
  abonosClientes: 'Abonos recibidos de clientes',
  reintegrosRecibe: 'Reintegros que recibe el negocio',
  abonosProveedores: 'Abonos pagados a proveedores',
  reintegrosEntrega: 'Reintegros que entrega el negocio',
  anulacionesAnteriores: 'Anulaciones de días anteriores',
};

/**
 * Forma de pago que es columna del cierre (las de sistema, como «Saldo a
 * favor», no son dinero y no van, D-130).
 */
export interface FormaCierre {
  /** Id de la forma de pago. */
  id: number;
  /** Nombre. */
  nombre: string;
  /** Si se cuenta a mano en el arqueo (las que calculan cambio, como Efectivo). */
  seCuenta: boolean;
  /** Si lleva la base de caja y el contador de billetes (la primera que se cuenta). */
  recibeBase: boolean;
}

/**
 * Renglón de un concepto: cantidad de documentos y valor por forma de pago,
 * en el orden de las columnas. Los valores van como se muestran: positivos
 * en los conceptos que suman o restan y con signo en las anulaciones.
 */
export interface FilaConceptoCierre {
  /** Concepto. */
  concepto: ConceptoCierre;
  /** Cantidad de documentos. */
  cantidad: number;
  /** Valor por forma de pago, en el orden de las columnas. */
  valores: number[];
}

/**
 * Documento que entra en un concepto del cierre (panel de la derecha).
 */
export interface DocumentoCierre {
  /** Clave única en el cierre, p. ej. `v12` o `a5`. */
  clave: string;
  /** Concepto en que entra. */
  concepto: ConceptoCierre;
  /** Documento, p. ej. `Factura 84796` o `Abono 60`. */
  documento: string;
  /** Tercero. */
  tercero: string;
  /** Forma de pago. */
  formaPagoId: number;
  /** Nombre de la forma de pago. */
  formaPago: string;
  /** Momento que cuenta (registro o anulación), ISO con zona. */
  momento: string;
  /** Valor como entra en el renglón del concepto. */
  valor: number;
  /** Aclaración, p. ej. «Anulado el 04/10/2026 9:40 a. m.». */
  nota: string;
  /** Documento que se puede ver con Ctrl+D, o `null`. */
  ver: DocumentoVisible | null;
}

/**
 * Abono pagado con la forma «Saldo a favor»: no es dinero, el cierre solo informa.
 */
export interface SaldoFavorAplicado {
  /** Documento, p. ej. `Abono 61`. */
  documento: string;
  /** Tercero. */
  tercero: string;
  /** Valor aplicado. */
  valor: number;
}

/**
 * Abono cuya fecha elegida no es el día en que se registró (D-151).
 */
export interface AbonoOtraFecha {
  /** Documento, p. ej. `Abono 60`. */
  documento: string;
  /** Tercero. */
  tercero: string;
  /** Valor. */
  valor: number;
  /** Forma de pago. */
  formaPago: string;
  /** Fecha elegida, `AAAA-MM-DD`. */
  dia: string;
  /** Momento de registro, ISO con zona. */
  registradoEn: string;
}

/**
 * Cálculo de un tramo del cierre: columnas, conceptos y documentos.
 */
export interface CalculoCierre {
  /** Columnas (formas de pago que son dinero). */
  formas: FormaCierre[];
  /** Un renglón por concepto, en el orden de {@link CONCEPTOS_CIERRE}. */
  filas: FilaConceptoCierre[];
  /** Movimiento del tramo por forma de pago (sin la base). */
  movimiento: number[];
  /** Documentos de todos los conceptos. */
  documentos: DocumentoCierre[];
  /** Abonos pagados con saldo a favor (no son dinero). */
  saldoFavor: SaldoFavorAplicado[];
  /** Abonos con una fecha elegida distinta de la de registro. */
  otraFecha: AbonoOtraFecha[];
}

/**
 * Denominación del contador de billetes y monedas.
 */
export interface Denominacion {
  /** Billete o moneda. */
  tipo: 'billete' | 'moneda';
  /** Valor en pesos. */
  valor: number;
}

/**
 * Cantidad contada de una denominación.
 */
export interface ConteoDenominacion extends Denominacion {
  /** Cantidad de billetes o monedas. */
  cantidad: number;
}

/**
 * Cierre guardado vigente que sirve de punto de partida.
 */
export interface CierreAnterior {
  /** Número. */
  numero: number;
  /** Momento en que se guardó (fin de su tramo). */
  hasta: string;
  /** Base que dejó en caja. */
  baseQueda: number;
}

/**
 * Lo que necesita la pantalla para un cierre nuevo: tramo desde el cierre
 * anterior vigente hasta este momento (D-150).
 */
export interface EstadoCierreNuevo {
  /** Número que tendrá el cierre al guardarlo. */
  numero: number;
  /** Cierre anterior vigente, o `null` si es el primero. */
  anterior: CierreAnterior | null;
  /** Cierres anulados después del anterior (su tramo lo cubre este). */
  anuladosEntre: number[];
  /** Momento del cálculo (el tramo llega hasta el momento de guardar). */
  hasta: string;
  /** Base inicial automática, o `null` en el primer cierre (se digita). */
  baseInicial: number | null;
  /** Cálculo del tramo. */
  calculo: CalculoCierre;
  /** Huella del cálculo, para avisar si hubo movimientos nuevos antes de guardar. */
  huella: string;
}

/**
 * Cierre de la lista «Ver».
 */
export interface CierreResumen {
  /** Número. */
  numero: number;
  /** Momento en que se guardó. */
  hasta: string;
  /** Estado. */
  estado: 'activo' | 'anulado';
}

/**
 * Valores del arqueo de una forma de pago guardada.
 */
export interface ArqueoForma {
  /** Esperado (movimiento más la base). */
  esperado: number;
  /** Contado. */
  contado: number;
  /** Contado menos esperado (negativo = faltante). */
  diferencia: number;
}

/**
 * Cierre de caja guardado, con su cálculo y su arqueo.
 */
export interface CierreGuardado {
  /** Id interno. */
  id: number;
  /** Número. */
  numero: number;
  /** Inicio del tramo (exclusivo), o `null` si fue el primer cierre. */
  desde: string | null;
  /** Momento en que se guardó (fin del tramo). */
  hasta: string;
  /** Número del cierre anterior vigente al guardarlo, o `null`. */
  anteriorNumero: number | null;
  /** Cierres anulados entre el anterior y este. */
  anuladosEntre: number[];
  /** Base inicial. */
  baseInicial: number;
  /** Base que quedó en caja. */
  baseQueda: number;
  /** Observación. */
  observacion: string;
  /** Estado. */
  estado: 'activo' | 'anulado';
  /** Momento de la anulación, o `null`. */
  anuladoEn: string | null;
  /** Motivo de la anulación, o `null`. */
  motivoAnulacion: string | null;
  /** Si es el último cierre vigente (el único que se puede anular). */
  esUltimo: boolean;
  /** Cálculo del tramo: totales guardados y documentos que los forman. */
  calculo: CalculoCierre;
  /** Arqueo por forma de pago, en el orden de las columnas. */
  arqueo: ArqueoForma[];
  /** Conteo de billetes y monedas, o `null` si el efectivo se digitó directo. */
  conteo: ConteoDenominacion[] | null;
}

/**
 * Contado de una forma de pago al guardar.
 */
export interface ContadoForma {
  /** Forma de pago. */
  formaPagoId: number;
  /** Valor contado. */
  valor: number;
}

/**
 * Datos para guardar el cierre nuevo.
 */
export interface PeticionGuardarCierre {
  /** Huella del cálculo que vio el usuario. */
  huella: string;
  /** Base inicial digitada (solo en el primer cierre; si no, `null`). */
  baseInicial: number | null;
  /** Contado por forma de pago (todas las columnas). */
  contado: ContadoForma[];
  /** Conteo de billetes y monedas, o `null`. */
  conteo: ConteoDenominacion[] | null;
  /** Base que queda en caja. */
  baseQueda: number;
  /** Observación (opcional). */
  observacion: string;
}

/**
 * Datos para anular un cierre (solo el último vigente).
 */
export interface PeticionAnularCierre {
  /** Número del cierre. */
  numero: number;
  /** Motivo. */
  motivo: string;
}
