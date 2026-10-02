import type { UnidadMedida } from './formato/cantidades';

/**
 * Tipos de ajuste de inventario (§9.2, D-46).
 */
export type TipoAjuste = 'merma' | 'dano' | 'conteo';

/**
 * Tipos de ajuste con su nombre en pantalla.
 */
export const TIPOS_AJUSTE: readonly { valor: TipoAjuste; etiqueta: string }[] = [
  { valor: 'merma', etiqueta: 'Merma' },
  { valor: 'dano', etiqueta: 'Daño' },
  { valor: 'conteo', etiqueta: 'Conteo físico' },
];

/**
 * Datos para registrar un ajuste de inventario.
 */
export interface PeticionAjuste {
  /** Producto. */
  productoCodigo: number;
  /** Bodega. */
  bodegaId: number;
  /** Tipo de ajuste. */
  tipo: TipoAjuste;
  /**
   * Milésimas: en merma y daño, lo que se resta (positivo); en el conteo
   * físico, la cantidad contada.
   */
  cantidad: number;
  /** Motivo (obligatorio). */
  motivo: string;
}

/**
 * Ajuste de inventario guardado.
 */
export interface AjusteResumen {
  /** Id interno. */
  id: number;
  /** Número del ajuste. */
  numero: number;
  /** Fecha ISO con hora en que se registró. */
  fecha: string;
  /** Producto. */
  productoCodigo: number;
  /** Nombre del producto. */
  productoNombre: string;
  /** Unidad del producto. */
  unidad: UnidadMedida;
  /** Nombre de la bodega. */
  bodegaNombre: string;
  /** Tipo de ajuste. */
  tipo: TipoAjuste;
  /** Lo que movió el kardex, en milésimas con signo. */
  cantidad: number;
  /** Stock de la bodega antes del ajuste. */
  stockAnterior: number;
  /** Cantidad contada (solo conteo físico), o `null`. */
  cantidadContada: number | null;
  /** Motivo. */
  motivo: string;
}
