import { describe, expect, it } from 'vitest';
import { agruparMiles, formatearPesos } from './moneda';

describe('formatearPesos', () => {
  it('usa coma como separador de miles y no muestra decimales (D-02)', () => {
    expect(formatearPesos(1250000)).toBe('$ 1,250,000');
    expect(formatearPesos(999)).toBe('$ 999');
    expect(formatearPesos(1000)).toBe('$ 1,000');
    expect(formatearPesos(0)).toBe('$ 0');
  });

  it('pone el signo antes del símbolo en valores negativos', () => {
    expect(formatearPesos(-500)).toBe('-$ 500');
    expect(formatearPesos(-1234567)).toBe('-$ 1,234,567');
  });

  it('rechaza valores con decimales', () => {
    expect(() => formatearPesos(10.5)).toThrow(RangeError);
  });
});

describe('agruparMiles', () => {
  it('agrupa de a tres dígitos', () => {
    expect(agruparMiles(1234567890)).toBe('1,234,567,890');
    expect(agruparMiles(12)).toBe('12');
  });
});
