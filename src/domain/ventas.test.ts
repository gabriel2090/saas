import { describe, expect, it } from 'vitest';
import { ErrorDeNegocio } from './errores';
import {
  calcularCambio,
  calcularLineaVenta,
  calcularVenta,
  plazoDeCondicion,
  razonesBloqueoCredito,
  siguienteEscala,
  validarCajasEmpaque,
  validarSiguienteNumeroFactura,
  type EntradaCredito,
  type ProductoVenta,
} from './ventas';

/** Papa de la factura actual 84771: escala Menor $ 17,500, costo $ 12,000. */
const PAPA: ProductoVenta = {
  codigo: 231,
  nombre: 'PAPA FRANCESA AGRINA PREMIUM *2.5 KG',
  unidad: 'UND',
  costo: 12000,
  precios: { mayor: 16000, menor: 17500, minimo: 14000 },
  activo: true,
};

/** Caja de pizza 35*35 de la factura actual: escala Mayor $ 1,950. */
const CAJA_35: ProductoVenta = {
  codigo: 101,
  nombre: 'CAJA PIZZA 35*35 FD',
  unidad: 'UND',
  costo: 1500,
  precios: { mayor: 1950, menor: 2200, minimo: 1800 },
  activo: true,
};

/** Caja de pizza 40*40 de la factura actual: escala Mayor $ 2,300. */
const CAJA_40: ProductoVenta = {
  codigo: 102,
  nombre: 'CAJA PIZZA 40*40 FD',
  unidad: 'UND',
  costo: 1800,
  precios: { mayor: 2300, menor: 2600, minimo: 2100 },
  activo: true,
};

/** Producto por kilos para probar cantidades con decimales. */
const JAMON: ProductoVenta = {
  codigo: 104,
  nombre: 'JAMÓN SÁNDWICH',
  unidad: 'KG',
  costo: 18500,
  precios: { mayor: 22000, menor: 24000, minimo: 21000 },
  activo: true,
};

/**
 * Captura el mensaje de un error de negocio.
 *
 * @param fn - Función que debe lanzar.
 * @returns El mensaje.
 */
function mensajeDe(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof ErrorDeNegocio) {
      return error.message;
    }
    throw error;
  }
  throw new Error('No lanzó ningún error.');
}

describe('siguienteEscala (F6, D-81)', () => {
  it('recorre Menor → Mínimo → Mayor → Menor', () => {
    expect(siguienteEscala('menor')).toBe('minimo');
    expect(siguienteEscala('minimo')).toBe('mayor');
    expect(siguienteEscala('mayor')).toBe('menor');
  });
});

describe('calcularLineaVenta', () => {
  it('vende al precio de la escala sin ahorro', () => {
    expect(
      calcularLineaVenta({
        producto: CAJA_35,
        escala: 'mayor',
        cantidad: 5000,
        precioAlterado: null,
      }),
    ).toEqual({
      precioEscala: 1950,
      precio: 1950,
      alterado: false,
      total: 9750,
      ahorro: 0,
      bajoCosto: false,
      bajoMinimo: false,
    });
  });

  it('con F7 rebajado calcula el ahorro y avisa si queda bajo el mínimo (D-87)', () => {
    const linea = calcularLineaVenta({
      producto: PAPA,
      escala: 'menor',
      cantidad: 4000,
      precioAlterado: 13500,
    });
    expect(linea).toMatchObject({ precio: 13500, alterado: true, total: 54000, ahorro: 16000 });
    expect(linea.bajoMinimo).toBe(true);
    expect(linea.bajoCosto).toBe(false);
  });

  it('un precio alterado mayor que la escala no da ahorro', () => {
    const linea = calcularLineaVenta({
      producto: PAPA,
      escala: 'menor',
      cantidad: 1000,
      precioAlterado: 18000,
    });
    expect(linea).toMatchObject({ total: 18000, ahorro: 0, alterado: true });
  });

  it('un precio «alterado» igual al de la escala no cuenta como alterado', () => {
    expect(
      calcularLineaVenta({ producto: PAPA, escala: 'menor', cantidad: 1000, precioAlterado: 17500 })
        .alterado,
    ).toBe(false);
  });

  it('redondea al peso las cantidades en kilos (D-16)', () => {
    // 0.333 kg × $ 24,000 = $ 7,992
    expect(
      calcularLineaVenta({ producto: JAMON, escala: 'menor', cantidad: 333, precioAlterado: null })
        .total,
    ).toBe(7992);
  });
});

