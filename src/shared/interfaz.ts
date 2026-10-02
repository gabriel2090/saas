import type { IdProceso } from './procesos';

/**
 * Cómo se ve la barra superior (D-108): ícono y nombre en una línea, o solo
 * íconos con ayuda emergente.
 */
export type ModoBarra = 'linea' | 'iconos';

/**
 * Modos de barra aceptados, para validar peticiones.
 */
export const MODOS_BARRA: readonly ModoBarra[] = ['linea', 'iconos'];

/**
 * Modo de barra cuando no hay preferencia guardada (D-108).
 */
export const MODO_BARRA_POR_DEFECTO: ModoBarra = 'linea';

/**
 * Escala de las zonas relativas: 10 000 = todo el escritorio. Se guardan en
 * enteros (diezmilésimas) para no depender de decimales.
 */
export const ESCALA_RELATIVA = 10_000;

/**
 * Rectángulo expresado en diezmilésimas del escritorio (0 a
 * {@link ESCALA_RELATIVA}), para que una ventana encajada siga su zona si el
 * escritorio cambia de tamaño.
 */
export interface RectRelativo {
  /** Borde izquierdo. */
  x: number;
  /** Borde superior. */
  y: number;
  /** Ancho. */
  ancho: number;
  /** Alto. */
  alto: number;
}

/**
 * Tamaño y posición que se recuerdan de una ventana entre sesiones (D-113).
 */
export interface GeometriaGuardada {
  /** Posición horizontal (píxeles) en estado normal. */
  x: number;
  /** Posición vertical (píxeles) en estado normal. */
  y: number;
  /** Ancho en estado normal, o `null` si se ajusta a su contenido. */
  ancho: number | null;
  /** Alto en estado normal, o `null` si se ajusta a su contenido. */
  alto: number | null;
  /** Si quedó maximizada. */
  maximizada: boolean;
  /** Zona en que quedó encajada, o `null` si estaba suelta. */
  encaje: RectRelativo | null;
}

/**
 * Preferencias de interfaz guardadas.
 */
export interface PreferenciasInterfaz {
  /** Modo de la barra superior. */
  barra: ModoBarra;
  /** Geometría recordada por proceso (solo los que el usuario movió o agrandó). */
  ventanas: Partial<Record<IdProceso, GeometriaGuardada>>;
}

/**
 * Petición para recordar la geometría de una ventana.
 */
export interface PeticionGuardarVentana {
  /** Proceso de la ventana. */
  id: IdProceso;
  /** Geometría a recordar. */
  geometria: GeometriaGuardada;
}
