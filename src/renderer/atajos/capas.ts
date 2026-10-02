/**
 * Prioridad de una capa de atajos:
 * - `global`: atajos de toda la app (Esc, Ctrl+0, Ctrl+K…).
 * - `ventana`: atajos de la ventana interna activa.
 * - `modal`: diálogos y buscador; bloquean las capas de abajo.
 */
export type PrioridadCapa = 'global' | 'ventana' | 'modal';

/**
 * Orden numérico de cada prioridad (mayor = se consulta primero).
 */
const PESO_PRIORIDAD: Record<PrioridadCapa, number> = { global: 0, ventana: 1, modal: 2 };

/**
 * Acción asociada a una combinación dentro de una capa.
 */
export interface ManejadorCapa {
  /**
   * Ejecuta la acción. Devolver `false` indica «no lo manejé» y se sigue
   * buscando en las capas de abajo (sin `preventDefault`).
   *
   * @returns `false` si no se manejó.
   */
  accion: () => boolean | void;
  /** Si actúa aunque el foco esté en un campo de texto. */
  permitirEnCampoTexto: boolean;
}

/**
 * Conjunto de atajos registrados por un componente.
 */
export interface CapaAtajos {
  /** Orden de registro (las más recientes ganan dentro de la misma prioridad). */
  id: number;
  /** Prioridad de la capa. */
  prioridad: PrioridadCapa;
  /** Combinación normalizada → manejador. */
  manejadores: ReadonlyMap<string, ManejadorCapa>;
}

/**
 * Ordena las capas de la que se consulta primero a la última.
 *
 * @param capas - Capas registradas.
 * @returns Copia ordenada por prioridad y luego por registro más reciente.
 */
export function ordenarCapas(capas: readonly CapaAtajos[]): CapaAtajos[] {
  return [...capas].sort(
    (a, b) => PESO_PRIORIDAD[b.prioridad] - PESO_PRIORIDAD[a.prioridad] || b.id - a.id,
  );
}

/**
 * Busca y ejecuta el manejador de una combinación recorriendo las capas.
 *
 * Una capa `modal` corta la búsqueda: lo que esté debajo no recibe teclas
 * mientras haya un diálogo abierto.
 *
 * @param capas - Capas registradas.
 * @param combinacion - Combinación normalizada del evento.
 * @param enCampoTexto - Si el foco está en un campo de texto.
 * @returns `true` si algún manejador la atendió.
 *
 * @example
 * despacharAtajo(capas, 'Escape', false); // ejecuta el Esc del diálogo abierto, si lo hay
 */
export function despacharAtajo(
  capas: readonly CapaAtajos[],
  combinacion: string,
  enCampoTexto: boolean,
): boolean {
  for (const capa of ordenarCapas(capas)) {
    const manejador = capa.manejadores.get(combinacion);
    if (manejador && (!enCampoTexto || manejador.permitirEnCampoTexto)) {
      if (manejador.accion() !== false) {
        return true;
      }
    }
    if (capa.prioridad === 'modal') {
      return false;
    }
  }
  return false;
}