describe('calcularVenta', () => {
  it('reproduce la factura actual 84771: total $ 79,250 y ahorro $ 12,000', () => {
    const venta = calcularVenta([
      { producto: PAPA, escala: 'menor', cantidad: 4000, precioAlterado: 14500 },
      { producto: CAJA_35, escala: 'mayor', cantidad: 5000, precioAlterado: null },
      { producto: CAJA_40, escala: 'mayor', cantidad: 5000, precioAlterado: null },
    ]);
    expect(venta.total).toBe(79250);
    expect(venta.ahorro).toBe(12000);
    expect(venta.lineas.map((l) => l.total)).toEqual([58000, 9750, 11500]);
  });

  it('bloquea un precio por debajo del costo (§7)', () => {
    expect(
      mensajeDe(() =>
        calcularVenta([{ producto: PAPA, escala: 'menor', cantidad: 1000, precioAlterado: 11999 }]),
      ),
    ).toBe(
      'Línea 1 (231 - PAPA FRANCESA AGRINA PREMIUM *2.5 KG): el precio ($ 11,999) queda por debajo ' +
        'del costo ($ 12,000). Use F7 para escribir un precio igual o mayor al costo.',
    );
  });

  it('bloquea también una escala que quedó por debajo del costo (D-34)', () => {
    const barato = { ...CAJA_35, precios: { ...CAJA_35.precios, menor: 1400 } };
    expect(() =>
      calcularVenta([{ producto: barato, escala: 'menor', cantidad: 1000, precioAlterado: null }]),
    ).toThrow(/por debajo del costo/);
  });

  it('acepta un precio igual al costo', () => {
    expect(
      calcularVenta([{ producto: PAPA, escala: 'menor', cantidad: 1000, precioAlterado: 12000 }])
        .total,
    ).toBe(12000);
  });

  it('rechaza factura sin líneas, productos inactivos y cantidades inválidas', () => {
    expect(() => calcularVenta([])).toThrow(/al menos un producto/);
    expect(() =>
      calcularVenta([
        {
          producto: { ...PAPA, activo: false },
          escala: 'menor',
          cantidad: 1000,
          precioAlterado: null,
        },
      ]),
    ).toThrow(/inactivo/);
    expect(() =>
      calcularVenta([{ producto: PAPA, escala: 'menor', cantidad: 0, precioAlterado: null }]),
    ).toThrow(/mayor que cero/);
    expect(() =>
      calcularVenta([{ producto: PAPA, escala: 'menor', cantidad: 1500, precioAlterado: null }]),
    ).toThrow(/por unidades/);
    expect(() =>
      calcularVenta([{ producto: PAPA, escala: 'menor', cantidad: 1000, precioAlterado: 1.5 }]),
    ).toThrow(/pesos enteros/);
  });

  it('permite el mismo producto en varias líneas (D-91)', () => {
    const venta = calcularVenta([
      { producto: CAJA_35, escala: 'mayor', cantidad: 5000, precioAlterado: null },
      { producto: CAJA_35, escala: 'menor', cantidad: 1000, precioAlterado: null },
    ]);
    expect(venta.total).toBe(9750 + 2200);
  });
});

/** Cliente de la factura actual con tope de crédito. */
const CREDITO_BASE: EntradaCredito = {
  clienteCodigo: 10065,
  clienteNombre: 'JUAN JJ FERTILIA',
  tope: 500000,
  deuda: { total: 120000, vencido: 0 },
  vencidaMasAntigua: null,
  total: 79250,
  hoy: '2026-10-02',
};

