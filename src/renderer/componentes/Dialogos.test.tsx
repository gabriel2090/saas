/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProveedorAtajos } from '../atajos/ProveedorAtajos';
import { ProveedorDialogos, useConfirmar, type Confirmar } from './Dialogos';

afterEach(cleanup);

/**
 * Monta los proveedores y devuelve la función `confirmar`.
 *
 * @returns Función para abrir diálogos.
 */
function montar(): Confirmar {
  let confirmar: Confirmar | null = null;
  /**
   * Componente auxiliar que captura la función del contexto.
   *
   * @returns Nada visible.
   */
  function Capturar(): null {
    confirmar = useConfirmar();
    return null;
  }
  render(
    <ProveedorAtajos>
      <ProveedorDialogos>
        <Capturar />
      </ProveedorDialogos>
    </ProveedorAtajos>,
  );
  if (!confirmar) {
    throw new Error('No se capturó confirmar.');
  }
  return confirmar;
}

describe('diálogo de confirmación', () => {
  it('resuelve true al pulsar «Sí»', async () => {
    const confirmar = montar();
    let respuesta: Promise<boolean> = Promise.resolve(false);
    act(() => {
      respuesta = confirmar({ titulo: 'Cerrar', mensaje: '¿Cerrar?' });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sí' }));
    await expect(respuesta).resolves.toBe(true);
  });

  it('resuelve false con Esc', async () => {
    const confirmar = montar();
    let respuesta: Promise<boolean> = Promise.resolve(true);
    act(() => {
      respuesta = confirmar({ titulo: 'Cerrar', mensaje: '¿Cerrar?' });
    });
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' });
    await expect(respuesta).resolves.toBe(false);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('en acciones peligrosas el foco inicial queda en «No»', () => {
    const confirmar = montar();
    act(() => {
      void confirmar({ titulo: 'Descartar', mensaje: '¿Descartar cambios?', peligroso: true });
    });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'No' }));
  });

  it('las flechas izquierda/derecha cambian de botón', () => {
    const confirmar = montar();
    act(() => {
      void confirmar({ titulo: 'Cerrar', mensaje: '¿Cerrar?' });
    });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Sí' }));
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'ArrowRight',
      code: 'ArrowRight',
    });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'No' }));
  });
});
