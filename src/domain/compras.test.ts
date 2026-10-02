import { describe, expect, it } from 'vitest';
import {
  calcularCompra,
  calcularDescuento,
  claveNumeroProveedor,
  costoUnitarioResultante,
  leerPorcentaje,
  repartirProporcional,
  textoPorcentaje,
  validarNumeroProveedor,
  validarOrdenCompra,
  variacionAlta,
  variacionCosto,
  type EntradaCompra,
  type ProductoCompra,
} from './compras';

/** Proveedor de la compra en las pruebas. */
const PROVEEDOR = 10004;

/**
 * Crea un producto de prueba.
 *
 * @param datos - Campos que cambian respecto del producto base.
 * @returns Producto.
 */
function producto(datos: Partial<ProductoCompra> & { codigo: number }): ProductoCompra {
  return {
    nombre: `PRODUCTO ${datos.codigo}`,
    unidad: 'UND',
    costo: 1000,
    precios: { mayor: 100_000, menor: 100_000, minimo: 100_000 },
    proveedorCodigo: PROVEEDOR,
    activo: true,
    ...datos,
  };
}

/** Línea 1 de la maqueta aprobada (docs/maquetas/factura-proveedor.html). */
const CHORIZO = producto({ codigo: 103, costo: 7800 });
/** Línea 2 de la maqueta: producto por kilogramo. */
const JAMON = producto({ codigo: 104, unidad: 'KG', costo: 18_500 });
/** Línea 3 de la maqueta: el costo nuevo deja el precio mínimo por debajo. */
const SALCHICHA = producto({
  codigo: 108,
  costo: 9600,
  precios: { mayor: 13_000, menor: 12_000, minimo: 11_000 },
});
/** Línea 4 de la maqueta: producto de otro proveedor. */
const CAJA = producto({ codigo: 101, costo: 1500, proveedorCodigo: 10003 });

/**
 * Compra de la maqueta: cuatro líneas, flete de 30,000 y 2 % de descuento.
 *
 * @param cambios - Campos que cambian.
 * @returns Entrada de la compra.
 */
function compraMaqueta(cambios: Partial<EntradaCompra> = {}): EntradaCompra {
  return {
    proveedorCodigo: PROVEEDOR,
    lineas: [
      { producto: CHORIZO, cantidad: 24_000, costoUnitario: 7900 },
      { producto: JAMON, cantidad: 15_500, costoUnitario: 18_900 },
      { producto: SALCHICHA, cantidad: 30_000, costoUnitario: 11_200 },
      { producto: CAJA, cantidad: 100_000, costoUnitario: 1450 },
    ],
    flete: 30_000,
    fleteProveedor: false,
    descuento: { modo: 'porcentaje', valor: 200 },
    descuentoEnCosto: false,
    ...cambios,
  };
}

describe('reparto proporcional (flete y descuento)', () => {
  it('reparte por mayor residuo y la suma da exacta', () => {
    expect(repartirProporcional(100, [1, 1, 1])).toEqual([34, 33, 33]);
    const partes = repartirProporcional(30_000, [189_600, 292_950, 336_000, 145_000]);
    expect(partes).toEqual([5903, 9121, 10_461, 4515]);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(30_000);
  });

  it('no reparte nada si el valor es cero', () => {
    expect(repartirProporcional(0, [0, 0])).toEqual([0, 0]);
  });

  it('las partes de peso cero no reciben nada', () => {
    expect(repartirProporcional(10, [0, 5, 5])).toEqual([0, 5, 5]);
  });

  it('rechaza repartir sobre líneas que suman cero', () => {
    expect(() => repartirProporcional(500, [0, 0])).toThrow(/total de las líneas es cero/);
  });

  it('no pierde precisión con valores grandes', () => {
    const partes = repartirProporcional(9_000_000_000, [3_000_000_000_000, 6_000_000_000_000]);
    expect(partes).toEqual([3_000_000_000, 6_000_000_000]);
  });
});

