import { describe, expect, it } from 'vitest';
import { CAMPOS_IMPORTACION, type FilaImportacion } from '../shared/importacion';
import {
  aPuntoDecimal,
  leerCodigo,
  leerFechaArchivo,
  leerTipoIdentificacion,
  leerTipoPersona,
  leerUnidad,
  sugerirMapeo,
  validarFilasImportacion,
  type ContextoImportacion,
} from './importacion';

/**
 * Contexto de ejemplo: proveedor 10003; productos 101 (UND), 104 (KG, con 5 kg de stock
 * inicial en Norte) y 106 (UND, con otros movimientos); bodegas Principal (1) y Norte (2).
 */
const CONTEXTO: ContextoImportacion = {
  codigosExistentes: new Set([101]),
  identificacionesExistentes: new Set(['CC|111']),
  proveedores: new Set([10003]),
  productos: new Map([
    [101, { unidad: 'UND' as const, costo: 1500 }],
    [104, { unidad: 'KG' as const, costo: 18500 }],
    [106, { unidad: 'UND' as const, costo: 900 }],
  ]),
  bodegas: new Map([
    ['principal', 1],
    ['norte', 2],
  ]),
  bodegaPrincipalId: 1,
  stockInicial: new Map([['104|2', 5_000]]),
  productosConOtrosMovimientos: new Set([106]),
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
    const r = validarFilasImportacion('productos', [fila(0, PRODUCTO)], CONTEXTO, 'punto-decimal');
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
      'punto-decimal',
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
      'punto-decimal',
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

  it('explica cómo escribir un valor con punto de miles en lugar de adivinarlo (D-40)', () => {
    const r = validarFilasImportacion(
      'productos',
      [fila(0, { ...PRODUCTO, costo: '13.200' })],
      CONTEXTO,
      'punto-decimal',
    );
    expect(r.errores.map((e) => e.mensaje)).toEqual([
      'Costo «13.200»: use coma para separar los miles (13,200); el punto se lee como decimal.',
    ]);
  });

  it('un código existente o repetido es error de la fila, sin actualizar nada', () => {
    const r = validarFilasImportacion(
      'productos',
      [fila(0, { ...PRODUCTO, codigo: '101' }), fila(1, PRODUCTO), fila(2, PRODUCTO)],
      CONTEXTO,
      'punto-decimal',
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
    const r = validarFilasImportacion('clientes', [fila(0, CLIENTE)], CONTEXTO, 'punto-decimal');
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
      'punto-decimal',
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
      'punto-decimal',
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
      'punto-decimal',
    );
    expect(r.errores).toEqual([]);
    expect(r.registros).toEqual([
      {
        tipo: 'stock',
        fila: 2,
        productoCodigo: 101,
        bodegaId: 1,
        cantidad: 240000,
        diferencia: 240000,
        costoUnitario: 1500,
      },
      {
        tipo: 'stock',
        fila: 3,
        productoCodigo: 104,
        bodegaId: 1,
        cantidad: 12350,
        diferencia: 12350,
        costoUnitario: 18500,
      },
    ]);
    expect(r.avisos).toEqual([]);
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
      'punto-decimal',
    );
    expect(r.registros).toHaveLength(0);
    expect(r.errores.map((e) => e.campo)).toEqual(['cantidad', 'producto', 'bodega']);
  });

  it('volver a importar reemplaza el stock inicial por la diferencia, con aviso (D-39)', () => {
    const r = validarFilasImportacion(
      'stock',
      [fila(0, { producto: '104', cantidad: '8', bodega: 'NORTE' })],
      CONTEXTO,
      'punto-decimal',
    );
    expect(r.errores).toEqual([]);
    expect(r.registros[0]).toMatchObject({ cantidad: 8_000, diferencia: 3_000 });
    expect(r.avisos).toEqual([
      {
        fila: 2,
        campo: 'cantidad',
        mensaje: 'Reemplaza el stock inicial cargado antes (5.000).',
      },
    ]);
  });

  it('acepta stock inicial negativo con aviso ámbar', () => {
    const r = validarFilasImportacion(
      'stock',
      [fila(0, { producto: '101', cantidad: '-3' })],
      CONTEXTO,
      'punto-decimal',
    );
    expect(r.errores).toEqual([]);
    expect(r.registros[0]).toMatchObject({ cantidad: -3_000, diferencia: -3_000 });
    expect(r.avisos.map((a) => a.mensaje)).toEqual([
      'Cantidad negativa: el producto quedará con stock inicial negativo.',
    ]);
  });

  it('no admite stock inicial si el producto ya tiene otros movimientos (D-39)', () => {
    const r = validarFilasImportacion(
      'stock',
      [fila(0, { producto: '106', cantidad: '3' })],
      CONTEXTO,
      'punto-decimal',
    );
    expect(r.registros).toEqual([]);
    expect(r.errores.map((e) => e.mensaje)).toEqual([
      'El producto 106 ya tiene movimientos de inventario: el stock se corrige con un ajuste de inventario.',
    ]);
  });

  it('un producto repetido en la misma bodega dentro del archivo es error', () => {
    const r = validarFilasImportacion(
      'stock',
      [
        fila(0, { producto: '101', cantidad: '1' }),
        fila(1, { producto: '101', cantidad: '2', bodega: 'Principal' }),
      ],
      CONTEXTO,
      'punto-decimal',
    );
    expect(r.registros.map((x) => x.fila)).toEqual([2]);
    expect(r.errores.map((e) => e.mensaje)).toEqual([
      'El producto 101 está repetido en la misma bodega (ya aparece en la fila 2).',
    ]);
  });
});

