import { useCallback, useRef } from 'react';

/**
 * Candado contra la doble pulsación: ejecuta una tarea asíncrona solo si no
 * hay otra en curso. Usa una referencia (no el estado) porque dos pulsaciones
 * de Av. Pág llegan antes de que React vuelva a pintar con el botón
 * deshabilitado. El proceso principal también rechaza el segundo guardado
 * (versión o conteo de documentos), así que esto evita además el mensaje de
 * conflicto.
 *
 * @returns Función que ejecuta la tarea, o no hace nada si ya hay una en curso.
 *
 * @example
 * const conCandado = useCandado();
 * useAtajos({ guardarCorreccion: () => void conCandado(guardar) });
 */
export function useCandado(): (tarea: () => Promise<void>) => Promise<void> {
  const ocupado = useRef(false);
  return useCallback(async (tarea: () => Promise<void>): Promise<void> => {
    if (ocupado.current) return;
    ocupado.current = true;
    try {
      await tarea();
    } finally {
      ocupado.current = false;
    }
  }, []);
}
