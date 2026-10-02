import { describe, expect, it } from 'vitest';
import type { ProductoResumen, Tercero } from '../../shared/maestros';
import {
  calcularEnPantalla,
  compraTieneDatos,
  formularioCompraVacio,
  peticionCompra,
  type FormularioCompra,
} from './formularioCompra';

/** Proveedor de la compra (dueño de los productos de prueba). */
const proveedor: Tercero = {
  codigo: 10004,
  nombre: 'CÁRNICOS DEL VALLE',
  tipoPersona: 'juridica',
  tipoIdentificacion: 'NIT',
  numeroIdentificacion: '900123456',
  celular: '',
  direccion: '',
  barrio: '',
  ciudad: '',
  topeCredito: null,
  activo: true,
  esSistema: false,
};

/**
 * Producto de prueba.
 *
 * @param codigo - Código.
 * @param unidad - Unidad.
 * @returns Producto.
 */
function producto(codigo: number, unidad: 'UND' | 'KG' = 'UND'): ProductoResumen {
  return {
    codigo,
    nombre: `PRODUCTO ${codigo}`,
    proveedorCodigo: 10004,
    proveedorNombre: 'CÁRNICOS DEL VALLE',
    unidad,
    costo: 7800,
    precios: { mayor: 9500, menor: 10000, minimo: 9000 },
    activo: true,
    stockTotal: 0,
  };
}

/**
 * Formulario con dos líneas del ejemplo de la maqueta.
 *
 * @returns Formulario.
 */
function formularioEjemplo(): FormularioCompra {
  return {
    ...formularioCompraVacio('2026-10-02', '1'),
    proveedor,
    numeroProveedor: 'FV-20931',
    plazo: '30',
    lineas: [
      { id: 1, producto: producto(103), cantidad: '24', costo: '7,900' },
      { id: 2, producto: producto(104, 'KG'), cantidad: '15.5', costo: '18,900' },
    ],
    flete: '30,000',
  };
}

describe('formularioCompraVacio', () => {
  it('propone la fecha de hoy en dd/mm/aaaa y plazo 0', () => {
    const f = formularioCompraVacio('2026-10-02', '1');
    expect(f.fecha).toBe('02/10/2026');
    expect(f.plazo).toBe('0');
    expect(compraTieneDatos(f)).toBe(false);
  });
});

describe('calcularEnPantalla', () => {
  it('calcula con la misma regla del dominio y asocia cada línea', () => {
    const { compra, porLinea, error } = calcularEnPantalla(formularioEjemplo());
    expect(error).toBeNull();
    expect(compra?.subtotal).toBe(189_600 + 292_950);
    expect(porLinea.get(1)?.total).toBe(189_600);
    expect((porLinea.get(1)?.flete ?? 0) + (porLinea.get(2)?.flete ?? 0)).toBe(30_000);
  });

  it('omite las líneas a medio escribir', () => {
    const f = formularioEjemplo();
    f.lineas[1] = { ...f.lineas[1]!, cantidad: '' };
    const { compra, porLinea } = calcularEnPantalla(f);
    expect(compra?.subtotal).toBe(189_600);
    expect(porLinea.has(2)).toBe(false);
  });

  it('informa el flete o el descuento mal escritos', () => {
    expect(calcularEnPantalla({ ...formularioEjemplo(), flete: '30.000,5' }).error).toMatch(
      /flete/,
    );
    expect(
      calcularEnPantalla({ ...formularioEjemplo(), descuentoModo: 'porcentaje', descuento: '2,5' })
        .error,
    ).toMatch(/porcentaje/);
  });

  it('muestra el error del dominio (descuento mayor que el subtotal)', () => {
    const r = calcularEnPantalla({ ...formularioEjemplo(), descuento: '9,999,999' });
    expect(r.error).toBe('El descuento no puede ser mayor que el subtotal de la compra.');
    expect(r.compra).toBeNull();
  });
});

describe('peticionCompra', () => {
  it('arma la petición con fecha ISO, milésimas y pesos', () => {
    const r = peticionCompra({
      ...formularioEjemplo(),
      descuentoModo: 'porcentaje',
      descuento: '2',
      contado: true,
      formaPagoId: '3',
    });
    expect(r.ok).toBe(true);
    expect(r.ok && r.datos).toMatchObject({
      proveedorCodigo: 10004,
      fecha: '2026-10-02',
      plazoDias: 30,
      bodegaId: 1,
      lineas: [
        { productoCodigo: 103, cantidad: 24_000, costoUnitario: 7900 },
        { productoCodigo: 104, cantidad: 15_500, costoUnitario: 18_900 },
      ],
      flete: 30_000,
      descuento: { modo: 'porcentaje', valor: 200 },
      contado: { formaPagoId: 3 },
    });
  });

  it('explica el primer dato que falta o está mal escrito', () => {
    const base = formularioEjemplo();
    const mensaje = (f: FormularioCompra): string | null => {
      const r = peticionCompra(f);
      return r.ok ? null : r.error.mensaje;
    };
    expect(mensaje({ ...base, proveedor: null })).toBe('Elija el proveedor.');
    expect(mensaje({ ...base, fecha: '31/02/2026' })).toMatch(/fecha no es válida/);
    expect(mensaje({ ...base, plazo: '1.5' })).toMatch(/plazo/);
    expect(mensaje({ ...base, lineas: [] })).toMatch(/al menos un producto/);
    expect(mensaje({ ...base, lineas: [{ ...base.lineas[0]!, cantidad: '2.5' }] })).toBe(
      'Línea 1 (103 - PRODUCTO 103): la cantidad debe ser un número entero de unidades.',
    );
    expect(mensaje({ ...base, contado: true })).toMatch(/forma de pago/);
  });
});
