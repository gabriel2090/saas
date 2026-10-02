import { createContext, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { COMBINACIONES_BLOQUEADAS } from '../../shared/keymap';
import { despacharAtajo, type CapaAtajos, type ManejadorCapa, type PrioridadCapa } from './capas';
import { combinacionDeEvento, esCampoDeTexto, normalizarCombinacion } from './combinacion';

/**
 * Operaciones del registro de capas de atajos.
 */
export interface RegistroAtajos {
  /**
   * Registra una capa de atajos.
   *
   * @param prioridad - Prioridad de la capa.
   * @param manejadores - Combinación normalizada → manejador.
   * @returns Función para quitar la capa.
   */
  registrar(prioridad: PrioridadCapa, manejadores: ReadonlyMap<string, ManejadorCapa>): () => void;
}

/**
 * Contexto con el registro de atajos (lo usan los hooks de `useAtajos`).
 */
export const ContextoAtajos = createContext<RegistroAtajos | null>(null);

/**
 * Combinaciones de Chromium que siempre se interceptan.
 */
const BLOQUEADAS = new Set(COMBINACIONES_BLOQUEADAS.map(normalizarCombinacion));

/**
 * Propiedades de {@link ProveedorAtajos}.
 */
interface PropiedadesProveedorAtajos {
  /** Contenido de la aplicación. */
  children: ReactNode;
}

/**
 * Escucha el teclado en toda la aplicación (fase de captura) y despacha cada
 * combinación a la capa de atajos que corresponda. Intercepta con
 * `preventDefault` las combinaciones reservadas por Chromium y las que
 * algún manejador atendió.
 *
 * @param props - Propiedades del componente.
 * @returns El proveedor de contexto.
 */
export function ProveedorAtajos({ children }: PropiedadesProveedorAtajos): ReactNode {
  const capas = useRef<CapaAtajos[]>([]);
  const siguienteId = useRef(1);

  const registrar = useCallback<RegistroAtajos['registrar']>((prioridad, manejadores) => {
    const capa: CapaAtajos = { id: siguienteId.current++, prioridad, manejadores };
    capas.current = [...capas.current, capa];
    return () => {
      capas.current = capas.current.filter((c) => c !== capa);
    };
  }, []);

  useEffect(() => {
    const alPresionar = (evento: KeyboardEvent): void => {
      const combinacion = combinacionDeEvento(evento);
      if (combinacion === null) {
        return;
      }
      const manejado = despacharAtajo(
        capas.current,
        combinacion,
        esCampoDeTexto(document.activeElement),
      );
      if (manejado) {
        evento.preventDefault();
        evento.stopPropagation();
      } else if (BLOQUEADAS.has(combinacion)) {
        evento.preventDefault();
      }
    };
    window.addEventListener('keydown', alPresionar, true);
    return () => window.removeEventListener('keydown', alPresionar, true);
  }, []);

  const valor = useMemo(() => ({ registrar }), [registrar]);
  return <ContextoAtajos.Provider value={valor}>{children}</ContextoAtajos.Provider>;
}
