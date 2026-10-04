import { describe, expect, it } from 'vitest';
import { calcularCompra, costoUnitarioResultante } from './compras';
import {
  anularCompra,
  anularVenta,
  corregirCompra,
  corregirVenta,
  costoTrasQuitarCompra,
  diferenciasPorProducto,
  type CarteraVigente,
  type EntradaCorreccionCompra,
  type EntradaCorreccionVenta,
  type LineaCompraVigente,
  type LineaVentaVigente,
  type SituacionCosto,
} from './correcciones';

/** Papa de las maquetas (UND). */
const PAPA = {
  codigo: 231,
  nombre: 'PAPA FRANCESA AGRINA PREMIUM *2.5 KG',
  unidad: 'UND',
} as const;
/** Caja 35×35 (UND). */
const CAJA_35 = { codigo: 101, nombre: 'CAJA PIZZA 35*35 FD', unidad: 'UND' } as const;
/** Caja 40×40 (UND). */
const CAJA_40 = { codigo: 102, nombre: 'CAJA PIZZA 40*40 FD', unidad: 'UND' } as const;

/**
 * Líneas de la factura 84772 de la maqueta (docs/maquetas/correccion-cliente.html):
 * total 79,250 a crédito de 8 días, con 70,000 abonados.
 */
const LINEAS_84772: readonly LineaVentaVigente[] = [
  {
    renglon: 1,
    producto: PAPA,
    escala: 'menor',
    cantidad: 4000,
    precioEscala: 17500,
    precio: 14500,
    costo: 12292,
  },
  {
    renglon: 2,
    producto: CAJA_35,
    escala: 'mayor',
    cantidad: 5000,
    precioEscala: 1950,
    precio: 1950,
    costo: 1420,
  },
  {
    renglon: 3,
    producto: CAJA_40,
    escala: 'mayor',
    cantidad: 5000,
    precioEscala: 2300,
    precio: 2300,
    costo: 2050,
  },
];

/** Cartera de la 84772: abono 15 por 70,000, sin traslados. */
const CARTERA_84772: CarteraVigente = {
  aplicado: 70000,
  devuelto: 0,
  trasladado: 0,
  disponible: 0,
};

/**
 * Corrección de la 84772 con los cambios de la maqueta y los que se pidan.
 *
 * @param cambios - Campos de la entrada que cambian.
 * @returns Entrada de la corrección.
 */
function correccion84772(cambios: Partial<EntradaCorreccionVenta> = {}): EntradaCorreccionVenta {
  return {
    lineas: LINEAS_84772,
    condicion: 'credito',
    cartera: CARTERA_84772,
    cambios: [
      { renglon: 1, cantidad: 2000, precio: 14500 },
      { renglon: 3, cantidad: 5000, precio: 1900 },
    ],
    ...cambios,
  };
}

