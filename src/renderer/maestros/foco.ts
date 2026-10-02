/**
 * Selector del primer campo editable de una ficha.
 */
const SELECTOR_CAMPO_EDITABLE =
  'input:not([readonly]):not([disabled]):not([type="checkbox"]), select:not([disabled]), textarea:not([readonly])';

/**
 * Lleva el foco al primer campo editable de la ficha (Enter sobre la lista).
 *
 * @param ficha - Contenedor de la ficha (puede no estar montado).
 */
export function enfocarPrimerCampo(ficha: HTMLElement | null): void {
  ficha?.querySelector<HTMLElement>(SELECTOR_CAMPO_EDITABLE)?.focus();
}