describe('descuento de la compra', () => {
  it('en porcentaje se redondea al peso', () => {
    expect(calcularDescuento(963_550, { modo: 'porcentaje', valor: 200 })).toBe(19_271);
    expect(calcularDescuento(1000, { modo: 'porcentaje', valor: 250 })).toBe(25);
    expect(calcularDescuento(1000, { modo: 'porcentaje', valor: 10_000 })).toBe(1000);
  });

  it('en pesos no puede pasar del subtotal', () => {
    expect(calcularDescuento(1000, { modo: 'pesos', valor: 1000 })).toBe(1000);
    expect(() => calcularDescuento(1000, { modo: 'pesos', valor: 1001 })).toThrow(/subtotal/);
  });

  it('rechaza valores negativos o un porcentaje de más del 100 %', () => {
    expect(() => calcularDescuento(1000, { modo: 'pesos', valor: -1 })).toThrow(/negativo/);
    expect(() => calcularDescuento(1000, { modo: 'porcentaje', valor: 10_001 })).toThrow(/100 %/);
  });
});

describe('costo unitario y variación', () => {
  it('divide el valor neto por la cantidad y redondea al peso', () => {
    expect(costoUnitarioResultante(195_503, 24_000)).toBe(8146);
    expect(costoUnitarioResultante(1000, 3000)).toBe(333);
    expect(costoUnitarioResultante(1000, 1500)).toBe(667);
  });

  it('calcula la variación en décimas de porcentaje', () => {
    expect(variacionCosto(9600, 11_549)).toBe(203);
    expect(variacionCosto(10_000, 7000)).toBe(-300);
    expect(variacionCosto(0, 5000)).toBeNull();
  });

  it('marca la variación de más de 25 %, en subida o en bajada (D-65)', () => {
    expect(variacionAlta(10_000, 12_500)).toBe(false);
    expect(variacionAlta(10_000, 12_501)).toBe(true);
    expect(variacionAlta(10_000, 7500)).toBe(false);
    expect(variacionAlta(10_000, 7499)).toBe(true);
    expect(variacionAlta(0, 5000)).toBe(false);
  });
});

