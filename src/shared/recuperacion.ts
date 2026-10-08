import type { TipoRespaldo } from '../domain/politica-respaldos';

/**
 * Cómo arrancó la aplicación: acceso normal o pantalla de recuperación.
 */
export type ModoArranque = 'acceso' | 'recuperacion';

/**
 * Resultado de preguntar cómo arrancó la aplicación.
 */
export interface EstadoArranque {
  /** Pantalla que debe mostrarse antes de cualquier otra. */
  modo: ModoArranque;
}

/**
 * Copia encontrada al arrancar con la base dañada.
 */
export interface CopiaRecuperacion {
  /** Nombre del archivo, sin ruta. */
  nombre: string;
  /** Momento ISO 8601 de la copia. */
  fecha: string;
  /** Tipo codificado en el nombre. */
  tipo: TipoRespaldo;
  /** Tamaño en bytes. */
  tamano: number;
  /** `true` si pasó integridad, es de esta app y el esquema es compatible. */
  valida: boolean;
  /** Motivo en español si no se puede usar, o `null`. */
  motivo: string | null;
  /** `true` en la copia válida más reciente. */
  recomendada: boolean;
}

/**
 * Lo que muestra la pantalla de recuperación, sin datos del negocio.
 */
export interface EstadoRecuperacion {
  /** Carpeta donde se buscaron las copias. */
  carpetaRespaldos: string;
  /** Aviso corto para el usuario. El detalle técnico va aparte, para soporte. */
  mensaje: string;
  /** Copias, de la más reciente a la más antigua. */
  copias: CopiaRecuperacion[];
  /**
   * Nombre con el que quedaría la base dañada si se restaura ahora.
   * No incluye la ruta.
   */
  nombreBaseDanada: string;
}

/**
 * Archivo elegido en el diálogo, ya validado.
 */
export interface ArchivoParaRecuperar {
  /** Ruta absoluta del archivo. */
  ruta: string;
  /** Nombre del archivo. */
  nombre: string;
  /** Momento ISO de la copia (del nombre, o de la fecha del archivo). */
  fecha: string;
}
