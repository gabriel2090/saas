import { describe, expect, it } from 'vitest';
import { calcularStockPorBodega, diferenciaStockInicial, stockTotal } from './stock';

describe('stock desde el kardex', () => {
  it('suma los movimientos por bodega', () => {
    const stock = calcularStockPorBodega([
      { bodegaId: 1, cantidad: 10000 },
      { bodegaId: 1, cantidad: -2500 },
      { bodegaId: 2, cantidad: 1250 },
    ]);
    expect([...stock]).toEqual([
      [1, 7500],
      [2, 1250],
    ]);
    expect(stockTotal(stock)).toBe(8750);
  });

  it('sin movimientos no hay stock', () => {
    expect(calcularStockPorBodega([]).size).toBe(0);
    expect(stockTotal(new Map())).toBe(0);
  });

  it('admite stock negativo (se puede vender sin stock, §5.1)', () => {
    const stock = calcularStockPorBodega([
      { bodegaId: 1, cantidad: 1000 },
      { bodegaId: 1, cantidad: -3000 },
    ]);
    expect(stock.get(1)).toBe(-2000);
  });

  it('rechaza cantidades que no son milésimas enteras', () => {
    expect(() => calcularStockPorBodega([{ bodegaId: 1, cantidad: 1.5 }])).toThrow(RangeError);
  });
});

describe('diferenciaStockInicial (D-39, D-45)', () => {
  const base = {
    productoCodigo: 104,
    unidad: 'KG' as const,
    cantidad: 12_500,
    cantidadAnterior: 0,
    tieneOtrosMovimientos: false,
    permitirNegativo: true,
  };

  it('el negativo solo se acepta donde se permite (importador sí, ficha no)', () => {
    expect(diferenciaStockInicial({ ...base, cantidad: -2_000 })).toBe(-2_000);
    expect(() =>
      diferenciaStockInicial({ ...base, cantidad: -2_000, permitirNegativo: false }),
    ).toThrow('El stock inicial no puede ser negativo.');
  });

  it('la primera carga registra la cantidad completa', () => {
    expect(diferenciaStockInicial(base)).toBe(12_500);
  });

  it('volver a cargarlo registra solo la diferencia (el kardex no se edita)', () => {
    expect(diferenciaStockInicial({ ...base, cantidadAnterior: 10_000 })).toBe(2_500);
    expect(diferenciaStockInicial({ ...base, cantidad: 4_000, cantidadAnterior: 10_000 })).toBe(
      -6_000,
    );
    expect(diferenciaStockInicial({ ...base, cantidadAnterior: 12_500 })).toBe(0);
  });

  it('con otros movimientos el stock se corrige con un ajuste', () => {
    expect(() => diferenciaStockInicial({ ...base, tieneOtrosMovimientos: true })).toThrow(
      /ajuste de inventario/,
    );
  });

  it('en UND exige unidades enteras', () => {
    expect(diferenciaStockInicial({ ...base, unidad: 'UND', cantidad: 3_000 })).toBe(3_000);
    expect(() => diferenciaStockInicial({ ...base, unidad: 'UND', cantidad: 1_500 })).toThrow(
      /sin decimales/,
    );
    expect(() => diferenciaStockInicial({ ...base, cantidad: 1.5 })).toThrow(/no es válida/);
  });
});
