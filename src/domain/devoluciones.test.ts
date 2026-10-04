import { describe, expect, it } from 'vitest';
import {
  calcularDevolucion,
  devolverTodo,
  efectoAnularDevolucion,
  efectoDevolucion,
  puedeDevolver,
  validarMotivoDevolucion,
  type LineaDevolvible,
} from './devoluciones';

/**
 * Líneas de la factura 84790 de la maqueta (docs/maquetas/devoluciones.html):
 * total 489,000 a crédito de 15 días, abonado 100,000 y ya devueltos 2 kg de
 * queso (devolución 3, 37,800).
 */
const LINEAS_84790: readonly LineaDevolvible[] = [
  {
    renglon: 1,
    producto: { codigo: 101, nombre: 'CAJA PIZZA 35*35 FD', unidad: 'UND' },
    cantidad: 100000,
    valorUnitario: 1950,
    costoUnitario: 1420,
  },
  {
    renglon: 2,
    producto: { codigo: 305, nombre: 'QUESO MOZZARELLA BLOQUE', unidad: 'KG' },
    cantidad: 10000,
    valorUnitario: 18900,
    costoUnitario: 18675,
  },
  {
    renglon: 3,
    producto: { codigo: 231, nombre: 'PAPA FRANCESA AGRINA PREMIUM *2.5 KG', unidad: 'UND' },
    cantidad: 6000,
    valorUnitario: 17500,
    costoUnitario: 12311,
  },
];

/** Devolución 3: 2 kg de queso. */
const YA_DEVUELTO_84790 = new Map([[2, 2000]]);

/** Líneas de la compra 37 en su versión 2 (corregida). */
const LINEAS_37_V2: readonly LineaDevolvible[] = [
  {
    renglon: 1,
    producto: { codigo: 231, nombre: 'PAPA FRANCESA AGRINA PREMIUM *2.5 KG', unidad: 'UND' },
    cantidad: 48000,
    valorUnitario: 11800,
    costoUnitario: 12311,
  },
  {
    renglon: 2,
    producto: { codigo: 305, nombre: 'QUESO MOZZARELLA BLOQUE', unidad: 'KG' },
    cantidad: 20000,
    valorUnitario: 17900,
    costoUnitario: 18675,
  },
];

describe('devolución de venta (§9.2): factura 84790 de la maqueta', () => {
  it('lo que se puede devolver descuenta lo ya devuelto', () => {
    expect(LINEAS_84790.map((l) => puedeDevolver(l, YA_DEVUELTO_84790))).toEqual([
      100000, 8000, 6000,
    ]);
  });

  it('40 cajas de 101 a $ 1,950: 78,000 que reingresan al costo de la venta', () => {
    const r = calcularDevolucion({
      tipo: 'venta',
      lineas: LINEAS_84790,
      yaDevuelto: YA_DEVUELTO_84790,
      pedidas: [
        { renglon: 1, cantidad: 40000 },
        { renglon: 2, cantidad: 0 },
        { renglon: 3, cantidad: 0 },
      ],
    });
    expect(r.total).toBe(78000);
    expect(r.lineas).toEqual([
      {
        renglon: 1,
        facturaRenglon: 1,
        productoCodigo: 101,
        cantidad: 40000,
        valorUnitario: 1950,
        total: 78000,
        costoUnitario: 1420,
      },
    ]);
    expect(r.movimientos).toEqual([{ productoCodigo: 101, cantidad: 40000, costoUnitario: 1420 }]);
  });

  it('el saldo de la factura baja de 351,200 a 273,200', () => {
    expect(
      efectoDevolucion(78000, 'credito', 489000, {
        aplicado: 100000,
        devuelto: 37800,
        trasladado: 0,
        disponible: 0,
      }),
    ).toEqual({ tipo: 'credito', saldo: 273200, movimientoFavor: 0 });
  });

  it('si la devolución pasa del saldo, el resto queda a favor del cliente', () => {
    const todo = calcularDevolucion({
      tipo: 'venta',
      lineas: LINEAS_84790,
      yaDevuelto: YA_DEVUELTO_84790,
      pedidas: devolverTodo(LINEAS_84790, YA_DEVUELTO_84790),
    });
    // 195,000 + 8 kg × 18,900 + 105,000 = 451,200.
    expect(todo.total).toBe(451200);
    expect(
      efectoDevolucion(todo.total, 'credito', 489000, {
        aplicado: 100000,
        devuelto: 37800,
        trasladado: 0,
        disponible: 0,
      }),
    ).toEqual({ tipo: 'credito', saldo: 0, movimientoFavor: 100000 });
  });

  it('en una venta de contado se devuelve el dinero', () => {
    expect(
      efectoDevolucion(78000, 'contado', 489000, {
        aplicado: 0,
        devuelto: 0,
        trasladado: 0,
        disponible: 0,
      }),
    ).toEqual({ tipo: 'contado', devolver: 78000, cobrar: 0 });
  });

  it('no deja devolver más de lo que queda ni fracciones de unidad', () => {
    expect(() =>
      calcularDevolucion({
        tipo: 'venta',
        lineas: LINEAS_84790,
        yaDevuelto: YA_DEVUELTO_84790,
        pedidas: [{ renglon: 2, cantidad: 9000 }],
      }),
    ).toThrow(/máximo 8\.000 \(vendido 10\.000, ya devuelto 2\.000\)/);
    expect(() =>
      calcularDevolucion({
        tipo: 'venta',
        lineas: LINEAS_84790,
        yaDevuelto: YA_DEVUELTO_84790,
        pedidas: [{ renglon: 1, cantidad: 1500 }],
      }),
    ).toThrow(/unidades/);
  });

  it('exige al menos una línea y no acepta renglones inexistentes o repetidos', () => {
    const base = { tipo: 'venta' as const, lineas: LINEAS_84790, yaDevuelto: YA_DEVUELTO_84790 };
    expect(() => calcularDevolucion({ ...base, pedidas: [{ renglon: 1, cantidad: 0 }] })).toThrow(
      /al menos una línea/,
    );
    expect(() =>
      calcularDevolucion({ ...base, pedidas: [{ renglon: 7, cantidad: 1000 }] }),
    ).toThrow(/no existe/);
    expect(() =>
      calcularDevolucion({
        ...base,
        pedidas: [
          { renglon: 1, cantidad: 1000 },
          { renglon: 1, cantidad: 1000 },
        ],
      }),
    ).toThrow(/dos veces/);
  });
});

