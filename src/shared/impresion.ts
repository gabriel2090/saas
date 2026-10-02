/**
 * Tipos de documento imprimibles.
 */
export type TipoDocumentoImprimible = 'abono-proveedor' | 'factura-cliente';

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
}