describe('corrección de factura de cliente (§9.1): factura 84772 de la maqueta', () => {
  it('231 de 4 a 2 y 102 a $ 1,900: total 48,250 y 21,750 a favor del cliente', () => {
    const r = corregirVenta(correccion84772());
    expect(r.totalAnterior).toBe(79250);
    expect(r.total).toBe(48250);
    expect(r.diferencia).toBe(-31000);
    expect(r.ahorro).toBe(8000);
    expect(
      r.lineas.map((l) => [l.renglon, l.productoCodigo, l.cantidad, l.precio, l.total]),
    ).toEqual([
      [1, 231, 2000, 14500, 29000],
      [2, 101, 5000, 1950, 9750],
      [3, 102, 5000, 1900, 9500],
    ]);
    expect(r.efecto).toEqual({ tipo: 'credito', saldo: 0, movimientoFavor: 21750 });
  });

  it('el precio bajo el costo se permite con aviso ámbar', () => {
    const r = corregirVenta(correccion84772());
    expect(r.lineas[2]).toMatchObject({ bajoCosto: true, alterado: true, costo: 2050 });
    expect(r.avisos).toEqual([
      'Línea 3 (102 - CAJA PIZZA 40*40 FD): $ 1,900 queda por debajo del costo ($ 2,050). ' +
        'En la corrección se permite; el precio anterior y el nuevo quedan en el historial.',
    ]);
  });

  it('lo que se dejó de vender reingresa al costo de la línea', () => {
    expect(corregirVenta(correccion84772()).movimientos).toEqual([
      { productoCodigo: 231, cantidad: 2000, costoUnitario: 12292 },
    ]);
  });

  it('vender de más saca stock', () => {
    const r = corregirVenta(
      correccion84772({ cambios: [{ renglon: 1, cantidad: 6000, precio: 14500 }] }),
    );
    expect(r.movimientos).toEqual([{ productoCodigo: 231, cantidad: -2000, costoUnitario: 12292 }]);
    expect(r.total).toBe(108250);
    expect(r.efecto).toEqual({ tipo: 'credito', saldo: 38250, movimientoFavor: 0 });
  });

  it('cantidad 0 quita la línea y renumera las demás (D-123)', () => {
    const r = corregirVenta(
      correccion84772({ cambios: [{ renglon: 2, cantidad: 0, precio: 1950 }] }),
    );
    expect(r.lineas.map((l) => [l.renglon, l.renglonAnterior, l.productoCodigo])).toEqual([
      [1, 1, 231],
      [2, 3, 102],
    ]);
    expect(r.movimientos).toEqual([{ productoCodigo: 101, cantidad: 5000, costoUnitario: 1420 }]);
  });

  it('si todas quedan en cero pide anular la factura', () => {
    expect(() =>
      corregirVenta(
        correccion84772({
          cambios: LINEAS_84772.map((l) => ({ renglon: l.renglon, cantidad: 0, precio: l.precio })),
        }),
      ),
    ).toThrow(/anúlela con Ctrl\+X/);
  });

  it('sin cambios no hay nada que guardar', () => {
    expect(() =>
      corregirVenta(correccion84772({ cambios: [{ renglon: 1, cantidad: 4000, precio: 14500 }] })),
    ).toThrow(/No hay cambios/);
  });

  it('no agrega productos ni repite líneas', () => {
    expect(() =>
      corregirVenta(correccion84772({ cambios: [{ renglon: 9, cantidad: 1000, precio: 100 }] })),
    ).toThrow(/no se agregan productos/);
    expect(() =>
      corregirVenta(
        correccion84772({
          cambios: [
            { renglon: 1, cantidad: 1000, precio: 100 },
            { renglon: 1, cantidad: 2000, precio: 100 },
          ],
        }),
      ),
    ).toThrow(/dos veces/);
  });

  it('valida cantidades y precios', () => {
    expect(() =>
      corregirVenta(correccion84772({ cambios: [{ renglon: 1, cantidad: 1500, precio: 14500 }] })),
    ).toThrow(/unidades/);
    expect(() =>
      corregirVenta(correccion84772({ cambios: [{ renglon: 1, cantidad: 2000, precio: -1 }] })),
    ).toThrow(/pesos enteros/);
  });

  it('si después se vuelve a subir, recupera el saldo a favor que trasladó', () => {
    const v2 = corregirVenta(correccion84772());
    const v3 = corregirVenta({
      lineas: v2.lineas.map((l, i) => ({
        ...l,
        producto: [PAPA, CAJA_35, CAJA_40][i] ?? PAPA,
      })),
      condicion: 'credito',
      cartera: { aplicado: 70000, devuelto: 0, trasladado: 21750, disponible: 21750 },
      cambios: [
        { renglon: 1, cantidad: 4000, precio: 14500 },
        { renglon: 3, cantidad: 5000, precio: 2300 },
      ],
    });
    expect(v3.total).toBe(79250);
    expect(v3.efecto).toEqual({ tipo: 'credito', saldo: 9250, movimientoFavor: -21750 });
  });

  it('en una venta de contado la diferencia se devuelve o se cobra en dinero (D-120)', () => {
    expect(corregirVenta(correccion84772({ condicion: 'contado' })).efecto).toEqual({
      tipo: 'contado',
      devolver: 31000,
      cobrar: 0,
    });
    expect(
      corregirVenta(
        correccion84772({
          condicion: 'contado',
          cambios: [{ renglon: 2, cantidad: 6000, precio: 1950 }],
        }),
      ).efecto,
    ).toEqual({ tipo: 'contado', devolver: 0, cobrar: 1950 });
  });
});

