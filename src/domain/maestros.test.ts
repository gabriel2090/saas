import { describe, expect, it } from 'vitest';
import type { DatosProducto, DatosTercero } from '../shared/maestros';
import {
  claveIdentificacion,
  normalizarIdentificacion,
  siguienteConsecutivo,
  validarCodigo,
  validarDatosCatalogo,
  validarDatosNegocio,
  validarDatosProducto,
  validarDatosTercero,
  validarMotivo,
  validarPesos,
} from './maestros';

/**
 * Producto válido de ejemplo.
 */
const PRODUCTO: DatosProducto = {
  nombre: '  PAPA FRANCESA   AGRINA ',
  proveedorCodigo: 10003,
  unidad: 'UND',
  precios: { mayor: 14500, menor: 15500, minimo: 13000 },
};

/**
 * Tercero válido de ejemplo.
 */
const TERCERO: DatosTercero = {
  tipoPersona: 'natural',
  nombre: ' Juan  JJ Fertilia ',
  tipoIdentificacion: 'CC',
  numeroIdentificacion: '212.121.354',
  celular: '304 262 0852',
  direccion: 'CARR 25 #122-04',
  barrio: ' LA PRADERA ',
  ciudad: 'BARRANQUILLA',
  topeCredito: 500000,
};

describe('validarDatosProducto', () => {
  it('limpia el nombre y conserva los precios', () => {
    expect(validarDatosProducto(PRODUCTO)).toEqual({
      ...PRODUCTO,
      nombre: 'PAPA FRANCESA AGRINA',
    });
  });

  it('exige nombre, proveedor y unidad válida', () => {
    expect(() => validarDatosProducto({ ...PRODUCTO, nombre: '   ' })).toThrow(/obligatorio/);
    expect(() => validarDatosProducto({ ...PRODUCTO, proveedorCodigo: 0 })).toThrow(/proveedor/);
    expect(() =>
      validarDatosProducto({ ...PRODUCTO, unidad: 'LB' as DatosProducto['unidad'] }),
    ).toThrow(/UND o KG/);
  });

  it('rechaza precios con decimales o negativos', () => {
    expect(() =>
      validarDatosProducto({ ...PRODUCTO, precios: { ...PRODUCTO.precios, menor: 15500.5 } }),
    ).toThrow(/Precio menor/);
    expect(() =>
      validarDatosProducto({ ...PRODUCTO, precios: { ...PRODUCTO.precios, minimo: -1 } }),
    ).toThrow(/Precio mínimo/);
  });

  it('un precio por debajo del costo no es error (D-34)', () => {
    expect(() =>
      validarDatosProducto({ ...PRODUCTO, precios: { mayor: 1, menor: 1, minimo: 1 } }),
    ).not.toThrow();
  });
});

describe('validaciones sueltas', () => {
  it('pesos enteros no negativos', () => {
    expect(validarPesos(0, 'Costo')).toBe(0);
    expect(() => validarPesos(1.5, 'Costo')).toThrow(/Costo/);
    expect(() => validarPesos(-1, 'Costo')).toThrow();
  });

  it('códigos enteros positivos', () => {
    expect(validarCodigo(101)).toBe(101);
    expect(() => validarCodigo(0)).toThrow();
    expect(() => validarCodigo(10.5)).toThrow();
  });

  it('motivo obligatorio', () => {
    expect(validarMotivo('  error de digitación ')).toBe('error de digitación');
    expect(() => validarMotivo('  ')).toThrow(/Motivo/);
  });
});

describe('identificación', () => {
  it('quita puntos y espacios', () => {
    expect(normalizarIdentificacion('CC', ' 1.234.567 ')).toBe('1234567');
    expect(normalizarIdentificacion('NIT', '900.123.456-7')).toBe('900123456-7');
    expect(normalizarIdentificacion('PASAPORTE', 'ab 123')).toBe('AB123');
  });

  it('valida los caracteres según el tipo', () => {
    expect(() => normalizarIdentificacion('CC', '12A')).toThrow(/solo dígitos/);
    expect(() => normalizarIdentificacion('NIT', '900-12')).toThrow(/verificación/);
    expect(() => normalizarIdentificacion('CE', '')).toThrow(/obligatorio/);
  });

  it('la clave combina tipo y número', () => {
    expect(claveIdentificacion('CC', '123')).not.toBe(claveIdentificacion('NIT', '123'));
  });
});

describe('validarDatosTercero', () => {
  it('limpia los datos del cliente', () => {
    expect(validarDatosTercero(TERCERO, 'cliente')).toEqual({
      ...TERCERO,
      nombre: 'Juan JJ Fertilia',
      numeroIdentificacion: '212121354',
      barrio: 'LA PRADERA',
    });
  });

  it('a los proveedores les quita el tope de crédito', () => {
    expect(validarDatosTercero(TERCERO, 'proveedor').topeCredito).toBeNull();
  });

  it('exige los datos obligatorios del §5.2', () => {
    expect(() => validarDatosTercero({ ...TERCERO, celular: '' }, 'cliente')).toThrow(/Celular/);
    expect(() => validarDatosTercero({ ...TERCERO, direccion: ' ' }, 'cliente')).toThrow(
      /Dirección/,
    );
    expect(() =>
      validarDatosTercero({ ...TERCERO, tipoPersona: 'juridica', nombre: '' }, 'cliente'),
    ).toThrow(/Razón social/);
  });

  it('barrio y ciudad son opcionales; el tope debe ser positivo', () => {
    expect(() =>
      validarDatosTercero({ ...TERCERO, barrio: '', ciudad: '', topeCredito: null }, 'cliente'),
    ).not.toThrow();
    expect(() => validarDatosTercero({ ...TERCERO, topeCredito: 0 }, 'cliente')).toThrow(/tope/);
  });

  it('el celular solo admite caracteres de teléfono', () => {
    expect(() => validarDatosTercero({ ...TERCERO, celular: 'abc' }, 'cliente')).toThrow(/celular/);
  });
});

describe('catálogos y negocio', () => {
  it('las bodegas nunca calculan cambio', () => {
    expect(validarDatosCatalogo({ nombre: ' Norte ', calculaCambio: true }, 'bodega')).toEqual({
      nombre: 'Norte',
      calculaCambio: false,
    });
    expect(
      validarDatosCatalogo({ nombre: 'Efectivo', calculaCambio: true }, 'forma-pago'),
    ).toMatchObject({ calculaCambio: true });
  });

  it('el negocio exige nombre, NIT y régimen', () => {
    const datos = {
      nombre: 'SALSAMENTARIA EL BUEN CIUDADANO',
      nit: '70694229-1',
      regimen: 'No responsable de IVA',
      direccion: 'CRA 31 # 120-54',
      telefono: '',
    };
    expect(validarDatosNegocio(datos)).toEqual(datos);
    expect(() => validarDatosNegocio({ ...datos, nit: ' ' })).toThrow(/NIT/);
  });
});

describe('siguienteConsecutivo', () => {
  it('siempre queda por encima del código usado', () => {
    expect(siguienteConsecutivo(101, 105)).toBe(106);
    expect(siguienteConsecutivo(110, 105)).toBe(110);
    expect(siguienteConsecutivo(10001, 10065)).toBe(10066);
  });
});
