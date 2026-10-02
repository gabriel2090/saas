import { describe, expect, it } from 'vitest';
import type { ProductoResumen, RegistroCatalogo, Tercero } from '../../shared/maestros';
import {
  avisosStock,
  calcularVentaEnPantalla,
  cambioEnPantalla,
  formaPagoPropuesta,
  formularioVentaVacio,
  peticionVenta,
  restaurarBorrador,
  serializarBorrador,
  ventaTieneDatos,
  type FormularioVenta,
} from './formularioVenta';

/**
 * Cliente de prueba.
 *
 * @param codigo - Código.
 * @param nombre - Nombre.
 * @returns Cliente.
 */
function cliente(codigo: number, nombre: string): Tercero {
  return {
    codigo,
    nombre,
    tipoPersona: 'natural',
    tipoIdentificacion: 'CC',
    numeroIdentificacion: '212121354',
    celular: '',
    direccion: '',
    barrio: '',
    ciudad: '',
    topeCredito: null,
    activo: true,
    esSistema: codigo === 0,
  };
}

/** «Consumidor final», el cliente de los borradores nuevos. */
const consumidorFinal = cliente(0, 'CONSUMIDOR FINAL');

/** Cliente registrado. */
const juan = cliente(10065, 'JUAN JJ FERTILIA');

/**
 * Producto de prueba con precios Mayor 14,000 / Menor 17,500 / Mínimo 15,000.
 *
 * @param codigo - Código.
 * @param cambios - Datos distintos de los de por defecto.
 * @returns Producto.
 */
function producto(codigo: number, cambios: Partial<ProductoResumen> = {}): ProductoResumen {
  return {
    codigo,
    nombre: `PRODUCTO ${codigo}`,
    proveedorCodigo: 10004,
    proveedorNombre: 'CÁRNICOS DEL VALLE',
    unidad: 'UND',
    costo: 12_000,
    precios: { mayor: 14_000, menor: 17_500, minimo: 15_000 },
    activo: true,
    stockTotal: 0,
    ...cambios,
  };
}

/** Formas de pago: efectivo calcula cambio, transferencia no. */
const formas: RegistroCatalogo[] = [
  { id: 1, nombre: 'Efectivo', calculaCambio: true, activo: true, esPrincipal: false },
  { id: 2, nombre: 'Transferencia', calculaCambio: false, activo: true, esPrincipal: false },
];

/**
 * Formulario de contado con dos líneas.
 *
 * @returns Formulario.
 */
function ejemplo(): FormularioVenta {
  return {
    ...formularioVentaVacio(consumidorFinal, '1', '1'),
    lineas: [
      { id: 1, producto: producto(231), escala: 'menor', cantidad: '4', precio: null },
      { id: 2, producto: producto(101), escala: 'mayor', cantidad: '5', precio: null },
    ],
  };
}

describe('borrador vacío', () => {
  it('empieza con Consumidor final de contado y no cuenta como datos', () => {
    const f = formularioVentaVacio(consumidorFinal, '1', '1');
    expect(f).toMatchObject({ cliente: consumidorFinal, condicion: 'contado', lineas: [] });
    expect(ventaTieneDatos(f)).toBe(false);
    expect(ventaTieneDatos({ ...f, cliente: juan })).toBe(true);
    expect(ventaTieneDatos(ejemplo())).toBe(true);
  });

  it('propone la forma de pago que calcula cambio', () => {
    expect(formaPagoPropuesta([...formas].reverse())).toBe('1');
    expect(formaPagoPropuesta([{ ...formas[1]!, id: 7 }])).toBe('7');
    expect(formaPagoPropuesta([])).toBe('');
  });
});