/**
 * Líneas de la compra 37 de la maqueta (docs/maquetas/correccion-proveedor.html):
 * 50 papas a 11,800 y 20 kg de queso a 18,500, con flete de 40,000 repartido
 * en el costo; pagada de contado con el abono automático 58 por 960,000.
 */
const LINEAS_37: readonly LineaCompraVigente[] = [
  {
    renglon: 1,
    producto: {
      ...PAPA,
      costo: 12292,
      precios: { mayor: 16000, menor: 17500, minimo: 12300 },
      proveedorCodigo: 10012,
    },
    cantidad: 50000,
    costoUnitario: 11800,
    costoNuevo: 12292,
  },
  {
    renglon: 2,
    producto: {
      codigo: 305,
      nombre: 'QUESO MOZZARELLA BLOQUE',
      unidad: 'KG',
      costo: 18900,
      precios: { mayor: 24000, menor: 26000, minimo: 22000 },
      proveedorCodigo: 10012,
    },
    cantidad: 20000,
    costoUnitario: 18500,
    costoNuevo: 19271,
  },
];

/** 231: la 37 es su última compra; 305: hubo una compra posterior (la 41). */
const COSTOS_37: ReadonlyMap<number, SituacionCosto> = new Map([
  [231, { esUltima: true, costoCompraAnterior: 12100 }],
  [305, { esUltima: false, costoCompraAnterior: 18000 }],
]);

/**
 * Corrección de la compra 37 con los cambios de la maqueta y los que se pidan.
 *
 * @param cambios - Campos de la entrada que cambian.
 * @returns Entrada de la corrección.
 */
function correccion37(cambios: Partial<EntradaCorreccionCompra> = {}): EntradaCorreccionCompra {
  return {
    proveedorCodigo: 10012,
    lineas: LINEAS_37,
    cambios: [
      { renglon: 1, cantidad: 48000, costoUnitario: 11800 },
      { renglon: 2, cantidad: 20000, costoUnitario: 17900 },
    ],
    fleteAnterior: 40000,
    flete: 40000,
    fleteProveedor: false,
    descuentoAnterior: { modo: 'pesos', valor: 0 },
    descuento: { modo: 'pesos', valor: 0 },
    descuentoEnCosto: false,
    totalAnterior: 960000,
    costos: COSTOS_37,
    cartera: { aplicado: 960000, devuelto: 0, trasladado: 0, disponible: 0 },
    ...cambios,
  };
}

