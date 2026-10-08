import type {
  EstadoCopiaExterna,
  PerdidaAlRestaurar,
  TipoRespaldo,
} from '../domain/politica-respaldos';

/**
 * Una copia listada en la ventana Respaldos.
 */
export interface CopiaRespaldo {
  /** Nombre del archivo, sin carpeta. */
  nombre: string;
  /** Momento ISO de la copia. */
  fecha: string;
  /** Tipo de copia. */
  tipo: TipoRespaldo;
  /** Tamaño en bytes. */
  tamano: number;
}

/**
 * Estado de la ventana Respaldos.
 */
export interface EstadoRespaldos {
  /** Carpeta local de las copias. */
  carpeta: string;
  /** ISO de la última copia hecha en esta ejecución, o `null`. */
  ultimoRespaldo: string | null;
  /** Copias, de la más reciente a la más antigua. */
  copias: CopiaRespaldo[];
  /** Carpeta externa (USB o sincronizada). */
  externa: EstadoCopiaExterna;
  /** Aviso para la barra de estado, o `null` si no hay nada que advertir. */
  avisoExterna: string | null;
  /** Si hay clave de recuperación vigente (habilita el enlace del diálogo). */
  tieneClaveRecuperacion: boolean;
}

/**
 * De dónde sale la copia que se quiere restaurar.
 */
export type OrigenRestauracion =
  { tipo: 'copia'; nombre: string } | { tipo: 'archivo'; ruta: string };

/**
 * Cómo se confirma la restauración con la app abierta (D-174).
 */
export type CredencialRestauracion =
  { tipo: 'contrasena'; valor: string } | { tipo: 'clave'; valor: string };

/**
 * Lo que se perdería al restaurar, más la fecha de la copia.
 */
export interface PrevisualizacionRestauracion {
  /** Nombre del archivo. */
  nombre: string;
  /** Momento ISO de la copia. */
  fecha: string;
  /** Documentos que desaparecerían. */
  perdida: PerdidaAlRestaurar;
}

/**
 * Resultado de un diálogo de carpeta: cancelado, o el estado ya actualizado.
 */
export interface ResultadoCarpetaRespaldo {
  /** `true` si el usuario cerró el diálogo sin elegir. */
  cancelado: boolean;
  /** Estado nuevo, o `null` si canceló. */
  estado: EstadoRespaldos | null;
}

/**
 * Petición para restaurar: origen de la copia y credencial actual.
 */
export interface PeticionRestaurar {
  /** Copia de la lista o archivo elegido. */
  origen: OrigenRestauracion;
  /** Contraseña actual o clave de recuperación. */
  credencial: CredencialRestauracion;
}