describe('calcularVentaEnPantalla', () => {
  it('suma las líneas completas con el precio de su escala', () => {
    const calculo = calcularVentaEnPantalla(ejemplo());
    expect(calculo.total).toBe(4 * 17_500 + 5 * 14_000);
    expect(calculo.ahorro).toBe(0);
    expect(calculo.errores).toEqual([]);
  });

  it('el precio alterado con F7 da ahorro; bajo el Mínimo avisa y bajo el costo bloquea', () => {
    const f = ejemplo();
    const conRebaja: FormularioVenta = {
      ...f,
      lineas: [
        { ...f.lineas[0]!, precio: '14,500' },
        { ...f.lineas[1]!, precio: '11,000' },
      ],
    };
    const calculo = calcularVentaEnPantalla(conRebaja);
    expect(calculo.porLinea.get(1)).toMatchObject({
      total: 58_000,
      ahorro: 12_000,
      alterado: true,
    });
    expect(calculo.avisos).toEqual([
      'Línea 1 (231 - PRODUCTO 231): el precio ($ 14,500) queda por debajo del Mínimo ($ 15,000). Se puede vender (D-87).',
    ]);
    expect(calculo.errores).toEqual([
      'Línea 2 (101 - PRODUCTO 101): el precio ($ 11,000) queda por debajo del costo ($ 12,000). Use F7 para escribir un precio igual o mayor al costo.',
    ]);
  });

  it('omite las líneas a medio escribir y marca los productos inactivos', () => {
    const f = ejemplo();
    const calculo = calcularVentaEnPantalla({
      ...f,
      lineas: [
        { ...f.lineas[0]!, cantidad: '' },
        { ...f.lineas[1]!, producto: producto(101, { activo: false }) },
      ],
    });
    expect(calculo.porLinea.has(1)).toBe(false);
    expect(calculo.total).toBe(70_000);
    expect(calculo.errores[0]).toContain('el producto está inactivo');
  });
});

describe('avisosStock', () => {
  it('avisa cuando la venta deja el stock negativo, sumando las líneas del mismo producto', () => {
    const f = ejemplo();
    const repetido: FormularioVenta = {
      ...f,
      lineas: [...f.lineas, { ...f.lineas[1]!, id: 3, cantidad: '2' }],
    };
    const { textos, lineas } = avisosStock(
      repetido,
      new Map([
        [231, 10_000],
        [101, 6000],
      ]),
      'Principal',
    );
    expect([...lineas]).toEqual([3]);
    expect(textos).toEqual([
      'Línea 3 · 101 PRODUCTO 101: en Principal quedan 6 UND; el stock quedará en −1. Se puede vender igual (§5.1).',
    ]);
  });
});

describe('cambioEnPantalla', () => {
  it('calcula el cambio solo con formas que lo calculan', () => {
    expect(cambioEnPantalla(79_250, '100,000', formas[0])).toBe(20_750);
    expect(cambioEnPantalla(79_250, '', formas[0])).toBe(0);
    expect(cambioEnPantalla(79_250, '50,000', formas[0])).toBeNull();
    expect(cambioEnPantalla(79_250, '100,000', formas[1])).toBeNull();
  });
});