describe('formato numérico elegido por el usuario (D-40)', () => {
  it('aPuntoDecimal intercambia punto y coma solo con coma decimal', () => {
    expect(aPuntoDecimal('1.250,5', 'coma-decimal')).toBe('1,250.5');
    expect(aPuntoDecimal('$ 13.200', 'coma-decimal')).toBe('$ 13,200');
    expect(aPuntoDecimal('1,250.5', 'punto-decimal')).toBe('1,250.5');
  });

  it('con coma decimal lee el punto como separador de miles', () => {
    const r = validarFilasImportacion(
      'productos',
      [
        fila(0, {
          ...PRODUCTO,
          costo: '$ 13.200',
          precioMayor: '14500',
          precioMenor: '15.500,00',
        }),
      ],
      CONTEXTO,
      'coma-decimal',
    );
    expect(r.errores).toEqual([]);
    expect(r.registros[0]).toMatchObject({
      datos: { costo: 13_200, precios: { mayor: 14_500, menor: 15_500, minimo: 13_000 } },
    });
  });

  it('con coma decimal, «13,200» es ambiguo y se explica cómo escribirlo', () => {
    const r = validarFilasImportacion(
      'productos',
      [fila(0, { ...PRODUCTO, costo: '13,200', precioMenor: '15500' })],
      CONTEXTO,
      'coma-decimal',
    );
    expect(r.errores.map((e) => e.mensaje)).toEqual([
      'Costo «13,200»: use punto para separar los miles (13.200); la coma se lee como decimal.',
    ]);
  });

  it('las cantidades con coma decimal se leen en milésimas', () => {
    const r = validarFilasImportacion(
      'stock',
      [
        fila(0, { producto: '104', cantidad: '1.250,5' }),
        fila(1, { producto: '101', cantidad: '12.5' }),
      ],
      CONTEXTO,
      'coma-decimal',
    );
    expect(r.registros[0]).toMatchObject({ cantidad: 1_250_500 });
    // «12.5» con coma decimal: el punto es de miles y está mal agrupado.
    expect(r.errores.map((e) => e.fila)).toEqual([3]);
  });

  it('el mensaje de cantidad inválida nombra el separador decimal elegido', () => {
    const r = validarFilasImportacion(
      'stock',
      [fila(0, { producto: '104', cantidad: '1,23456' })],
      CONTEXTO,
      'coma-decimal',
    );
    expect(r.errores[0]?.mensaje).toBe(
      'La cantidad «1,23456» no es válida: use hasta tres decimales separados por coma.',
    );
  });
});