describe('razonesBloqueoCredito (S-03)', () => {
  it('permite la venta dentro del tope y sin vencidas', () => {
    expect(razonesBloqueoCredito(CREDITO_BASE)).toEqual([]);
  });

  it('permite la venta que deja el disponible exactamente en cero', () => {
    expect(
      razonesBloqueoCredito({ ...CREDITO_BASE, deuda: { total: 420750, vencido: 0 } }),
    ).toEqual([]);
  });

  it('bloquea con las dos razones de la maqueta', () => {
    expect(
      razonesBloqueoCredito({
        ...CREDITO_BASE,
        deuda: { total: 450000, vencido: 120000 },
        vencidaMasAntigua: { numero: 84650, vence: '2026-09-19' },
      }),
    ).toEqual([
      'Tiene facturas vencidas por $ 120,000 (la más antigua, la 84650, venció hace 13 días).',
      'La venta ($ 79,250) supera el crédito disponible ($ 50,000) en $ 29,250.',
    ]);
  });

  it('explica cuando la deuda ya alcanza el tope', () => {
    expect(
      razonesBloqueoCredito({ ...CREDITO_BASE, deuda: { total: 500000, vencido: 0 } }),
    ).toEqual([
      'No tiene crédito disponible: la deuda ($ 500,000) ya alcanza el tope ($ 500,000).',
    ]);
  });

  it('sin tope no bloquea, aunque haya vencidas', () => {
    expect(
      razonesBloqueoCredito({
        ...CREDITO_BASE,
        tope: null,
        deuda: { total: 9_000_000, vencido: 500000 },
      }),
    ).toEqual([]);
  });

  it('no vende a crédito a Consumidor final (D-90)', () => {
    expect(razonesBloqueoCredito({ ...CREDITO_BASE, clienteCodigo: 0, tope: null })).toEqual([
      'No se vende a crédito a «Consumidor final»: elija un cliente registrado o venda de contado.',
    ]);
  });
});

describe('calcularCambio (D-90)', () => {
  it('calcula el cambio del efectivo', () => {
    expect(calcularCambio(79250, 100000, true)).toEqual({ recibido: 100000, cambio: 20750 });
  });

  it('sin recibido toma el valor exacto', () => {
    expect(calcularCambio(79250, null, true)).toEqual({ recibido: 79250, cambio: 0 });
  });

  it('una forma sin cambio no guarda recibido ni cambio', () => {
    expect(calcularCambio(79250, 100000, false)).toEqual({ recibido: null, cambio: null });
  });

  it('rechaza un recibido menor que el total', () => {
    expect(mensajeDe(() => calcularCambio(79250, 50000, true))).toBe(
      'Lo recibido ($ 50,000) es menor que el total ($ 79,250).',
    );
  });
});

describe('validaciones de la factura', () => {
  it('el plazo es 0 en contado y se valida en crédito', () => {
    expect(plazoDeCondicion('contado', 30)).toBe(0);
    expect(plazoDeCondicion('credito', 8)).toBe(8);
    expect(() => plazoDeCondicion('credito', -1)).toThrow(/plazo/);
    expect(() => plazoDeCondicion('credito', 1000)).toThrow(/plazo/);
  });

  it('las cajas de empaque son opcionales y enteras', () => {
    expect(validarCajasEmpaque(null)).toBeNull();
    expect(validarCajasEmpaque(3)).toBe(3);
    expect(() => validarCajasEmpaque(0)).toThrow(/cajas/);
    expect(() => validarCajasEmpaque(2.5)).toThrow(/cajas/);
  });

  it('el consecutivo inicial debe superar la última factura (D-84)', () => {
    expect(validarSiguienteNumeroFactura(84772, null)).toBe(84772);
    expect(validarSiguienteNumeroFactura(84801, 84800)).toBe(84801);
    expect(() => validarSiguienteNumeroFactura(84800, 84800)).toThrow(/mayor que 84800/);
    expect(() => validarSiguienteNumeroFactura(0, null)).toThrow(/entre 1/);
  });
});
