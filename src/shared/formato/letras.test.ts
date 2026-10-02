import { describe, expect, it } from 'vitest';
import { pesosEnLetras } from './letras';

describe('pesosEnLetras', () => {
  it('escribe el total de la factura actual (84771)', () => {
    expect(pesosEnLetras(79250)).toBe('SETENTA Y NUEVE MIL DOSCIENTOS CINCUENTA PESOS M/L');
  });

  it.each([
    [0, 'CERO PESOS M/L'],
    [1, 'UN PESO M/L'],
    [16, 'DIECISÉIS PESOS M/L'],
    [21, 'VEINTIÚN PESOS M/L'],
    [31, 'TREINTA Y UN PESOS M/L'],
    [100, 'CIEN PESOS M/L'],
    [101, 'CIENTO UN PESOS M/L'],
    [115, 'CIENTO QUINCE PESOS M/L'],
    [500, 'QUINIENTOS PESOS M/L'],
    [1000, 'MIL PESOS M/L'],
    [1001, 'MIL UN PESOS M/L'],
    [21000, 'VEINTIÚN MIL PESOS M/L'],
    [100000, 'CIEN MIL PESOS M/L'],
    [101000, 'CIENTO UN MIL PESOS M/L'],
    [999999, 'NOVECIENTOS NOVENTA Y NUEVE MIL NOVECIENTOS NOVENTA Y NUEVE PESOS M/L'],
    [1000000, 'UN MILLÓN DE PESOS M/L'],
    [1500000, 'UN MILLÓN QUINIENTOS MIL PESOS M/L'],
    [2000000, 'DOS MILLONES DE PESOS M/L'],
    [21000000, 'VEINTIÚN MILLONES DE PESOS M/L'],
    [1001000000, 'MIL UN MILLONES DE PESOS M/L'],
  ])('%i → %s', (valor, texto) => {
    expect(pesosEnLetras(valor)).toBe(texto);
  });

  it('rechaza decimales, negativos y valores fuera de rango', () => {
    expect(() => pesosEnLetras(1.5)).toThrow(RangeError);
    expect(() => pesosEnLetras(-1)).toThrow(RangeError);
    expect(() => pesosEnLetras(1_000_000_000_000)).toThrow(RangeError);
  });
});