describe('leerFechaArchivo', () => {
  it('lee dd/mm/aaaa, con guiones, ISO y el número de fecha de Excel', () => {
    expect(leerFechaArchivo('15/09/2026')).toBe('2026-09-15');
    expect(leerFechaArchivo('5/9/2026')).toBe('2026-09-05');
    expect(leerFechaArchivo('15-09-2026')).toBe('2026-09-15');
    expect(leerFechaArchivo('2026-09-15')).toBe('2026-09-15');
    expect(leerFechaArchivo('46280')).toBe('2026-09-15');
    expect(leerFechaArchivo('46280.75')).toBe('2026-09-15');
  });

  it('rechaza fechas que no existen o números fuera del rango de fechas', () => {
    expect(leerFechaArchivo('31/02/2026')).toBeNull();
    expect(leerFechaArchivo('2026-13-01')).toBeNull();
    expect(leerFechaArchivo('12345')).toBeNull();
    expect(leerFechaArchivo('ayer')).toBeNull();
    expect(leerFechaArchivo('')).toBeNull();
  });
});

describe('saldos iniciales de cartera (D-86)', () => {
  /** Contexto con clientes 10001 y 10002, la factura 84600 ya usada y la próxima en 84772. */
  const conSaldos: ContextoImportacion = {
    ...CONTEXTO,
    saldos: {
      hoy: '2026-10-02',
      clientes: new Set([0, 10001, 10002]),
      numerosFacturaCliente: new Set([84600]),
      siguienteFacturaCliente: 84772,
      facturasProveedor: new Set(['10003|FV100']),
    },
  };

  /** Saldo de cliente válido. */
  const SALDO = {
    tercero: '10001',
    numero: '84650',
    fecha: '15/09/2026',
    vence: '23/09/2026',
    plazo: '',
    saldo: '120,000',
  };

  it('acepta un saldo de cliente con vencimiento y calcula el plazo', () => {
    const r = validarFilasImportacion(
      'saldos-clientes',
      [fila(0, SALDO)],
      conSaldos,
      'punto-decimal',
    );
    expect(r.errores).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.registros).toEqual([
      {
        tipo: 'saldos-clientes',
        fila: 2,
        numero: 84650,
        datos: {
          terceroCodigo: 10001,
          fecha: '2026-09-15',
          plazoDias: 8,
          vence: '2026-09-23',
          saldo: 120_000,
        },
      },
    ]);
  });

  it('con solo el plazo calcula el vencimiento; si vienen ambos deben coincidir', () => {
    const soloPlazo = validarFilasImportacion(
      'saldos-clientes',
      [fila(0, { ...SALDO, vence: '', plazo: '30' })],
      conSaldos,
      'punto-decimal',
    );
    expect(soloPlazo.registros[0]).toMatchObject({ datos: { plazoDias: 30, vence: '2026-10-15' } });
    const distintos = validarFilasImportacion(
      'saldos-clientes',
      [fila(0, { ...SALDO, plazo: '30' })],
      conSaldos,
      'punto-decimal',
    );
    expect(distintos.errores[0]?.mensaje).toMatch(/no coincide con el vencimiento, que da 8 días/);
    const ninguno = validarFilasImportacion(
      'saldos-clientes',
      [fila(0, { ...SALDO, vence: '' })],
      conSaldos,
      'punto-decimal',
    );
    expect(ninguno.errores[0]?.mensaje).toBe('Falta el vencimiento o el plazo en días.');
  });

  it('rechaza cliente inexistente, Consumidor final, número usado o repetido y saldo no positivo', () => {
    const r = validarFilasImportacion(
      'saldos-clientes',
      [
        fila(0, { ...SALDO, tercero: '99999' }),
        fila(1, { ...SALDO, tercero: '0', numero: '84651' }),
        fila(2, { ...SALDO, numero: '84600' }),
        fila(3, { ...SALDO, numero: 'FV-12' }),
        fila(4, SALDO),
        fila(5, SALDO),
        fila(6, { ...SALDO, numero: '84652', saldo: '0' }),
        fila(7, { ...SALDO, numero: '84653', fecha: '03/10/2026', vence: '', plazo: '8' }),
        fila(8, { ...SALDO, numero: '84654', vence: '10/09/2026' }),
      ],
      conSaldos,
      'punto-decimal',
    );
    expect(r.registros.map((x) => x.fila)).toEqual([6]);
    expect(r.errores.map((e) => [e.fila, e.mensaje])).toEqual([
      [2, 'El cliente 99999 no existe.'],
      [3, '«Consumidor final» no tiene cartera: sus ventas son de contado.'],
      [4, 'La factura de venta 84600 ya existe en el sistema.'],
      [
        5,
        'El número de factura «FV-12» debe ser un número entero (el de la factura de venta en el sistema anterior).',
      ],
      [7, 'La factura 84650 está repetida (ya aparece en la fila 6).'],
      [8, 'El saldo pendiente debe ser mayor que cero.'],
      [9, 'La fecha de la factura no puede ser posterior a hoy.'],
      [10, 'El vencimiento no puede ser anterior a la fecha de la factura.'],
    ]);
  });

  it('avisa si el número alcanza la próxima factura de venta', () => {
    const r = validarFilasImportacion(
      'saldos-clientes',
      [fila(0, { ...SALDO, numero: '84800' })],
      conSaldos,
      'punto-decimal',
    );
    expect(r.registros).toHaveLength(1);
    expect(r.avisos[0]?.mensaje).toMatch(/próxima factura de venta \(84772\).*después de 84800/);
  });

  it('valida saldos de proveedor con su número de factura y detecta duplicados (D-49)', () => {
    const r = validarFilasImportacion(
      'saldos-proveedores',
      [
        fila(0, { ...SALDO, tercero: '10003', numero: ' fv-200 ', saldo: '1.250.000' }),
        fila(1, { ...SALDO, tercero: '10003', numero: 'FV 100', saldo: '5.000' }),
        fila(2, { ...SALDO, tercero: '10003', numero: 'FV-200', saldo: '5.000' }),
        fila(3, { ...SALDO, tercero: '10001', numero: 'X-1', saldo: '5.000' }),
      ],
      conSaldos,
      'coma-decimal',
    );
    expect(r.registros).toEqual([
      {
        tipo: 'saldos-proveedores',
        fila: 2,
        numeroProveedor: 'fv-200',
        numeroProveedorClave: 'FV-200',
        datos: {
          terceroCodigo: 10003,
          fecha: '2026-09-15',
          plazoDias: 8,
          vence: '2026-09-23',
          saldo: 1_250_000,
        },
      },
    ]);
    expect(r.errores.map((e) => [e.fila, e.mensaje])).toEqual([
      [3, 'El proveedor 10003 ya tiene registrada la factura FV 100.'],
      [4, 'La factura FV-200 de este proveedor está repetida (ya aparece en la fila 2).'],
      [5, 'El proveedor 10001 no existe.'],
    ]);
  });

  it('exige el contexto de cartera (error técnico del llamador)', () => {
    expect(() =>
      validarFilasImportacion('saldos-clientes', [fila(0, SALDO)], CONTEXTO, 'punto-decimal'),
    ).toThrow(/contexto de saldos/);
  });
});
