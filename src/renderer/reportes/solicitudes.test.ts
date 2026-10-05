import { describe, expect, it, vi } from 'vitest';
import { crearCanalSolicitudes } from './solicitudes';

describe('canal de solicitudes entre ventanas', () => {
  it('sin ventana abierta, la solicitud queda pendiente hasta que se toma una vez', () => {
    const canal = crearCanalSolicitudes<number>();
    canal.pedir(5);
    canal.pedir(7);
    expect(canal.tomar()).toBe(7);
    expect(canal.tomar()).toBeNull();
  });

  it('con la ventana abierta, la recibe enseguida y no queda pendiente', () => {
    const canal = crearCanalSolicitudes<number>();
    const oyente = vi.fn();
    const dejar = canal.escuchar(oyente);
    canal.pedir(3);
    expect(oyente).toHaveBeenCalledWith(3);
    expect(canal.tomar()).toBeNull();
    dejar();
    canal.pedir(4);
    expect(oyente).toHaveBeenCalledTimes(1);
    expect(canal.tomar()).toBe(4);
  });
});