describe('devolución de compra (§9.2): compra 37 corregida', () => {
  it('5 kg de queso a 17,900: 89,500 que salen al costo nuevo de la línea', () => {
    const r = calcularDevolucion({
      tipo: 'compra',
      lineas: LINEAS_37_V2,
      yaDevuelto: new Map(),
      pedidas: [{ renglon: 2, cantidad: 5000 }],
    });
    expect(r.total).toBe(89500);
    expect(r.movimientos).toEqual([{ productoCodigo: 305, cantidad: -5000, costoUnitario: 18675 }]);
  });

  it('la compra ya estaba pagada: los 89,500 se suman a los 35,600 a favor', () => {
    expect(
      efectoDevolucion(89500, 'credito', 924400, {
        aplicado: 960000,
        devuelto: 0,
        trasladado: 35600,
        disponible: 35600,
      }),
    ).toEqual({ tipo: 'credito', saldo: 0, movimientoFavor: 89500 });
  });
});

describe('anular una devolución (D-131)', () => {
  /** Compra 37 v2 con la devolución de 89,500 activa. */
  const CARTERA_37 = { aplicado: 960000, devuelto: 89500, trasladado: 125100 };

  it('recupera el saldo a favor que generó, si sigue disponible', () => {
    expect(
      efectoAnularDevolucion(89500, 'credito', 924400, { ...CARTERA_37, disponible: 125100 }),
    ).toEqual({ tipo: 'credito', saldo: 0, movimientoFavor: -89500 });
  });

  it('si el proveedor ya usó parte del saldo a favor, la compra vuelve a deber esa parte', () => {
    expect(
      efectoAnularDevolucion(89500, 'credito', 924400, { ...CARTERA_37, disponible: 20000 }),
    ).toEqual({ tipo: 'credito', saldo: 69500, movimientoFavor: -20000 });
  });

  it('si no generó saldo a favor, la factura vuelve a deberlo sin tocar el libro', () => {
    // Factura 84790 después de devolver 78,000: saldo 273,200.
    expect(
      efectoAnularDevolucion(78000, 'credito', 489000, {
        aplicado: 100000,
        devuelto: 115800,
        trasladado: 0,
        disponible: 0,
      }),
    ).toEqual({ tipo: 'credito', saldo: 351200, movimientoFavor: 0 });
  });

  it('en contado se vuelve a cobrar lo devuelto', () => {
    expect(
      efectoAnularDevolucion(78000, 'contado', 78000, {
        aplicado: 0,
        devuelto: 78000,
        trasladado: 0,
        disponible: 0,
      }),
    ).toEqual({ tipo: 'contado', cobrar: 78000 });
  });
});

describe('motivo de la devolución', () => {
  it('es opcional y limitado', () => {
    expect(validarMotivoDevolucion('  Cajas   mojadas ')).toBe('Cajas mojadas');
    expect(validarMotivoDevolucion('')).toBe('');
    expect(() => validarMotivoDevolucion('x'.repeat(151))).toThrow(/máximo 150/);
  });
});