describe('cálculo de la compra', () => {
  it('reproduce la maqueta aprobada', () => {
    const compra = calcularCompra(compraMaqueta());
    expect(compra.lineas.map((l) => l.total)).toEqual([189_600, 292_950, 336_000, 145_000]);
    expect(compra.lineas.map((l) => l.flete)).toEqual([5903, 9121, 10_461, 4515]);
    expect(compra.lineas.map((l) => l.costoNuevo)).toEqual([8146, 19_488, 11_549, 1495]);
    expect(compra.subtotal).toBe(963_550);
    expect(compra.descuento).toBe(19_271);
    expect(compra.total).toBe(944_279);
    expect(compra.costosNuevos.get(108)).toBe(11_549);
  });

  it('marca «revisar precios», la variación alta y el otro proveedor', () => {
    const [chorizo, , salchicha, caja] = calcularCompra(compraMaqueta()).lineas;
    expect(salchicha?.escalasBajoCosto).toEqual(['minimo']);
    expect(salchicha?.variacionAlta).toBe(false);
    expect(chorizo?.escalasBajoCosto).toEqual([]);
    expect(caja?.otroProveedor).toBe(true);
    expect(chorizo?.otroProveedor).toBe(false);

    const subida = calcularCompra(
      compraMaqueta({
        lineas: [{ producto: CHORIZO, cantidad: 1000, costoUnitario: 9800 }],
        flete: 0,
      }),
    ).lineas[0];
    expect(subida?.variacion).toBe(256);
    expect(subida?.variacionAlta).toBe(true);
  });

  it('el flete suma al total solo si lo cobra el proveedor (D-59)', () => {
    expect(calcularCompra(compraMaqueta({ fleteProveedor: true })).total).toBe(974_279);
  });

  it('repartir el descuento rebaja el costo (D-47)', () => {
    const compra = calcularCompra(compraMaqueta({ descuentoEnCosto: true }));
    expect(compra.lineas.reduce((s, l) => s + l.descuento, 0)).toBe(19_271);
    expect(compra.lineas[0]?.descuento).toBe(3792);
    // (189,600 + 5,903 − 3,792) ÷ 24 = 7,987.96
    expect(compra.lineas[0]?.costoNuevo).toBe(7988);
    expect(compra.total).toBe(944_279);
  });

  it('un producto repetido queda con el costo promedio ponderado (D-56)', () => {
    const compra = calcularCompra(
      compraMaqueta({
        lineas: [
          { producto: CHORIZO, cantidad: 10_000, costoUnitario: 8000 },
          { producto: CHORIZO, cantidad: 30_000, costoUnitario: 9000 },
        ],
        flete: 0,
        descuento: { modo: 'pesos', valor: 0 },
      }),
    );
    // (80,000 + 270,000) ÷ 40 = 8,750
    expect(compra.lineas.map((l) => l.costoNuevo)).toEqual([8750, 8750]);
    expect(compra.costosNuevos.get(103)).toBe(8750);
  });

  it('acepta el costo cero (obsequio) y los kilos con decimales', () => {
    const compra = calcularCompra(
      compraMaqueta({
        lineas: [
          { producto: CHORIZO, cantidad: 2000, costoUnitario: 0 },
          { producto: JAMON, cantidad: 1250, costoUnitario: 20_000 },
        ],
        flete: 0,
        descuento: { modo: 'pesos', valor: 0 },
      }),
    );
    expect(compra.lineas.map((l) => l.total)).toEqual([0, 25_000]);
    expect(compra.lineas[0]?.costoNuevo).toBe(0);
  });

  it('rechaza compras sin líneas, cantidades o costos inválidos y productos inactivos', () => {
    expect(() => calcularCompra(compraMaqueta({ lineas: [] }))).toThrow(/al menos un producto/);
    const conLinea = (linea: EntradaCompra['lineas'][number]): EntradaCompra =>
      compraMaqueta({ lineas: [linea], flete: 0, descuento: { modo: 'pesos', valor: 0 } });
    expect(() =>
      calcularCompra(conLinea({ producto: CHORIZO, cantidad: 0, costoUnitario: 1 })),
    ).toThrow(/Línea 1 \(103 - PRODUCTO 103\): la cantidad/);
    expect(() =>
      calcularCompra(conLinea({ producto: CHORIZO, cantidad: 1500, costoUnitario: 1 })),
    ).toThrow(/por unidades/);
    expect(() =>
      calcularCompra(conLinea({ producto: CHORIZO, cantidad: 1000, costoUnitario: -1 })),
    ).toThrow(/costo/);
    expect(() =>
      calcularCompra(
        conLinea({ producto: { ...CHORIZO, activo: false }, cantidad: 1000, costoUnitario: 1 }),
      ),
    ).toThrow(/inactivo/);
    expect(() => calcularCompra(compraMaqueta({ flete: -1 }))).toThrow(/flete/);
  });

  it('rechaza un flete sobre líneas que suman cero', () => {
    expect(() =>
      calcularCompra(
        compraMaqueta({
          lineas: [{ producto: CHORIZO, cantidad: 1000, costoUnitario: 0 }],
          flete: 500,
          descuento: { modo: 'pesos', valor: 0 },
        }),
      ),
    ).toThrow(/cero/);
  });
});

describe('textos de la compra', () => {
  it('normaliza el número del proveedor para comparar (D-49)', () => {
    expect(claveNumeroProveedor(' fv-20 931 ')).toBe('FV-20931');
    expect(validarNumeroProveedor('  FV  20931 ')).toBe('FV 20931');
    expect(() => validarNumeroProveedor('   ')).toThrow(/número de la factura/);
    expect(() => validarNumeroProveedor('X'.repeat(41))).toThrow(/40/);
    expect(validarOrdenCompra('  OC 15 ')).toBe('OC 15');
    expect(() => validarOrdenCompra('X'.repeat(41))).toThrow(/40/);
  });

  it('lee y escribe porcentajes con hasta dos decimales', () => {
    expect(leerPorcentaje('2')).toBe(200);
    expect(leerPorcentaje('2.5')).toBe(250);
    expect(leerPorcentaje('12.75 %')).toBe(1275);
    expect(leerPorcentaje('2,5')).toBeNull();
    expect(leerPorcentaje('2.555')).toBeNull();
    expect(textoPorcentaje(250)).toBe('2.5');
    expect(textoPorcentaje(200)).toBe('2');
    expect(textoPorcentaje(1275)).toBe('12.75');
  });
});
