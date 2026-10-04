import { describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../../src/data/conexion';
import { consultarConsecutivo } from '../../src/data/repositorios/consecutivos.repo';
import { listarHistorial } from '../../src/data/repositorios/historial.repo';
import { crearEjecutorTransacciones } from '../../src/data/transaccion';
import { crearServicioAbonos } from '../../src/main/servicios/abonos';
import { crearServicioCorrecciones } from '../../src/main/servicios/correcciones';
import { crearServicioImportador } from '../../src/main/servicios/importador';
import { crearServicioImpresion, formatoDocumento } from '../../src/main/servicios/impresion';
import { crearServicioNegocio } from '../../src/main/servicios/negocio';
import { crearServicioProductos } from '../../src/main/servicios/productos';
import { crearServicioTerceros } from '../../src/main/servicios/terceros';
import { crearServicioVentas } from '../../src/main/servicios/ventas';
import type { PeticionGuardarAbono } from '../../src/shared/abonos';
import type { FilaImportacion } from '../../src/shared/importacion';
import type { DatosTerceroNuevo } from '../../src/shared/maestros';
import type { PeticionGuardarFactura } from '../../src/shared/ventas';
import { baseDeDatosDePrueba } from './ayudas';

/** Día de hoy en todas las pruebas. */
const HOY = '2026-09-10';

/**
 * Datos de un tercero de prueba.
 *
 * @param numero - Número de identificación (único).
 * @param nombre - Nombre.
 * @param topeCredito - Tope de crédito (solo clientes).
 * @returns Datos completos.
 */
function tercero(numero: string, nombre: string, topeCredito: number | null): DatosTerceroNuevo {
  return {
    codigo: null,
    tipoPersona: 'natural',
    nombre,
    tipoIdentificacion: 'CC',
    numeroIdentificacion: numero,
    celular: '3042620852',
    direccion: 'CARR 25 #122-04',
    barrio: 'LA PRADERA',
    ciudad: 'BARRANQUILLA',
    topeCredito,
  };
}

/**
 * Base con un proveedor, un producto, un cliente con tope y los servicios de
 * ventas, abonos, importador e impresión, todos con el día fijo en {@link HOY}.
 *
 * @returns Conexión, servicios y códigos.
 */
function crear(): {
  db: BaseDeDatos;
  ventas: ReturnType<typeof crearServicioVentas>;
  abonos: ReturnType<typeof crearServicioAbonos>;
  importador: ReturnType<typeof crearServicioImportador>;
  impresion: ReturnType<typeof crearServicioImpresion>;
  cliente: number;
  proveedor: number;
} {
  const reloj = (): string => `${HOY}T10:00:00.000-05:00`;
  const hoy = (): string => HOY;
  const db = baseDeDatosDePrueba();
  const ejecutar = crearEjecutorTransacciones(db, { reloj });
  const terceros = crearServicioTerceros(db, ejecutar);
  const proveedor = terceros.crear('proveedor', tercero('900', 'AGRINA', null)).codigo;
  crearServicioProductos(db, ejecutar).crear({
    codigo: 231,
    nombre: 'PAPA FRANCESA AGRINA PREMIUM *2.5 KG',
    proveedorCodigo: proveedor,
    unidad: 'UND',
    costo: 12_000,
    precios: { mayor: 16_000, menor: 17_500, minimo: 14_000 },
  });
  const cliente = terceros.crear(
    'cliente',
    tercero('212121354', 'JUAN JJ FERTILIA', 500_000),
  ).codigo;
  const ventas = crearServicioVentas(db, ejecutar, { reloj });
  const abonos = crearServicioAbonos(db, ejecutar, { hoy });
  return {
    db,
    ventas,
    abonos,
    importador: crearServicioImportador(db, ejecutar, { hoy }),
    impresion: crearServicioImpresion({
      negocio: crearServicioNegocio(db, ejecutar),
      abonos,
      ventas,
      correcciones: crearServicioCorrecciones(db, ejecutar),
      reloj,
    }),
    cliente,
    proveedor,
  };
}

/**
 * Factura a crédito a 8 días de `unidades` papas a $ 17,500.
 *
 * @param cliente - Código del cliente.
 * @param unidades - Unidades vendidas.
 * @returns Petición completa.
 */
function facturaCredito(cliente: number, unidades: number): PeticionGuardarFactura {
  return {
    ranura: null,
    clienteCodigo: cliente,
    condicion: 'credito',
    plazoDias: 8,
    bodegaId: 1,
    lineas: [
      { productoCodigo: 231, escala: 'menor', cantidad: unidades * 1000, precioAlterado: null },
    ],
    contado: null,
    cajasEmpaque: null,
  };
}

/**
 * Abono de cliente en efectivo, hoy.
 *
 * @param cliente - Código del cliente.
 * @param aplicaciones - Reparto entre facturas.
 * @returns Petición completa.
 */
function abonoCliente(
  cliente: number,
  aplicaciones: PeticionGuardarAbono['aplicaciones'],
): PeticionGuardarAbono {
  return {
    tipo: 'cliente',
    terceroCodigo: cliente,
    fecha: HOY,
    formaPagoId: 1,
    valor: aplicaciones.reduce((suma, a) => suma + a.valor, 0),
    observacion: 'PAGO EN CAJA',
    aplicaciones,
  };
}

/**
 * Arma filas numeradas desde la 2 (la 1 es el encabezado).
 *
 * @param valores - Valores de cada fila.
 * @returns Filas de importación.
 */
function filas(...valores: Record<string, string>[]): FilaImportacion[] {
  return valores.map((v, i) => ({ numero: i + 2, valores: v }));
}

describe('abonos de cliente (§8)', () => {
  it('abona a facturas a crédito con su propio consecutivo y la anulación devuelve el saldo', () => {
    const { db, ventas, abonos, cliente } = crear();
    const f1 = ventas.guardar(facturaCredito(cliente, 2));
    const f2 = ventas.guardar(facturaCredito(cliente, 4));
    expect(abonos.contexto('cliente')).toEqual({
      siguienteNumero: 1,
      hoy: HOY,
      formaSaldoFavor: { id: expect.any(Number) as number, nombre: 'Saldo a favor' },
    });
    expect(abonos.contexto('proveedor').siguienteNumero).toBe(1);

    const contexto = abonos.contextoTercero('cliente', cliente);
    expect(contexto.deuda).toEqual({ total: 105_000, vencido: 0 });
    expect(contexto.facturas.map((f) => [f.numero, f.saldo, f.saldoInicial, f.referencia])).toEqual(
      [
        [f1.numero, 35_000, false, ''],
        [f2.numero, 70_000, false, ''],
      ],
    );

    const guardado = abonos.guardar(
      abonoCliente(cliente, [
        { facturaId: f1.id, valor: 35_000 },
        { facturaId: f2.id, valor: 10_000 },
      ]),
    );
    expect(guardado.numero).toBe(1);
    expect(abonos.contexto('cliente').siguienteNumero).toBe(2);
    expect(abonos.contexto('proveedor').siguienteNumero).toBe(1);
    expect(ventas.obtener(f1.id).saldo).toBe(0);
    expect(ventas.creditoCliente(cliente).deuda.total).toBe(60_000);
    expect(abonos.contextoTercero('cliente', cliente).facturas.map((f) => f.numero)).toEqual([
      f2.numero,
    ]);
    expect(abonos.obtener(guardado.id)).toMatchObject({
      tipo: 'cliente',
      terceroCodigo: cliente,
      terceroNombre: 'JUAN JJ FERTILIA',
      valor: 45_000,
      aplicaciones: [
        { facturaNumero: f1.numero, valor: 35_000, saldoActual: 0, saldoInicial: false },
        { facturaNumero: f2.numero, valor: 10_000, saldoActual: 60_000 },
      ],
    });

    abonos.anular({ id: guardado.id, motivo: 'Cheque devuelto' });
    expect(ventas.creditoCliente(cliente).deuda.total).toBe(105_000);
    expect(abonos.contextoTercero('cliente', cliente).abonos[0]).toMatchObject({
      estado: 'anulado',
      motivoAnulacion: 'Cheque devuelto',
    });
    const historial = listarHistorial(db, { entidad: 'abono_cliente' });
    expect(historial.map((h) => h.accion).sort()).toEqual(['anular', 'crear']);
  });

  it('no abona a Consumidor final ni a clientes que no existen, ni más que el saldo', () => {
    const { ventas, abonos, cliente } = crear();
    const f = ventas.guardar(facturaCredito(cliente, 1));
    expect(() => abonos.contextoTercero('cliente', 0)).toThrow(/Consumidor final/);
    expect(() => abonos.guardar(abonoCliente(0, [{ facturaId: f.id, valor: 100 }]))).toThrow(
      /Consumidor final/,
    );
    expect(() => abonos.contextoTercero('cliente', 99_999)).toThrow(/No existe el cliente 99999/);
    expect(() =>
      abonos.guardar(abonoCliente(cliente, [{ facturaId: f.id, valor: 20_000 }])),
    ).toThrow();
  });
});

describe('saldos iniciales (D-86)', () => {
  it('importa saldos de cliente con su número, ajusta el consecutivo y cuentan en el crédito', () => {
    const { db, ventas, abonos, importador, cliente } = crear();
    ventas.configurar({ siguienteNumero: 84772, impresora: null });
    const archivo = filas(
      {
        tercero: String(cliente),
        numero: '84650',
        fecha: '01/09/2026',
        vence: '09/09/2026',
        plazo: '',
        saldo: '120,000',
      },
      {
        tercero: String(cliente),
        numero: '84800',
        fecha: '05/09/2026',
        vence: '',
        plazo: '15',
        saldo: '30000',
      },
    );
    const validacion = importador.validar('saldos-clientes', archivo);
    expect(validacion).toMatchObject({ total: 2, validas: 2, errores: [] });
    expect(validacion.avisos.map((a) => a.fila)).toEqual([3]);

    expect(importador.importar('saldos-clientes', archivo)).toEqual({
      importadas: 2,
      omitidas: 0,
      errores: [],
    });
    expect(consultarConsecutivo(db, 'factura_cliente')).toBe(84801);

    const contexto = abonos.contextoTercero('cliente', cliente);
    expect(contexto.facturas).toEqual([
      expect.objectContaining({
        numero: 84650,
        saldoInicial: true,
        fecha: '2026-09-01',
        vence: '2026-09-09',
        total: 120_000,
        saldo: 120_000,
      }),
      expect.objectContaining({ numero: 84800, saldoInicial: true, vence: '2026-09-20' }),
    ]);
    // Las facturas importadas no tienen líneas ni mueven inventario.
    const lineas = db.prepare('SELECT COUNT(*) AS n FROM facturas_cliente_lineas').get() as {
      n: number;
    };
    expect(lineas.n).toBe(0);
    expect(listarHistorial(db, { entidad: 'factura_cliente' })).toHaveLength(2);

    // El saldo inicial vencido el 09/09 bloquea el crédito del cliente con tope (S-03).
    expect(ventas.creditoCliente(cliente).deuda).toEqual({ total: 150_000, vencido: 120_000 });
    expect(() => ventas.guardar(facturaCredito(cliente, 1))).toThrow(/facturas vencidas/);

    // Reimportar el mismo archivo no duplica nada.
    const otraVez = importador.importar('saldos-clientes', archivo);
    expect(otraVez.importadas).toBe(0);
    expect(otraVez.errores[0]?.mensaje).toMatch(/ya existe en el sistema/);

    // El abono al saldo inicial lo salda y la factura vencida deja de bloquear.
    const facturaId = contexto.facturas[0]?.id ?? 0;
    const abono = abonos.guardar(abonoCliente(cliente, [{ facturaId, valor: 120_000 }]));
    expect(abonos.obtener(abono.id).aplicaciones[0]).toMatchObject({
      facturaNumero: 84650,
      saldoInicial: true,
      saldoActual: 0,
    });
    expect(ventas.guardar(facturaCredito(cliente, 1)).numero).toBe(84801);
  });

  it('importa saldos de proveedor con número interno de compra y su factura como referencia', () => {
    const { db, abonos, importador, proveedor } = crear();
    const archivo = filas(
      {
        tercero: String(proveedor),
        numero: 'FV-100',
        fecha: '20/08/2026',
        vence: '19/09/2026',
        plazo: '30',
        saldo: '1250000',
      },
      {
        tercero: String(proveedor),
        numero: 'fv- 100',
        fecha: '20/08/2026',
        vence: '19/09/2026',
        plazo: '',
        saldo: '5000',
      },
    );
    const resultado = importador.importar('saldos-proveedores', archivo);
    expect(resultado.importadas).toBe(1);
    expect(resultado.errores.map((e) => e.fila)).toEqual([3]);
    expect(consultarConsecutivo(db, 'compra')).toBe(2);
    expect(abonos.contextoTercero('proveedor', proveedor)).toMatchObject({
      deuda: { total: 1_250_000, vencido: 0 },
      facturas: [{ numero: 1, referencia: 'FV-100', saldoInicial: true, saldo: 1_250_000 }],
    });
    expect(importador.importar('saldos-proveedores', archivo.slice(0, 1)).errores[0]?.mensaje).toBe(
      `El proveedor ${proveedor} ya tiene registrada la factura FV-100.`,
    );
  });
});

describe('recibo de abono de cliente (D-93)', () => {
  it('sale en tirilla solo si se pide, con la deuda actual, y no confunde el tipo de abono', () => {
    const { ventas, abonos, impresion, cliente } = crear();
    const f1 = ventas.guardar(facturaCredito(cliente, 2));
    ventas.guardar(facturaCredito(cliente, 4));
    const { id } = abonos.guardar(abonoCliente(cliente, [{ facturaId: f1.id, valor: 20_000 }]));

    const tirilla = { tipo: 'abono-cliente', id, reimpresion: false, tirilla: true } as const;
    const carta = { tipo: 'abono-cliente', id, reimpresion: false } as const;
    expect(formatoDocumento(tirilla)).toBe('tirilla');
    expect(formatoDocumento(carta)).toBe('carta');
    expect(
      formatoDocumento({ tipo: 'abono-proveedor', id, reimpresion: false, tirilla: true }),
    ).toBe('tirilla');
    expect(formatoDocumento({ tipo: 'abono-proveedor', id, reimpresion: false })).toBe('carta');
    expect(formatoDocumento({ tipo: 'factura-proveedor', id, reimpresion: false })).toBe('tirilla');

    const html = impresion.html(tirilla);
    expect(html).toContain('RECIBO DE ABONO');
    expect(html).toContain('SALDO PENDIENTE');
    expect(html).toContain('85,000');
    expect(impresion.html(carta)).toContain('RECIBO DE ABONO DE CLIENTE No. 1');
    expect(impresion.nombreArchivo(carta)).toBe('Recibo de abono 1.pdf');
    expect(() => impresion.html({ tipo: 'abono-proveedor', id, reimpresion: false })).toThrow(
      /no es de proveedor/,
    );
  });
});
