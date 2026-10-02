import { describe, expect, it } from 'vitest';
import { indiceSiguienteEnfocable } from './navegacion';

describe('indiceSiguienteEnfocable', () => {
  it('avanza y retrocede dentro de los límites', () => {
    expect(indiceSiguienteEnfocable(3, 0, 1)).toBe(1);
    expect(indiceSiguienteEnfocable(3, 2, -1)).toBe(1);
  });

  it('no se sale de los extremos', () => {
    expect(indiceSiguienteEnfocable(3, 2, 1)).toBeNull();
    expect(indiceSiguienteEnfocable(3, 0, -1)).toBeNull();
  });

  it('sin foco, va al primero (abajo) o al último (arriba)', () => {
    expect(indiceSiguienteEnfocable(3, -1, 1)).toBe(0);
    expect(indiceSiguienteEnfocable(3, -1, -1)).toBe(2);
  });

  it('sin elementos, no hay destino', () => {
    expect(indiceSiguienteEnfocable(0, -1, 1)).toBeNull();
  });
});
