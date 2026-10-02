import { describe, expect, it } from 'vitest';
import {
  repartirAbono,
  resumenDeuda,
  saldoFactura,
  validarAplicaciones,
  validarTextoAbono,
} from './abonos';

/** Facturas de la maqueta del abono (docs/maquetas/abono-proveedor.html). */
const FACTURAS = [
  { id: 9, saldo: 380_000 },
  { id: 11, saldo: 825_700 },
  { id: 13, saldo: 1_244_300 },
];

/** Saldos de las facturas de la maqueta. */
const SALDOS = new Map(FACTURAS.map((f) => [f.id, f.saldo]));

describe('saldo y deuda', () => {
  it('el saldo es el total menos lo abonado', () => {
    expect(saldoFactura(1_125_700, 300_000)).toBe(825_700);
    expect(saldoFactura(1000, 1200)).toBe(-200);
  });

  it('separa la deuda vencida (vence antes de hoy)', () => {
    expect(
      resumenDeuda(
        [
          { saldo: 380_000, vence: '2026-09-19' },
          { saldo: 825_700, vence: '2026-10-02' },
          { saldo: 1_244_300, vence: '2026-10-22' },
          { saldo: 0, vence: '2026-01-01' },
        ],
        '2026-10-02',
      ),
    ).toEqual({ total: 2_450_000, vencido: 380_000 });
  });
});

describe('reparto del abono (D-51)', () => {
  it('aplica primero a las facturas más antiguas', () => {
    expect(repartirAbono(1_000_000, FACTURAS)).toEqual([
      { facturaId: 9, valor: 380_000 },
      { facturaId: 11, valor: 620_000 },
      { facturaId: 13, valor: 0 },
    ]);
  });

  it('si el valor supera la deuda, lo que sobra queda sin aplicar', () => {
    const reparto = repartirAbono(3_000_000, FACTURAS);
    expect(reparto.reduce((s, a) => s + a.valor, 0)).toBe(2_450_000);
  });

  it('un valor cero o negativo no aplica nada', () => {
    expect(repartirAbono(-5, FACTURAS).every((a) => a.valor === 0)).toBe(true);
  });
});

describe('validación del reparto (§8, D-71)', () => {
  it('acepta un reparto completo y descarta las aplicaciones en cero', () => {
    expect(validarAplicaciones(1_000_000, repartirAbono(1_000_000, FACTURAS), SALDOS)).toEqual([
      { facturaId: 9, valor: 380_000 },
      { facturaId: 11, valor: 620_000 },
    ]);
  });

  it('acepta un reparto editado por el usuario', () => {
    expect(
      validarAplicaciones(
        500_000,
        [
          { facturaId: 9, valor: 0 },
          { facturaId: 13, valor: 500_000 },
        ],
        SALDOS,
      ),
    ).toEqual([{ facturaId: 13, valor: 500_000 }]);
  });

  it('no aplica más que el saldo de una factura', () => {
    expect(() => validarAplicaciones(400_000, [{ facturaId: 9, valor: 400_000 }], SALDOS)).toThrow(
      /mayor que su saldo/,
    );
  });

  it('lo aplicado debe sumar exactamente el valor', () => {
    expect(() =>
      validarAplicaciones(1_000_000, [{ facturaId: 9, valor: 380_000 }], SALDOS),
    ).toThrow(/Falta repartir/);
    expect(() => validarAplicaciones(100_000, [{ facturaId: 9, valor: 200_000 }], SALDOS)).toThrow(
      /suma más/,
    );
  });

  it('rechaza valores inválidos, facturas repetidas o sin saldo', () => {
    expect(() => validarAplicaciones(0, [], SALDOS)).toThrow(/mayor que cero/);
    expect(() =>
      validarAplicaciones(
        200,
        [
          { facturaId: 9, valor: 100 },
          { facturaId: 9, valor: 100 },
        ],
        SALDOS,
      ),
    ).toThrow(/dos veces/);
    expect(() => validarAplicaciones(100, [{ facturaId: 99, valor: 100 }], SALDOS)).toThrow(
      /ya no tiene saldo/,
    );
    expect(() => validarAplicaciones(100, [{ facturaId: 9, valor: -100 }], SALDOS)).toThrow(
      /negativo/,
    );
  });
});

describe('textos del abono', () => {
  it('limpia la observación y limita su largo', () => {
    expect(validarTextoAbono('  pago   parcial ', 'Observación')).toBe('pago parcial');
    expect(() => validarTextoAbono('x'.repeat(151), 'Observación')).toThrow(/150/);
  });
});
