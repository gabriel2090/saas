import { describe, expect, it } from 'vitest';
import { calcularStockPorBodega, stockTotal } from './stock';

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
