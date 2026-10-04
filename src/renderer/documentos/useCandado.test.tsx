/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useCandado } from './useCandado';

afterEach(cleanup);

/**
 * Promesa que se resuelve desde fuera, para simular un guardado en curso.
 *
 * @returns La promesa y su función de resolver.
 */
function pendiente(): { promesa: Promise<void>; resolver: () => void } {
  let resolver = (): void => undefined;
  const promesa = new Promise<void>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
}

describe('useCandado', () => {
  it('ignora la segunda pulsación mientras la primera sigue en curso', async () => {
    const { result } = renderHook(() => useCandado());
    const guardado = pendiente();
    let llamadas = 0;
    const guardar = async (): Promise<void> => {
      llamadas += 1;
      await guardado.promesa;
    };
    let primera: Promise<void> = Promise.resolve();
    await act(async () => {
      primera = result.current(guardar);
      await result.current(guardar);
    });
    expect(llamadas).toBe(1);
    await act(async () => {
      guardado.resolver();
      await primera;
    });
    await act(async () => {
      await result.current(() => {
        llamadas += 1;
        return Promise.resolve();
      });
    });
    expect(llamadas).toBe(2);
  });

  it('se libera aunque la tarea falle', async () => {
    const { result } = renderHook(() => useCandado());
    await act(async () => {
      await expect(result.current(() => Promise.reject(new Error('falló')))).rejects.toThrow(
        'falló',
      );
    });
    let hecho = false;
    await act(async () => {
      await result.current(() => {
        hecho = true;
        return Promise.resolve();
      });
    });
    expect(hecho).toBe(true);
  });
});
