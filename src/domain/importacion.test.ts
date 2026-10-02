import { describe, expect, it } from 'vitest';
import { CAMPOS_IMPORTACION, type FilaImportacion } from '../shared/importacion';
import {
  leerCodigo,
  leerPesos,
  leerTipoIdentificacion,
  leerTipoPersona,
  leerUnidad,
  sugerirMapeo,
  validarFilasImportacion,
  type ContextoImportacion,
} from './importacion';

/**
 * Contexto de ejemplo: proveedor 10003, producto 101 (UND) y 104 (KG), bodega Principal (1) y Norte (2).
 */
const CONTEXTO: ContextoImportacion = {
  codigosExistentes: new Set([101]),
  identificacionesExistentes: new Set(['CC|111']),
  proveedores: new Set([10003]),
  productos: new Map([
    [101, { unidad: 'UND' as const, costo: 1500 }],
    [104, { unidad: 'KG' as const, costo: 18500 }],
  ]),
  bodegas: new Map([
    ['principal', 1],
    ['norte', 2],
  ]),
  bodegaPrincipalId: 1,
  stockInicialExistente: new Set(['104|2']),
};

/**
 * Crea una fila numerada desde la 2 (la 1 es el encabezado).
 *
 * @param indice - Posición de la fila de datos (0 = primera).
 * @param valores - Campos de la fila.
 * @returns La fila.
 */
function fila(indice: number, valores: Record<string, string>): FilaImportacion {
  return { numero: indice + 2, valores };
}

/**
 * Producto válido de ejemplo.
 */
const PRODUCTO = {
  codigo: '105',
  nombre: 'PAPA FRANCESA AGRINA PREMIUM *2.5 KG',
  proveedor: '10003',
  unidad: 'Unidad',
  costo: '$ 13,200',
  precioMayor: '14500',
  precioMenor: '15,500.00',
  precioMinimo: '13000',
};

/**
 * Cliente válido de ejemplo.
 */
const CLIENTE = {
  codigo: '10065',
  nombre: 'JUAN JJ FERTILIA',
  tipoIdentificacion: 'C.C.',
  numeroIdentificacion: '212121354',
  celular: '3042620852',
  direccion: 'CARR 25 #122-04',
  barrio: 'LA PRADERA',
  ciudad: 'BARRANQUILLA',
};

describe('lectura de celdas', () => {
  it('lee pesos con o sin comas, signo y centavos en cero', () => {
    expect(leerPesos('13200')).toBe(13200);
    expect(leerPesos('$ 1,250,000')).toBe(1250000);
    expect(leerPesos('13200.00')).toBe(13200);
    expect(leerPesos('13200.50')).toBeNull();
    expect(leerPesos('15.000')).toBeNull();
    expect(leerPesos('13,2')).toBeNull();
    expect(leerPesos('15,000.000')).toBe(15000);
    expect(leerPesos('-500')).toBeNull();
    expect(leerPesos('abc')).toBeNull();
  });

  it('lee códigos enteros, también con «.0» de hoja de cálculo', () => {
    expect(leerCodigo('101')).toBe(101);
    expect(leerCodigo('101.0')).toBe(101);
    expect(leerCodigo('0')).toBeNull();
    expect(leerCodigo('10.5')).toBeNull();
  });

  it('reconoce variantes de unidad, identificación y persona', () => {
    expect(leerUnidad('Unidad')).toBe('UND');
    expect(leerUnidad('KILOS')).toBe('KG');
    expect(leerUnidad('lb')).toBeNull();
    expect(leerTipoIdentificacion('C.C.')).toBe('CC');
    expect(leerTipoIdentificacion('Cédula de extranjería')).toBe('CE');
    expect(leerTipoIdentificacion('RUT')).toBeNull();
    expect(leerTipoPersona('Jurídica', 'CC')).toBe('juridica');
    expect(leerTipoPersona('', 'NIT')).toBe('juridica');
    expect(leerTipoPersona('', 'CC')).toBe('natural');
    expect(leerTipoPersona('otra', 'CC')).toBeNull();
  });
});

describe('sugerirMapeo', () => {
  it('asigna columnas por sinónimos sin tildes ni mayúsculas, una vez cada una', () => {
    const mapeo = sugerirMapeo(
      ['Código', 'Descripción', 'Proveedor', 'Unidad', 'Costo', 'Precio 1', 'Precio 2', 'Precio 3'],
      CAMPOS_IMPORTACION.productos,
    );
    expect(mapeo).toEqual({
      codigo: 0,
      nombre: 1,
      proveedor: 2,
      unidad: 3,
      costo: 4,
      precioMayor: 5,
      precioMenor: 6,
      precioMinimo: 7,
    });
  });

  it('deja sin asignar lo que no reconoce', () => {
    const mapeo = sugerirMapeo(['Col A'], CAMPOS_IMPORTACION.stock);
    expect(mapeo).toEqual({ producto: null, cantidad: null, bodega: null });
  });
});

