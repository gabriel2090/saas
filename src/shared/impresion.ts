/**
 * Tipos de documento imprimibles.
 */
export type TipoDocumentoImprimible =
  'abono-proveedor' | 'abono-cliente' | 'factura-cliente' | 'factura-proveedor';

/**
 * Documento que se puede imprimir o guardar en PDF (D-52, D-72). El proceso
 * principal arma el HTML a partir del documento guardado: la pantalla solo
 * dice cuál.
 */
export interface DocumentoImprimible {
  /** Tipo de documento. */
  tipo: TipoDocumentoImprimible;
  /** Id interno del documento. */
  id: number;
  /** Si es una reimpresión (sale con la leyenda REIMPRESION, §9.3). */
  reimpresion: boolean;
  /**
   * Solo para los recibos de abono: `true` los imprime en la tirilla de 80 mm
   * («Imprimir recibo» y Reimpresiones, D-143); sin indicar, salen en hoja
   * carta (vista previa y PDF, D-93). Las facturas de cliente y de proveedor
   * siempre son tirilla.
   */
  tirilla?: boolean;
}
