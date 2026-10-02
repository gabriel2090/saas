import { describe, expect, it } from 'vitest';
import { formatearPorcentaje } from './porcentaje';

describe('formatearPorcentaje', () => {
  it('muestra un decimal con punto', () => {
    expect(formatearPorcentaje(174)).toBe('17.4 %');
    expect(formatearPorcentaje(98)).toBe('9.8 %');
    expect(formatearPorcentaje(0)).toBe('0.0 %');
    expect(formatearPorcentaje(1234)).toBe('123.4 %');
  });

  it('muestra el signo de los negativos', () => {
    expect(formatearPorcentaje(-15)).toBe('-1.5 %');
    expect(formatearPorcentaje(-3)).toBe('-0.3 %');
  });

  it('sin costo muestra una raya', () => {
    expect(formatearPorcentaje(null)).toBe('—');
  });
});