describe('validarFilasImportacion: productos', () => {
  it('convierte una fila válida', () => {
    const r = validarFilasImportacion('productos', [fila(0, PRODUCTO)], CONTEXTO);
    expect(r.errores).toEqual([]);
    expect(r.registros).toEqual([
      {
        tipo: 'productos',
        fila: 2,
        datos: {
          codigo: 105,
          nombre: 'PAPA FRANCESA AGRINA PREMIUM *2.5 KG',
          proveedorCodigo: 10003,
          unidad: 'UND',
          costo: 13200,
          precios: { mayor: 14500, menor: 15500, minimo: 13000 },
        },
      },
    ]);
  });

  it('sin código usa el consecutivo', () => {
    const r = validarFilasImportacion(
      'productos',
      [fila(0, { ...PRODUCTO, codigo: '' })],
      CONTEXTO,
    );
    expect(r.registros[0]).toMatchObject({ datos: { codigo: null } });
  });

  it('marca los errores de cada campo y conserva las filas válidas (D-26)', () => {
    const r = validarFilasImportacion(
      'productos',
      [
        fila(0, PRODUCTO),
        fila(1, { ...PRODUCTO, codigo: '106', proveedor: '99', unidad: 'lb', costo: '1.5' }),
        fila(2, { ...PRODUCTO, codigo: '107', nombre: '' }),
      ],
      CONTEXTO,
    );
    expect(r.total).toBe(3);
    expect(r.registros.map((x) => x.fila)).toEqual([2]);
    expect(r.errores.filter((e) => e.fila === 3).map((e) => e.campo)).toEqual([
      'proveedor',
      'unidad',
      'costo',
    ]);
    expect(r.errores.find((e) => e.fila === 4)?.mensaje).toMatch(/Nombre/);
  });

  it('un código existente o repetido es error de la fila, sin actualizar nada', () => {
    const r = validarFilasImportacion(
      'productos',
      [fila(0, { ...PRODUCTO, codigo: '101' }), fila(1, PRODUCTO), fila(2, PRODUCTO)],
      CONTEXTO,
    );
    expect(r.registros.map((x) => x.fila)).toEqual([3]);
    expect(r.errores.map((e) => e.mensaje)).toEqual([
      'El código 101 ya existe en el sistema.',
      'El código 105 está repetido (ya aparece en la fila 3).',
    ]);
  });
});

describe('validarFilasImportacion: clientes y proveedores', () => {
  it('convierte una fila válida y deduce el tipo de persona', () => {
    const r = validarFilasImportacion('clientes', [fila(0, CLIENTE)], CONTEXTO);
    expect(r.errores).toEqual([]);
    expect(r.registros[0]).toMatchObject({
      tipo: 'clientes',
      datos: { codigo: 10065, tipoPersona: 'natural', tipoIdentificacion: 'CC', topeCredito: null },
    });
  });

  it('rechaza identificaciones existentes o repetidas en el archivo (D-29)', () => {
    const r = validarFilasImportacion(
      'proveedores',
      [
        fila(0, { ...CLIENTE, codigo: '', numeroIdentificacion: '111' }),
        fila(1, { ...CLIENTE, codigo: '' }),
        fila(2, { ...CLIENTE, codigo: '', numeroIdentificacion: '212.121.354' }),
      ],
      CONTEXTO,
    );
    expect(r.registros.map((x) => x.fila)).toEqual([3]);
    expect(r.errores.map((e) => e.fila)).toEqual([2, 4]);
    expect(r.errores[1]?.mensaje).toMatch(/repetida/);
  });

  it('informa los datos obligatorios que faltan', () => {
    const r = validarFilasImportacion(
      'clientes',
      [fila(0, { ...CLIENTE, celular: '', tipoIdentificacion: 'RUT' })],
      CONTEXTO,
    );
    expect(r.errores.map((e) => e.campo)).toEqual(['tipoIdentificacion']);
  });
});

describe('validarFilasImportacion: stock inicial', () => {
  it('lee la cantidad según la unidad y usa la Principal por defecto', () => {
    const r = validarFilasImportacion(
      'stock',
      [
        fila(0, { producto: '101', cantidad: '240' }),
        fila(1, { producto: '104', cantidad: '12.35', bodega: '' }),
      ],
      CONTEXTO,
    );
    expect(r.errores).toEqual([]);
    expect(r.registros).toEqual([
      {
        tipo: 'stock',
        fila: 2,
        productoCodigo: 101,
        bodegaId: 1,
        cantidad: 240000,
        costoUnitario: 1500,
      },
      {
        tipo: 'stock',
        fila: 3,
        productoCodigo: 104,
        bodegaId: 1,
        cantidad: 12350,
        costoUnitario: 18500,
      },
    ]);
  });

  it('rechaza decimales en UND, productos o bodegas inexistentes', () => {
    const r = validarFilasImportacion(
      'stock',
      [
        fila(0, { producto: '101', cantidad: '1.5' }),
        fila(1, { producto: '999', cantidad: '1' }),
        fila(2, { producto: '104', cantidad: '1', bodega: 'Sur' }),
      ],
      CONTEXTO,
    );
    expect(r.registros).toHaveLength(0);
    expect(r.errores.map((e) => e.campo)).toEqual(['cantidad', 'producto', 'bodega']);
  });

  it('no permite cargar dos veces el stock inicial de un producto en una bodega (D-39)', () => {
    const r = validarFilasImportacion(
      'stock',
      [
        fila(0, { producto: '104', cantidad: '1', bodega: 'NORTE' }),
        fila(1, { producto: '101', cantidad: '1' }),
        fila(2, { producto: '101', cantidad: '2', bodega: 'Principal' }),
      ],
      CONTEXTO,
    );
    expect(r.registros.map((x) => x.fila)).toEqual([3]);
    expect(r.errores.map((e) => e.mensaje)).toEqual([
      'El producto 104 ya tiene stock inicial en esa bodega.',
      'El producto 101 está repetido en la misma bodega (ya aparece en la fila 3).',
    ]);
  });
});
