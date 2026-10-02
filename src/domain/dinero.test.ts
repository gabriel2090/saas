import { describe, expect, it } from 'vitest';
import { aMilesimas, aPesos, valorLinea } from './dinero';
import { ErrorDeNegocio } from './errores';

describe('aPesos', () => {
  it('acepta enteros, incluidos negativos y cero', () => {
    expect(aPesos(1250000)).toBe(1250000);
    expect(aPesos(-500)).toBe(-500);
    expect(aPesos(0)).toBe(0);
  });

  it('rechaza decimales: el dinero nunca se maneja con float', () => {
    expect(() => aPesos(10.5)).toThrow(ErrorDeNegocio);
    expect(() => aPesos(Number.NaN)).toThrow(ErrorDeNegocio);
  });
});

describe('aMilesimas', () => {
  it('acepta enteros y rechaza decimales', () => {
    expect(aMilesimas(1500)).toBe(1500);
    expect(() => aMilesimas(1.5)).toThrow(ErrorDeNegocio);
  });
});

describe('valorLinea', () => {
  it('multiplica precio por cantidad en milésimas', () => {
    expect(valorLinea(aPesos(3000), aMilesimas(1500))).toBe(4500);
    expect(valorLinea(aPesos(2500), aMilesimas(3000))).toBe(7500);
  });

  it('redondea al peso más cercano, las mitades hacia arriba', () => {
    expect(valorLinea(aPesos(999), aMilesimas(333))).toBe(333); // 332,667
    expect(valorLinea(aPesos(1), aMilesimas(500))).toBe(1); // 0,5
    expect(valorLinea(aPesos(1), aMilesimas(499))).toBe(0); // 0,499
  });

  it('redondea simétricamente los valores negativos', () => {
    expect(valorLinea(aPesos(-1), aMilesimas(500))).toBe(-1);
    expect(valorLinea(aPesos(999), aMilesimas(-333))).toBe(-333);
  });
});
