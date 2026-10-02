import { describe, expect, it } from 'vitest';
import { agruparMiles, comasDeMilesValidas, formatearPesos, leerPesos } from './moneda';

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

describe('leerPesos', () => {
  it('lee pesos con o sin comas, signo y centavos en cero', () => {
    expect(leerPesos('13200')).toBe(13200);
    expect(leerPesos('$ 1,250,000')).toBe(1250000);
    expect(leerPesos('13200.00')).toBe(13200);
    expect(leerPesos('15,000.000')).toBe(15000);
  });

  it('rechaza centavos, negativos, texto y valores ambiguos (D-40)', () => {
    expect(leerPesos('13200.50')).toBeNull();
    expect(leerPesos('15.000')).toBeNull();
    expect(leerPesos('13,2')).toBeNull();
    expect(leerPesos('-500')).toBeNull();
    expect(leerPesos('abc')).toBeNull();
    expect(leerPesos('')).toBeNull();
  });
});

describe('comasDeMilesValidas', () => {
  it('acepta comas que agrupan de a tres y rechaza las demás', () => {
    expect(comasDeMilesValidas('1,250,000.5')).toBe(true);
    expect(comasDeMilesValidas('1250')).toBe(true);
    expect(comasDeMilesValidas('12,5')).toBe(false);
    expect(comasDeMilesValidas('1,25,000')).toBe(false);
  });
});