describe('borradores en disco (D-83, D-89)', () => {
  it('al reabrir toma los precios vigentes salvo los alterados con F7, y avisa', () => {
    const f: FormularioVenta = {
      ...ejemplo(),
      cliente: juan,
      condicion: 'credito',
      plazo: '8',
      cajas: '2',
    };
    f.lineas[1] = { ...f.lineas[1]!, precio: '14,500' };
    const contenido = serializarBorrador(f);
    let id = 100;
    const restaurado = restaurarBorrador(
      contenido,
      {
        productos: [
          producto(231, { precios: { mayor: 14_000, menor: 18_000, minimo: 15_000 } }),
          producto(101, { precios: { mayor: 15_000, menor: 17_500, minimo: 15_000 } }),
        ],
        clientes: [consumidorFinal, juan],
      },
      () => id++,
      formularioVentaVacio(consumidorFinal, '1', '1'),
    );
    expect(restaurado?.formulario).toMatchObject({
      cliente: juan,
      condicion: 'credito',
      plazo: '8',
      cajas: '2',
    });
    expect(
      restaurado?.formulario.lineas.map((l) => [l.id, l.producto.precios.menor, l.precio]),
    ).toEqual([
      [100, 18_000, null],
      [101, 17_500, '14,500'],
    ]);
    expect(restaurado?.avisos).toEqual([
      'Línea 1 · 231 PRODUCTO 231: el precio Menor cambió de $ 17,500 a $ 18,000.',
    ]);
  });

  it('quita productos que ya no existen y marca los inactivos', () => {
    const contenido = serializarBorrador(ejemplo());
    const restaurado = restaurarBorrador(
      contenido,
      { productos: [producto(101, { activo: false })], clientes: [consumidorFinal] },
      () => 1,
      formularioVentaVacio(consumidorFinal, '1', '1'),
    );
    expect(restaurado?.formulario.lineas).toHaveLength(1);
    expect(restaurado?.avisos).toEqual([
      'Línea 1: el producto 231 ya no existe y se quitó del borrador.',
      'Línea 1 · 101 PRODUCTO 101: el producto está inactivo; quítelo para poder guardar.',
    ]);
  });

  it('ignora contenido ilegible', () => {
    const vacio = formularioVentaVacio(consumidorFinal, '1', '1');
    const catalogos = { productos: [], clientes: [] };
    expect(restaurarBorrador('{', catalogos, () => 1, vacio)).toBeNull();
    expect(restaurarBorrador('[1]', catalogos, () => 1, vacio)).toBeNull();
  });
});

describe('peticionVenta', () => {
  it('arma la petición de contado con lo recibido', () => {
    const r = peticionVenta({ ...ejemplo(), recibido: '200,000', cajas: '3' }, 2, formas);
    expect(r).toEqual({
      ok: true,
      datos: {
        ranura: 2,
        clienteCodigo: 0,
        condicion: 'contado',
        plazoDias: 0,
        bodegaId: 1,
        lineas: [
          { productoCodigo: 231, escala: 'menor', cantidad: 4000, precioAlterado: null },
          { productoCodigo: 101, escala: 'mayor', cantidad: 5000, precioAlterado: null },
        ],
        contado: { formaPagoId: 1, recibido: 200_000 },
        cajasEmpaque: 3,
      },
    });
  });

  it('a crédito lleva el plazo y no lleva pago', () => {
    const r = peticionVenta(
      { ...ejemplo(), cliente: juan, condicion: 'credito', plazo: '8', recibido: '5' },
      1,
      formas,
    );
    expect(r.ok && r.datos).toMatchObject({ condicion: 'credito', plazoDias: 8, contado: null });
  });

  it('explica el primer dato inválido', () => {
    const f = ejemplo();
    const conLinea = (cambios: Partial<FormularioVenta['lineas'][number]>): FormularioVenta => ({
      ...f,
      lineas: [{ ...f.lineas[0]!, ...cambios }],
    });
    const mensaje = (g: FormularioVenta): string => {
      const r = peticionVenta(g, 1, formas);
      return r.ok ? '' : r.error.mensaje;
    };
    expect(mensaje({ ...f, cliente: null })).toBe('Elija el cliente.');
    expect(mensaje({ ...f, lineas: [] })).toBe('Agregue al menos un producto a la factura.');
    expect(mensaje(conLinea({ cantidad: '1.5' }))).toContain('número entero de unidades');
    expect(mensaje(conLinea({ precio: '14.500' }))).toContain('el precio no es un valor válido');
    expect(mensaje({ ...f, formaPagoId: '' })).toBe(
      'Elija la forma de pago de la factura de contado.',
    );
    expect(mensaje({ ...f, recibido: 'mucho' })).toContain('Lo recibido no es un valor válido');
    expect(mensaje({ ...f, cajas: '0' })).toContain('cajas de empaque');
    expect(mensaje({ ...f, condicion: 'credito', plazo: '8 días' })).toBe(
      'El plazo debe ser un número entero de días.',
    );
  });
});
