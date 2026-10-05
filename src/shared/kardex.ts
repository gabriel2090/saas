import type { UnidadMedida } from './formato/cantidades';
import type { TipoDocumentoImprimible } from './impresion';

/**
 * Filtros del kardex por producto y bodega (§5, D-146: con periodo).
 */
export interface PeticionKardex {
  /** Producto. */
  productoCodigo: number;
  /** Bodega, o `null` para todas juntas. */
  bodegaId: number | null;
  /** Primer día del periodo, `AAAA-MM-DD`. */
  desde: string;
  /** Último día del periodo, `AAAA-MM-DD`. */
  hasta: string;
}

/**
 * Documento que se puede abrir con «Ver documento» (Ctrl+D) desde una fila.
 */
export interface DocumentoVisible {
  /** Tipo de documento imprimible. */
  tipo: TipoDocumentoImprimible;
  /** Id interno. */
  id: number;
  /** Número para el título de la vista previa. */
  numero: number;
}

/**
 * Movimiento del kardex con su saldo corrido.
 */
export interface FilaKardex {
  /** Id del movimiento. */
  id: number;
  /** Fecha y hora del movimiento (ISO con zona). */
  fecha: string;
  /** Tipo de movimiento en palabras, p. ej. `Devolución de venta` o `Ajuste (merma)`. */
  movimiento: string;
  /** Documento de origen en palabras, p. ej. `Compra 31 · FE-5521`. */
  documento: string;
  /** Marca junto al documento en las filas de anulación (`ANULADA`, `ANULADO`) o vacía. */
  marca: string;
  /** Cliente o proveedor del documento, o vacío. */
  tercero: string;
  /** Bodega del movimiento. */
  bodega: string;
  /** Entrada en milésimas (0 si es salida). */
  entrada: number;
  /** Salida en milésimas, positiva (0 si es entrada). */
  salida: number;
  /** Saldo después del movimiento, en milésimas. */
  saldo: number;
  /** Costo unitario del movimiento, en pesos. */
  costoUnitario: number;
  /** Documento que abre «Ver documento», o `null` si no hay uno imprimible. */
  ver: DocumentoVisible | null;
}

/**
 * Kardex de un producto en una bodega (o en todas) para un periodo.
 */
export interface ReporteKardex {
  /** Momento en que se calculó (ISO con zona). */
  corte: string;
  /** Producto. */
  producto: {
    /** Código. */
    codigo: number;
    /** Nombre. */
    nombre: string;
    /** Unidad de medida. */
    unidad: UnidadMedida;
    /** Costo actual en pesos. */
    costo: number;
  };
  /** Nombre de la bodega, o `null` si son todas. */
  bodega: string | null;
  /** Periodo pedido. */
  desde: string;
  /** Periodo pedido. */
  hasta: string;
  /** Saldo al cierre del día anterior a `desde`, en milésimas. */
  saldoAnterior: number;
  /** Movimientos del periodo, del más antiguo al más reciente. */
  filas: FilaKardex[];
  /** Suma de entradas del periodo, en milésimas. */
  entradas: number;
  /** Suma de salidas del periodo, en milésimas (positiva). */
  salidas: number;
  /** Saldo al final del periodo, en milésimas. */
  saldoFinal: number;
  /** Saldo final valorizado al costo actual, en pesos (negativo si el saldo lo es). */
  valorCostoActual: number;
}
