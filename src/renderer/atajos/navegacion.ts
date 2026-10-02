import type { RefObject } from 'react';
import { useAtajos } from './useAtajos';

/**
 * Selector de los elementos que pueden recibir el foco al navegar con flechas.
 */
const SELECTOR_ENFOCABLES = [
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Calcula el índice del elemento que debe recibir el foco.
 *
 * @param total - Cantidad de elementos enfocables.
 * @param actual - Índice del elemento con el foco (-1 si ninguno).
 * @param direccion - `1` hacia adelante, `-1` hacia atrás.
 * @returns Índice destino, o `null` si no hay a dónde moverse.
 *
 * @example
 * indiceSiguienteEnfocable(3, 0, 1);  // 1
 * indiceSiguienteEnfocable(3, 2, 1);  // null (ya está en el último)
 * indiceSiguienteEnfocable(3, -1, 1); // 0 (sin foco: va al primero)
 */
export function indiceSiguienteEnfocable(
  total: number,
  actual: number,
  direccion: 1 | -1,
): number | null {
  if (total === 0) {
    return null;
  }
  if (actual < 0) {
    return direccion === 1 ? 0 : total - 1;
  }
  const destino = actual + direccion;
  return destino >= 0 && destino < total ? destino : null;
}

/**
 * Mueve el foco al campo siguiente o anterior dentro de un contenedor.
 *
 * No actúa dentro de `<select>` ni `<textarea>`, donde las flechas tienen su
 * función propia; en ese caso devuelve `false` para que el navegador la haga.
 *
 * @param contenedor - Contenedor de los campos.
 * @param direccion - `1` hacia adelante, `-1` hacia atrás.
 * @returns `false` si no se manejó la tecla.
 */
function moverFoco(contenedor: HTMLElement | null, direccion: 1 | -1): boolean {
  if (!contenedor) {
    return false;
  }
  const activo = document.activeElement;
  if (
    activo &&
    contenedor.contains(activo) &&
    (activo.tagName === 'SELECT' || activo.tagName === 'TEXTAREA')
  ) {
    return false;
  }
  const enfocables = Array.from(contenedor.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLES));
  const actual = activo instanceof HTMLElement ? enfocables.indexOf(activo) : -1;
  const destino = indiceSiguienteEnfocable(enfocables.length, actual, direccion);
  if (destino !== null) {
    enfocables[destino]?.focus();
  }
  return true;
}

/**
 * Permite recorrer los campos de un formulario con flecha abajo y arriba
 * (§10: «Flechas: navegar por campos, listas y tablas»).
 *
 * @param contenedor - Referencia al contenedor de los campos.
 * @param activo - Si la navegación está activa (p. ej. solo en la ventana con el foco).
 */
export function useNavegacionFlechas(
  contenedor: RefObject<HTMLElement | null>,
  activo = true,
): void {
  useAtajos(
    {
      moverAbajo: () => moverFoco(contenedor.current, 1),
      moverArriba: () => moverFoco(contenedor.current, -1),
    },
    { prioridad: 'ventana', activo },
  );
}
