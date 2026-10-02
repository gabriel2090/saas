import { createContext, useContext } from 'react';
import type { IdProceso } from '../../shared/procesos';

/**
 * Datos y operaciones de la ventana interna que contiene a un componente.
 */
export interface DatosVentana {
  /** Proceso de la ventana. */
  id: IdProceso;
  /** Si es la ventana activa (al frente). Los atajos de la ventana solo actúan si lo es. */
  activa: boolean;
  /**
   * Marca si hay cambios sin guardar (para confirmar al cerrar).
   *
   * @param conCambios - Si hay cambios.
   */
  marcarCambios: (conCambios: boolean) => void;
  /** Pide cerrar la ventana (con confirmación). */
  cerrar: () => void;
}

/**
 * Contexto de la ventana interna actual.
 */
export const ContextoVentana = createContext<DatosVentana | null>(null);

/**
 * Devuelve los datos de la ventana interna que contiene al componente.
 *
 * @returns Datos de la ventana.
 * @throws {Error} Si se usa fuera de una ventana interna.
 */
export function useVentana(): DatosVentana {
  const datos = useContext(ContextoVentana);
  if (!datos) {
    throw new Error('useVentana debe usarse dentro de una ventana interna.');
  }
  return datos;
}
