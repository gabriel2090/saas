import { describe, expect, it, vi } from 'vitest';
import { despacharAtajo, type CapaAtajos, type ManejadorCapa, type PrioridadCapa } from './capas';

/**
 * Crea una capa de prueba.
 *
 * @param id - Orden de registro.
 * @param prioridad - Prioridad de la capa.
 * @param manejadores - Combinación → manejador.
 * @returns Capa de atajos.
 */
function capa(
  id: number,
  prioridad: PrioridadCapa,
  manejadores: Record<string, ManejadorCapa>,
): CapaAtajos {
  return { id, prioridad, manejadores: new Map(Object.entries(manejadores)) };
}

/**
 * Crea un manejador espía.
 *
 * @param resultado - Lo que devuelve la acción.
 * @param permitirEnCampoTexto - Si actúa dentro de campos de texto.
 * @returns Manejador con `accion` espiada.
 */
function manejador(
  resultado: boolean | void = undefined,
  permitirEnCampoTexto = true,
): ManejadorCapa {
  return { accion: vi.fn(() => resultado), permitirEnCampoTexto };
}

describe('despacharAtajo', () => {
  it('la capa de ventana gana a la global', () => {
    const global = manejador();
    const ventana = manejador();
    const capas = [capa(1, 'global', { Escape: global }), capa(2, 'ventana', { Escape: ventana })];
    expect(despacharAtajo(capas, 'Escape', false)).toBe(true);
    expect(ventana.accion).toHaveBeenCalledOnce();
    expect(global.accion).not.toHaveBeenCalled();
  });

  it('si un manejador devuelve false, sigue con la capa de abajo (Esc «retrocede»)', () => {
    const global = manejador();
    const ventana = manejador(false);
    const capas = [capa(1, 'global', { Escape: global }), capa(2, 'ventana', { Escape: ventana })];
    expect(despacharAtajo(capas, 'Escape', false)).toBe(true);
    expect(global.accion).toHaveBeenCalledOnce();
  });

  it('una capa modal bloquea las de abajo aunque no maneje la tecla', () => {
    const global = manejador();
    const capas = [capa(1, 'global', { 'Ctrl+0': global }), capa(5, 'modal', {})];
    expect(despacharAtajo(capas, 'Ctrl+0', false)).toBe(false);
    expect(global.accion).not.toHaveBeenCalled();
  });

  it('la modal gana aunque se haya registrado antes que una ventana', () => {
    const modal = manejador();
    const ventana = manejador();
    const capas = [capa(1, 'modal', { Escape: modal }), capa(9, 'ventana', { Escape: ventana })];
    despacharAtajo(capas, 'Escape', false);
    expect(modal.accion).toHaveBeenCalledOnce();
    expect(ventana.accion).not.toHaveBeenCalled();
  });

  it('no dispara en campos de texto los atajos que no lo permiten (Ctrl+X corta)', () => {
    const anular = manejador(undefined, false);
    const capas = [capa(1, 'ventana', { 'Ctrl+X': anular })];
    expect(despacharAtajo(capas, 'Ctrl+X', true)).toBe(false);
    expect(anular.accion).not.toHaveBeenCalled();
    expect(despacharAtajo(capas, 'Ctrl+X', false)).toBe(true);
    expect(anular.accion).toHaveBeenCalledOnce();
  });

  it('entre capas de igual prioridad gana la registrada más recientemente', () => {
    const vieja = manejador();
    const nueva = manejador();
    despacharAtajo(
      [capa(1, 'ventana', { F7: vieja }), capa(2, 'ventana', { F7: nueva })],
      'F7',
      false,
    );
    expect(nueva.accion).toHaveBeenCalledOnce();
    expect(vieja.accion).not.toHaveBeenCalled();
  });
});
