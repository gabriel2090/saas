import { describe, expect, it } from 'vitest';
import { movimientoAjuste, movimientoAnulacionAjuste } from './ajustes';

describe('ajustes de inventario (D-46)', () => {
  it('la merma y el daño restan la cantidad indicada', () => {
    expect(
      movimientoAjuste({ tipo: 'merma', unidad: 'KG', cantidad: 1500, stockActual: 10_000 }),
    ).toBe(-1500);
    expect(movimientoAjuste({ tipo: 'dano', unidad: 'UND', cantidad: 2000, stockActual: 0 })).toBe(
      -2000,
    );
  });

  it('el conteo físico deja el stock en la cantidad contada', () => {
    expect(
      movimientoAjuste({ tipo: 'conteo', unidad: 'UND', cantidad: 8000, stockActual: 10_000 }),
    ).toBe(-2000);
    expect(
      movimientoAjuste({ tipo: 'conteo', unidad: 'UND', cantidad: 12_000, stockActual: 10_000 }),
    ).toBe(2000);
    expect(
      movimientoAjuste({ tipo: 'conteo', unidad: 'KG', cantidad: 0, stockActual: -1500 }),
    ).toBe(1500);
  });

  it('rechaza un conteo igual al stock', () => {
    expect(() =>
      movimientoAjuste({ tipo: 'conteo', unidad: 'UND', cantidad: 5000, stockActual: 5000 }),
    ).toThrow(/no hay nada que ajustar/);
  });

  it('rechaza cantidades inválidas', () => {
    expect(() =>
      movimientoAjuste({ tipo: 'merma', unidad: 'UND', cantidad: 0, stockActual: 5000 }),
    ).toThrow(/mayor que cero/);
    expect(() =>
      movimientoAjuste({ tipo: 'merma', unidad: 'UND', cantidad: 1500, stockActual: 5000 }),
    ).toThrow(/unidades/);
    expect(() =>
      movimientoAjuste({ tipo: 'dano', unidad: 'KG', cantidad: -1000, stockActual: 5000 }),
    ).toThrow(/no es válida/);
  });
});

describe('anulación de un ajuste (D-73, D-133)', () => {
  it('registra el movimiento contrario', () => {
    expect(movimientoAnulacionAjuste(-1500, 'activo')).toBe(1500);
    expect(movimientoAnulacionAjuste(2000, 'activo')).toBe(-2000);
  });

  it('no anula dos veces ni acepta cantidades inválidas', () => {
    expect(() => movimientoAnulacionAjuste(-1500, 'anulado')).toThrow(/ya está anulado/);
    expect(() => movimientoAnulacionAjuste(0, 'activo')).toThrow(/no es válida/);
  });
});
