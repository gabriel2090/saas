/**
 * Documento que se puede imprimir o guardar en PDF (D-52, D-72). El proceso
 * principal arma el HTML a partir del documento guardado: la pantalla solo
 * dice cuál.
 */
export interface DocumentoImprimible {
  /** Tipo de documento. La tirilla y las facturas llegan en la Fase 3. */
  tipo: 'abono-proveedor';
  /** Id interno del documento. */
  id: number;
  /** Si es una reimpresión (sale con la leyenda REIMPRESION, §9.3). */
  reimpresion: boolean;
}
