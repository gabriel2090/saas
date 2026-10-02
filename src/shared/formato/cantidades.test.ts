import { describe, expect, it } from 'vitest';
import { formatearCantidad, leerCantidad } from './cantidades';

describe('formatearCantidad', () => {
  it('muestra las unidades sin decimales', () => {
    expect(formatearCantidad(3000, 'UND')).toBe('3');
    expect(formatearCantidad(1250000, 'UND')).toBe('1,250');
  });

  it('muestra los kilogramos con tres decimales y punto decimal (D-13)', () => {
    expect(formatearCantidad(1500, 'KG')).toBe('1.500');
    expect(formatearCantidad(250, 'KG')).toBe('0.250');
    expect(formatearCantidad(1234567, 'KG')).toBe('1,234.567');
  });

  it('muestra el signo de las cantidades negativas', () => {
    expect(formatearCantidad(-1500, 'KG')).toBe('-1.500');
    expect(formatearCantidad(-2000, 'UND')).toBe('-2');
  });

  it('rechaza cantidades que no son enteras', () => {
    expect(() => formatearCantidad(1.5, 'KG')).toThrow(RangeError);
  });
});

describe('leerCantidad', () => {
  it('convierte kilogramos con hasta tres decimales', () => {
    expect(leerCantidad('1.5', 'KG')).toBe(1500);
    expect(leerCantidad('0.025', 'KG')).toBe(25);
    expect(leerCantidad('2', 'KG')).toBe(2000);
    expect(leerCantidad('1,250.250', 'KG')).toBe(1250250);
  });

  it('exige enteros en unidades', () => {
    expect(leerCantidad('3', 'UND')).toBe(3000);
    expect(leerCantidad('3.000', 'UND')).toBe(3000);
    expect(leerCantidad('1.5', 'UND')).toBeNull();
  });

  it('rechaza textos inválidos o con más de tres decimales', () => {
    expect(leerCantidad('', 'KG')).toBeNull();
    expect(leerCantidad('abc', 'KG')).toBeNull();
    expect(leerCantidad('1.2345', 'KG')).toBeNull();
  });

  it('acepta negativos (para ajustes)', () => {
    expect(leerCantidad('-1.5', 'KG')).toBe(-1500);
  });
});
