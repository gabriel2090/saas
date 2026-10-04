/**
 * Tipos compartidos de la ventana de Reimpresiones (Fase 4b, §9.3): buscar
 * facturas de cliente, de proveedor y abonos de ambos para verlos o
 * reimprimirlos con la leyenda REIMPRESION.
 */

import type { TipoDocumentoImprimible } from './impresion';

/**
 * Tipos de documento que se pueden reimprimir: los mismos que se imprimen.
 */
export type TipoReimpresion = TipoDocumentoImprimible;

/**
 * Tipos de reimpresión aceptados, en el orden del selector.
 */
export const TIPOS_REIMPRESION: readonly TipoReimpresion[] = [
  'factura-cliente',
  'factura-proveedor',
  'abono-cliente',
  'abono-proveedor',
];

/**
 * Máximo de documentos que devuelve una búsqueda (los más recientes).
 */
export const MAXIMO_RESULTADOS_REIMPRESION = 200;

/**
 * Filtros de la búsqueda de documentos para reimprimir.
 */
export interface PeticionBuscarReimpresion {
  /** Tipo de documento. */
  tipo: TipoReimpresion;
  /**
   * Número del documento, número de la factura del proveedor, código o parte
   * del nombre del tercero; vacío trae todos los del rango.
   */
  texto: string;
  /** Primer día del rango, `AAAA-MM-DD`, o `null` sin límite. */
  desde: string | null;
  /** Último día del rango, `AAAA-MM-DD`, o `null` sin límite. */
  hasta: string | null;
}

/**
 * Documento encontrado para reimprimir.
 */
export interface DocumentoReimprimible {
  /** Id interno (el que se manda a imprimir). */
  id: number;
  /** Número del documento (de venta, «Compra No.» o del abono). */
  numero: number;
  /** Número de la factura del proveedor (solo compras); vacío en lo demás. */
  referencia: string;
  /** Día del documento, `AAAA-MM-DD`. */
  fecha: string;
  /** Código del cliente o del proveedor. */
  terceroCodigo: number;
  /** Nombre del cliente o del proveedor. */
  terceroNombre: string;
  /** Total vigente de la factura, o valor del abono. */
  total: number;
  /** Si está anulado. */
  anulado: boolean;
  /** Versión vigente (1 si no se corrigió; los abonos siempre 1). */
  version: number;
}

/**
 * Resultado de la búsqueda.
 */
export interface ResultadoBuscarReimpresion {
  /** Documentos, del más reciente al más antiguo. */
  documentos: DocumentoReimprimible[];
  /** Si había más que {@link MAXIMO_RESULTADOS_REIMPRESION} (hay que acotar la búsqueda). */
  truncado: boolean;
}