describe('corrección de factura de proveedor (§9.1): compra 37 de la maqueta', () => {
  it('la versión original da 960,000 y los costos 12,292 y 19,271', () => {
    const original = calcularCompra({
      proveedorCodigo: 10012,
      lineas: LINEAS_37.map((l) => ({
        producto: { ...l.producto, activo: true },
        cantidad: l.cantidad,
        costoUnitario: l.costoUnitario,
      })),
      flete: 40000,
      fleteProveedor: false,
      descuento: { modo: 'pesos', valor: 0 },
      descuentoEnCosto: false,
    });
    expect(original.total).toBe(960000);
    expect(original.lineas.map((l) => [l.flete, l.costoNuevo])).toEqual([
      [24583, 12292],
      [15417, 19271],
    ]);
  });

  it('231 de 50 a 48: costo nuevo (566,400 + 24,509) / 48 = 12,311', () => {
    expect(costoUnitarioResultante(566400 + 24509, 48000)).toBe(12311);
    const r = corregirCompra(correccion37());
    expect(r.calculo.lineas.map((l) => [l.total, l.flete, l.costoNuevo])).toEqual([
      [566400, 24509, 12311],
      [358000, 15491, 18675],
    ]);
    expect(r.calculo.total).toBe(924400);
    expect(r.diferencia).toBe(-35600);
  });

  it('el costo cambia solo en el producto del que es la última compra (D-126)', () => {
    const r = corregirCompra(correccion37());
    expect(r.costos).toEqual([{ productoCodigo: 231, anterior: 12292, nuevo: 12311 }]);
    expect(r.calculo.lineas[0]?.escalasBajoCosto).toEqual(['minimo']);
  });

  it('salen las 2 papas que no llegaron, al costo nuevo de la línea', () => {
    expect(corregirCompra(correccion37()).movimientos).toEqual([
      { productoCodigo: 231, cantidad: -2000, costoUnitario: 12311 },
    ]);
  });

  it('pagada de contado: los 35,600 quedan a favor con el proveedor', () => {
    expect(corregirCompra(correccion37()).efecto).toEqual({
      tipo: 'credito',
      saldo: 0,
      movimientoFavor: 35600,
    });
  });

  it('cambiar solo el flete también es una corrección', () => {
    const r = corregirCompra(correccion37({ cambios: [], flete: 30000 }));
    expect(r.calculo.total).toBe(960000);
    expect(r.movimientos).toEqual([]);
    // (590,000 + 18,438 de flete) / 50 = 12,168.76 → 12,169.
    expect(r.costos).toEqual([{ productoCodigo: 231, anterior: 12292, nuevo: 12169 }]);
  });

  it('quitar el producto de su última compra devuelve el costo al de la anterior, con aviso', () => {
    const r = corregirCompra(
      correccion37({ cambios: [{ renglon: 1, cantidad: 0, costoUnitario: 11800 }] }),
    );
    expect(r.renglonesAnteriores).toEqual([2]);
    expect(r.costos).toEqual([{ productoCodigo: 231, anterior: 12292, nuevo: 12100 }]);
    expect(r.avisos).toHaveLength(1);
    expect(r.movimientos).toEqual([
      { productoCodigo: 231, cantidad: -50000, costoUnitario: 12292 },
    ]);
  });

  it('sin cambios no hay nada que guardar; con todo en cero pide anular', () => {
    expect(() => corregirCompra(correccion37({ cambios: [] }))).toThrow(/No hay cambios/);
    expect(() =>
      corregirCompra(
        correccion37({
          cambios: LINEAS_37.map((l) => ({ renglon: l.renglon, cantidad: 0, costoUnitario: 1 })),
        }),
      ),
    ).toThrow(/anúlela con Ctrl\+X/);
  });
});

