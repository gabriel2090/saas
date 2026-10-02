/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProveedorAtajos } from '../atajos/ProveedorAtajos';
import { BuscadorProcesos } from './BuscadorProcesos';

afterEach(cleanup);

/**
 * Monta el buscador dentro del proveedor de atajos.
 *
 * @returns Espías de elegir y cerrar, y el campo de búsqueda.
 */
function montar(): {
  alElegir: ReturnType<typeof vi.fn>;
  alCerrar: ReturnType<typeof vi.fn>;
  campo: HTMLElement;
} {
  const alElegir = vi.fn();
  const alCerrar = vi.fn();
  render(
    <ProveedorAtajos>
      <BuscadorProcesos alElegir={alElegir} alCerrar={alCerrar} />
    </ProveedorAtajos>,
  );
  return { alElegir, alCerrar, campo: screen.getByRole('textbox') };
}

describe('BuscadorProcesos', () => {
  it('filtra al escribir y abre la opción seleccionada con Enter', () => {
    const { alElegir, campo } = montar();
    fireEvent.change(campo, { target: { value: 'abono' } });
    expect(screen.getAllByRole('option')).toHaveLength(2);
    fireEvent.keyDown(campo, { key: 'Enter', code: 'Enter' });
    expect(alElegir).toHaveBeenCalledWith('abono-cliente');
  });

  it('mueve la selección con la flecha abajo', () => {
    const { alElegir, campo } = montar();
    fireEvent.change(campo, { target: { value: 'abono' } });
    fireEvent.keyDown(campo, { key: 'ArrowDown', code: 'ArrowDown' });
    fireEvent.keyDown(campo, { key: 'Enter', code: 'Enter' });
    expect(alElegir).toHaveBeenCalledWith('abono-proveedor');
  });

  it('se cierra con Esc', () => {
    const { alCerrar, campo } = montar();
    fireEvent.keyDown(campo, { key: 'Escape', code: 'Escape' });
    expect(alCerrar).toHaveBeenCalledOnce();
  });

  it('avisa cuando no hay coincidencias', () => {
    const { campo } = montar();
    fireEvent.change(campo, { target: { value: 'zzzz' } });
    expect(screen.getByText('No hay procesos que coincidan.')).toBeTruthy();
  });
});
