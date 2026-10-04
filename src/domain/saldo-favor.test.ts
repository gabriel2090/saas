import { describe, expect, it } from 'vitest';
import {
  ajustarCartera,
  movimientoFavorAlAnular,
  saldoDeFactura,
  saldoFavorDisponible,
  validarReversoGenerado,
  validarUsoSaldoFavor,
} from './saldo-favor';

describe('saldo de una factura (D-127)', () => {
  it('es el total menos abonos y devoluciones más lo trasladado al saldo a favor', () => {
    expect(saldoDeFactura({ total: 79250, aplicado: 70000, devuelto: 0, trasladado: 0 })).toBe(
      9250,
    );
    expect(saldoDeFactura({ total: 48250, aplicado: 70000, devuelto: 0, trasladado: 21750 })).toBe(
      0,
    );
  });
});

describe('ajustar la cartera tras una corrección o devolución (D-120, D-127)', () => {
  it('factura 84772 corregida a 48,250 con 70,000 abonados: 21,750 a favor del cliente', () => {
    expect(
      ajustarCartera({ total: 48250, aplicado: 70000, devuelto: 0, trasladado: 0, disponible: 0 }),
    ).toEqual({ saldo: 0, movimientoFavor: 21750 });
  });

  it('si se vuelve a subir el total, primero recupera el saldo a favor que trasladó', () => {
    expect(
      ajustarCartera({
        total: 79250,
        aplicado: 70000,
        devuelto: 0,
        trasladado: 21750,
        disponible: 21750,
      }),
    ).toEqual({ saldo: 9250, movimientoFavor: -21750 });
  });

  it('si el cliente ya usó el saldo a favor, la factura queda debiendo', () => {
    expect(
      ajustarCartera({
        total: 79250,
        aplicado: 70000,
        devuelto: 0,
        trasladado: 21750,
        disponible: 5000,
      }),
    ).toEqual({ saldo: 26000, movimientoFavor: -5000 });
  });

  it('sin abonos ni traslados el saldo es el total', () => {
    expect(
      ajustarCartera({ total: 50000, aplicado: 0, devuelto: 0, trasladado: 0, disponible: 9000 }),
    ).toEqual({ saldo: 50000, movimientoFavor: 0 });
  });

  it('rechaza valores que no son enteros', () => {
    expect(() =>
      ajustarCartera({ total: 1.5, aplicado: 0, devuelto: 0, trasladado: 0, disponible: 0 }),
    ).toThrow(/no son válidos/);
  });
});

describe('saldo a favor al anular (D-121)', () => {
  it('lo abonado a una compra anulada pasa a saldo a favor (compra 39, abono 61 de 200,000)', () => {
    expect(movimientoFavorAlAnular(200000, 0, 0)).toBe(200000);
  });

  it('descuenta lo que la factura ya había trasladado', () => {
    // 84772 corregida (21,750 ya a favor) y luego anulada: el resto de lo abonado.
    expect(movimientoFavorAlAnular(70000, 21750, 21750)).toBe(48250);
  });

  it('una compra de contado corregida a la baja y anulada recupera lo que trasladó', () => {
    // Compra 37: su abono automático se anula con ella; había dejado 35,600 a favor.
    expect(movimientoFavorAlAnular(0, 35600, 35600)).toBe(-35600);
  });

  it('se bloquea si el tercero ya usó ese saldo a favor', () => {
    expect(() => movimientoFavorAlAnular(0, 35600, 10000)).toThrow(/ya usó/);
  });
});

describe('uso del saldo a favor (D-128, D-130)', () => {
  it('el disponible es la suma del libro', () => {
    expect(saldoFavorDisponible([21750, -10000, 89500])).toBe(101250);
    expect(saldoFavorDisponible([])).toBe(0);
  });

  it('no se usa más de lo disponible', () => {
    expect(validarUsoSaldoFavor(21750, 21750)).toBe(21750);
    expect(() => validarUsoSaldoFavor(21751, 21750)).toThrow(/supera el saldo a favor/);
    expect(() => validarUsoSaldoFavor(0, 21750)).toThrow(/mayor que cero/);
  });

  it('reversar un saldo a favor generado exige que siga disponible', () => {
    expect(() => validarReversoGenerado(89500, 125100)).not.toThrow();
    expect(() => validarReversoGenerado(89500, 50000)).toThrow(/ya usó parte/);
  });
});