describe('anulación (§9.1, D-121)', () => {
  it('anular la 84772 reingresa todo y lo abonado pasa a saldo a favor', () => {
    const r = anularVenta(LINEAS_84772, 'credito', 79250, {
      aplicadoQueda: 70000,
      trasladado: 0,
      disponible: 0,
    });
    expect(r.movimientos).toEqual([
      { productoCodigo: 231, cantidad: 4000, costoUnitario: 12292 },
      { productoCodigo: 101, cantidad: 5000, costoUnitario: 1420 },
      { productoCodigo: 102, cantidad: 5000, costoUnitario: 2050 },
    ]);
    expect(r.efecto).toEqual({ tipo: 'credito', movimientoFavor: 70000 });
  });

  it('una venta de contado anulada devuelve el total en dinero', () => {
    expect(
      anularVenta(LINEAS_84772, 'contado', 79250, {
        aplicadoQueda: 0,
        trasladado: 0,
        disponible: 0,
      }).efecto,
    ).toEqual({ tipo: 'contado', devolver: 79250, cobrar: 0 });
  });

  it('un saldo inicial (sin líneas) no mueve el kardex', () => {
    expect(
      anularVenta([], 'credito', 380000, { aplicadoQueda: 100000, trasladado: 0, disponible: 0 }),
    ).toEqual({
      movimientos: [],
      efecto: { tipo: 'credito', movimientoFavor: 100000 },
      costos: [],
      avisos: [],
    });
  });

  it('anular la compra 39: sale todo, lo abonado queda a favor y el costo de 101 vuelve', () => {
    const lineas39: LineaCompraVigente[] = [
      {
        renglon: 1,
        producto: {
          ...CAJA_35,
          costo: 1420,
          precios: { mayor: 1950, menor: 2200, minimo: 1800 },
          proveedorCodigo: 10014,
        },
        cantidad: 30000,
        costoUnitario: 1420,
        costoNuevo: 1420,
      },
      {
        renglon: 2,
        producto: {
          ...CAJA_40,
          costo: 2050,
          precios: { mayor: 2300, menor: 2600, minimo: 2200 },
          proveedorCodigo: 10014,
        },
        cantidad: 12000,
        costoUnitario: 2050,
        costoNuevo: 2050,
      },
    ];
    const r = anularCompra(
      lineas39,
      { aplicadoQueda: 50000, trasladado: 0, disponible: 0 },
      new Map([
        [101, { esUltima: true, costoCompraAnterior: 1380 }],
        [102, { esUltima: false, costoCompraAnterior: 2000 }],
      ]),
    );
    expect(r.movimientos).toEqual([
      { productoCodigo: 101, cantidad: -30000, costoUnitario: 1420 },
      { productoCodigo: 102, cantidad: -12000, costoUnitario: 2050 },
    ]);
    expect(r.efecto).toEqual({ tipo: 'credito', movimientoFavor: 50000 });
    expect(r.costos).toEqual([{ productoCodigo: 101, anterior: 1420, nuevo: 1380 }]);
    expect(r.avisos).toEqual([
      '101 - CAJA PIZZA 35*35 FD: era su última compra; el costo vuelve de $ 1,420 a $ 1,380 (compra anterior).',
    ]);
  });

  it('anular la compra 37 ya corregida (contado): su abono automático se anula y recupera los 35,600', () => {
    const r = anularCompra(
      LINEAS_37,
      { aplicadoQueda: 0, trasladado: 35600, disponible: 35600 },
      COSTOS_37,
    );
    expect(r.efecto).toEqual({ tipo: 'credito', movimientoFavor: -35600 });
    expect(r.costos).toEqual([{ productoCodigo: 231, anterior: 12292, nuevo: 12100 }]);
  });

  it('se bloquea si el proveedor ya usó el saldo a favor que dejó la compra', () => {
    expect(() =>
      anularCompra(LINEAS_37, { aplicadoQueda: 0, trasladado: 35600, disponible: 0 }, COSTOS_37),
    ).toThrow(/ya usó/);
  });
});

describe('costo al quitar una compra (D-126)', () => {
  it('vuelve al de la compra anterior solo si era la última y hay anterior', () => {
    expect(
      costoTrasQuitarCompra(231, 12311, { esUltima: true, costoCompraAnterior: 12100 }),
    ).toEqual({ productoCodigo: 231, anterior: 12311, nuevo: 12100 });
    expect(
      costoTrasQuitarCompra(231, 12311, { esUltima: true, costoCompraAnterior: null }),
    ).toBeNull();
    expect(
      costoTrasQuitarCompra(305, 18900, { esUltima: false, costoCompraAnterior: 18000 }),
    ).toBeNull();
    expect(costoTrasQuitarCompra(305, 18900, undefined)).toBeNull();
  });
});

describe('diferencias por producto (D-132)', () => {
  it('suma las líneas repetidas y omite las que no cambian', () => {
    expect(
      diferenciasPorProducto(
        [
          { productoCodigo: 231, cantidad: 4000 },
          { productoCodigo: 231, cantidad: 1000 },
          { productoCodigo: 101, cantidad: 5000 },
        ],
        [
          { productoCodigo: 231, cantidad: 3000 },
          { productoCodigo: 101, cantidad: 5000 },
        ],
      ),
    ).toEqual(new Map([[231, -2000]]));
  });
});
