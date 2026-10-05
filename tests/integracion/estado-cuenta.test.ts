import { describe, expect, it } from 'vitest';
import {
  ajustarConsecutivo,
  type ClaveConsecutivo,
} from '../../src/data/repositorios/consecutivos.repo';
import { facturasPendientesProveedor } from '../../src/data/repositorios/compras.repo';
import { saldoFavorDe } from '../../src/data/repositorios/saldosFavor.repo';
import { facturasPendientesCliente } from '../../src/data/repositorios/ventas.repo';
import { crearEjecutorTransacciones } from '../../src/data/transaccion';
import { textoSaldoNeto } from '../../src/domain/estado-cuenta';
import { textoDias } from '../../src/domain/reportes';
import { sembrarDatosDemo } from '../../src/main/demo/sembrar';
import { leerPeticionEstadoCuenta, leerPeticionReporte } from '../../src/main/ipc/reportes.ipc';
import { crearServicioAbonos } from '../../src/main/servicios/abonos';
import { crearServicioCompras } from '../../src/main/servicios/compras';
import { crearServicioCorrecciones } from '../../src/main/servicios/correcciones';
import { crearServicioDevoluciones } from '../../src/main/servicios/devoluciones';
import { crearServicioNegocio } from '../../src/main/servicios/negocio';
import { crearServicioProductos } from '../../src/main/servicios/productos';
import { crearServicioReportes } from '../../src/main/servicios/reportes';
import { crearServicioTerceros } from '../../src/main/servicios/terceros';
import { crearServicioVentas } from '../../src/main/servicios/ventas';
import { ErrorDeNegocio } from '../../src/domain/errores';
import type { PeticionEstadoCuenta, ReporteEstadoCuenta } from '../../src/shared/estadoCuenta';
import type { DatosTerceroNuevo } from '../../src/shared/maestros';
import { baseDeDatosDePrueba } from './ayudas';

/** Día de las maquetas. */
const HOY = '2026-10-04';

/** Momento en que se genera el estado de cuenta en las maquetas. */
const AHORA = `${HOY}T16:12:00.000-05:00`;

/** Formas de pago sembradas por la migración inicial. */
const EFECTIVO = 1;
/** Transferencia. */
const TRANSFERENCIA = 2;

/**
 * Datos de un tercero.
 *
 * @param juridica - Persona jurídica (NIT) o natural (CC).
 * @param nombre - Nombre.
 * @param numero - Identificación.
 * @param celular - Celular.
 * @param direccion - Dirección.
 * @param barrio - Barrio.
 * @param topeCredito - Tope o `null`.
 * @returns Datos completos.
 */
function tercero(
  juridica: boolean,
  nombre: string,
  numero: string,
  celular: string,
  direccion: string,
  barrio: string,
  topeCredito: number | null = null,
): DatosTerceroNuevo {
  return {
    codigo: null,
    tipoPersona: juridica ? 'juridica' : 'natural',
    nombre,
    tipoIdentificacion: juridica ? 'NIT' : 'CC',
    numeroIdentificacion: numero,
    celular,
    direccion,
    barrio,
    ciudad: 'BARRANQUILLA',
    topeCredito,
  };
}

/**
 * Arma en una base nueva, con los servicios de la app, los dos casos de la
 * maqueta docs/maquetas/estado-cuenta.html: el cliente 10001 JUAN JJ
 * FERTILIA y el proveedor 10001 AGRINA S.A.S., con sus mismos números de
 * documento, fechas y valores.
 *
 * @returns Conexión, servicio de reportes y códigos.
 */
function escenarioMaquetas(): {
  db: ReturnType<typeof baseDeDatosDePrueba>;
  reportes: ReturnType<typeof crearServicioReportes>;
} {
  const db = baseDeDatosDePrueba();
  let ahora = AHORA;
  const reloj = (): string => ahora;
  const dia = (): string => ahora.slice(0, 10);
  /**
   * Mueve el reloj de todos los servicios.
   *
   * @param fecha - Día `AAAA-MM-DD`.
   * @param hora - Hora `HH:MM`.
   */
  const el = (fecha: string, hora: string): void => {
    ahora = `${fecha}T${hora}:00.000-05:00`;
  };
  const ejecutar = crearEjecutorTransacciones(db, { reloj });
  /**
   * Deja el consecutivo listo para que el próximo documento tome `numero`.
   *
   * @param clave - Consecutivo.
   * @param numero - Número que debe tomar el próximo documento.
   */
  const siguiente = (clave: ClaveConsecutivo, numero: number): void => {
    ejecutar((ctx) => ajustarConsecutivo(ctx, clave, numero - 1));
  };
  const terceros = crearServicioTerceros(db, ejecutar);
  const productos = crearServicioProductos(db, ejecutar);
  const compras = crearServicioCompras(db, ejecutar, { hoy: dia });
  const ventas = crearServicioVentas(db, ejecutar, { reloj });
  const abonos = crearServicioAbonos(db, ejecutar, { hoy: dia });
  const correcciones = crearServicioCorrecciones(db, ejecutar);
  const devoluciones = crearServicioDevoluciones(db, ejecutar);
  const negocio = crearServicioNegocio(db, ejecutar);

  el('2026-08-20', '08:00');
  negocio.guardar({
    nombre: 'SALSAMENTARIA EL BUEN CIUDADANO',
    nit: '70694229-1',
    regimen: 'No responsable de IVA',
    direccion: 'CRA 25 # 122-04 LA PRADERA',
    telefono: '3042620852',
  });
  const agrina = terceros.crear(
    'proveedor',
    tercero(true, 'AGRINA S.A.S.', '900123456', '3005551201', 'CL 30 # 1-45', 'ZONA INDUSTRIAL'),
  ).codigo;
  const juan = terceros.crear(
    'cliente',
    tercero(
      false,
      'JUAN JJ FERTILIA',
      '212121354',
      '3042620852',
      'CARR 25 #122-04',
      'LA PRADERA',
      2_000_000,
    ),
  ).codigo;
  for (const [codigo, nombre, unidad, costo, mayor, menor, minimo] of [
    [231, 'PAPA FRANCESA AGRINA PREMIUM *2.5 KG', 'UND', 11_800, 16_000, 17_500, 12_300],
    [232, 'PAPA CASCO AGRINA *2.5 KG', 'UND', 11_500, 15_000, 16_500, 12_000],
    [233, 'YUCA PRECOCIDA AGRINA *1 KG', 'UND', 6_200, 8_000, 8_800, 6_500],
    [102, 'CAJA PIZZA 30*30 FD', 'UND', 1_450, 1_700, 1_900, 1_600],
    [301, 'QUESO MOZZARELLA', 'KG', 17_900, 25_000, 27_000, 22_000],
    [302, 'JAMON SANDWICH *1 KG', 'UND', 15_250, 19_000, 21_000, 16_500],
  ] as const) {
    productos.crear({
      codigo,
      nombre,
      proveedorCodigo: agrina,
      unidad,
      costo,
      precios: { mayor, menor, minimo },
    });
  }

  /**
   * Compra de AGRINA sin flete ni descuento.
   *
   * @param numero - Factura del proveedor.
   * @param plazoDias - Plazo.
   * @param lineas - Producto, cantidad y costo unitario.
   * @param contado - Si fue «Pagada de contado» en efectivo.
   * @returns Compra guardada.
   */
  const comprar = (
    numero: string,
    plazoDias: number,
    lineas: [number, number, number][],
    contado = false,
  ): { id: number; numero: number } =>
    compras.guardar({
      proveedorCodigo: agrina,
      numeroProveedor: numero,
      fecha: dia(),
      plazoDias,
      bodegaId: 1,
      ordenCompra: '',
      lineas: lineas.map(([productoCodigo, cantidad, costoUnitario]) => ({
        productoCodigo,
        cantidad: cantidad * 1000,
        costoUnitario,
      })),
      flete: 0,
      fleteProveedor: false,
      descuento: { modo: 'pesos', valor: 0 },
      descuentoEnCosto: false,
      contado: contado ? { formaPagoId: EFECTIVO } : null,
    });
  /**
   * Abono aplicado completo a una sola factura.
   *
   * @param tipo - Cliente o proveedor.
   * @param terceroCodigo - Tercero.
   * @param facturaId - Factura.
   * @param valor - Valor.
   * @param formaPagoId - Forma de pago.
   * @returns Número del abono.
   */
  const abonar = (
    tipo: 'cliente' | 'proveedor',
    terceroCodigo: number,
    facturaId: number,
    valor: number,
    formaPagoId: number,
  ): number =>
    abonos.guardar({
      tipo,
      terceroCodigo,
      fecha: dia(),
      formaPagoId,
      valor,
      observacion: '',
      aplicaciones: [{ facturaId, valor }],
    }).numero;
  /**
   * Venta a crédito a 8 días de JUAN JJ FERTILIA desde la Principal.
   *
   * @param lineas - Producto y cantidad en unidades (escala menor).
   * @returns Factura guardada.
   */
  const vender = (lineas: [number, number][]): { id: number; numero: number } =>
    ventas.guardar({
      ranura: null,
      clienteCodigo: juan,
      condicion: 'credito',
      plazoDias: 8,
      bodegaId: 1,
      lineas: lineas.map(([productoCodigo, cantidad]) => ({
        productoCodigo,
        escala: 'menor',
        cantidad: cantidad * 1000,
        precioAlterado: null,
      })),
      contado: null,
      cajasEmpaque: null,
    });

  // ---- AGRINA S.A.S. ----
  el('2026-08-25', '09:15');
  siguiente('compra', 31);
  const c31 = comprar('FE-5521', 30, [
    [231, 120, 11_800],
    [232, 60, 11_500],
    [233, 80, 6_200],
  ]);
  el('2026-09-05', '10:00');
  siguiente('abono_proveedor', 12);
  expect(abonar('proveedor', agrina, c31.id, 1_500_000, TRANSFERENCIA)).toBe(12);
  el('2026-09-22', '10:00');
  siguiente('compra', 36);
  comprar('FE-5698', 30, [
    [231, 78, 12_000],
    [233, 40, 6_300],
  ]);
  el('2026-09-28', '11:00');
  siguiente('abono_proveedor', 22);
  const c37 = comprar(
    'FE-5730',
    0,
    [
      [301, 40, 17_900],
      [302, 16, 15_250],
    ],
    true,
  );
  expect([c31.numero, c37.numero]).toEqual([31, 37]);
  el('2026-09-29', '10:00');
  correcciones.corregirCompra({
    facturaId: c37.id,
    version: 1,
    cambios: [
      { renglon: 1, cantidad: 40_000, costoUnitario: 17_900 },
      { renglon: 2, cantidad: 16_000, costoUnitario: 13_025 },
    ],
    flete: 0,
    descuento: { modo: 'pesos', valor: 0 },
    motivo: 'El jamón llegó con descuento',
  });
  el('2026-10-01', '10:00');
  siguiente('devolucion_compra', 2);
  devoluciones.guardar({
    tipo: 'compra',
    facturaId: c37.id,
    version: 2,
    devolucionesConocidas: 0,
    bodegaId: 1,
    lineas: [{ renglon: 1, cantidad: 5_000 }],
    motivo: 'Queso vencido',
  });

  // ---- JUAN JJ FERTILIA ----
  el('2026-09-09', '16:05');
  siguiente('factura_cliente', 84765);
  const f84765 = vender([
    [231, 2],
    [102, 5],
  ]);
  el('2026-09-12', '09:30');
  siguiente('abono_cliente', 33);
  expect(abonar('cliente', juan, f84765.id, 44_500, EFECTIVO)).toBe(33);
  el('2026-09-15', '10:10');
  correcciones.corregirVenta({
    facturaId: f84765.id,
    version: 1,
    cambios: [
      { renglon: 1, cantidad: 2_000, precio: 16_000 },
      { renglon: 2, cantidad: 4_000, precio: 1_750 },
    ],
    motivo: 'Papa a precio de mayorista y devolvió una caja',
  });
  el('2026-10-03', '16:02');
  siguiente('factura_cliente', 84790);
  const f84790 = vender([[231, 3]]);
  expect([f84765.numero, f84790.numero]).toEqual([84765, 84790]);
  el('2026-10-03', '17:00');
  siguiente('abono_cliente', 58);
  expect(abonar('cliente', juan, f84790.id, 20_000, TRANSFERENCIA)).toBe(58);

  el(HOY, '16:12');
  return { db, reportes: crearServicioReportes(db, { negocio, ahora: reloj }) };
}

/** Periodo de las maquetas. */
const PERIODO = { terceroCodigo: 10001, desde: '2026-09-01', hasta: HOY } as const;

/**
 * Renglones como se ven en la maqueta: fecha, documento, detalle, cargos, abonos y saldo.
 *
 * @param r - Estado de cuenta.
 * @returns Renglones con el saldo anterior y los totales.
 */
function comoMaqueta(r: ReporteEstadoCuenta): string[][] {
  const miles = (v: number): string => (v === 0 ? '' : v.toLocaleString('en-US'));
  return [
    ['31/08/2026', '', 'Saldo anterior', '', '', textoSaldoNeto(r.saldoAnterior)],
    ...r.movimientos.map((m) => [
      m.fecha.split('-').reverse().join('/'),
      m.documento,
      m.detalle,
      miles(m.cargo),
      miles(m.abono),
      textoSaldoNeto(m.saldo),
    ]),
    ['', 'Totales del periodo', '', miles(r.cargos), miles(r.abonos), textoSaldoNeto(r.saldoFinal)],
  ];
}

/**
 * Pendientes como se ven en la maqueta.
 *
 * @param r - Estado de cuenta.
 * @returns Documento, fecha, vence, días, total, abonado, devuelto y saldo.
 */
function pendientesComoMaqueta(r: ReporteEstadoCuenta): string[][] {
  return r.pendientes.map((p) => [
    p.documento,
    p.fecha.split('-').reverse().join('/'),
    p.vence.split('-').reverse().join('/'),
    textoDias(p),
    p.total.toLocaleString('en-US'),
    p.abonado.toLocaleString('en-US'),
    p.devuelto.toLocaleString('en-US'),
    p.saldo.toLocaleString('en-US'),
  ]);
}

describe('estado de cuenta (Fase 5c): maqueta de JUAN JJ FERTILIA', () => {
  const peticion: PeticionEstadoCuenta = { tipo: 'cliente', ...PERIODO };

  it('reproduce saldo anterior, saldo corrido, pendientes, saldo a favor y neto', () => {
    const { reportes } = escenarioMaquetas();
    const r = reportes.estadoCuenta(peticion);
    expect(r.tercero).toEqual({
      codigo: 10001,
      nombre: 'JUAN JJ FERTILIA',
      tipoIdentificacion: 'CC',
      numeroIdentificacion: '212121354',
      celular: '3042620852',
      direccion: 'CARR 25 #122-04 LA PRADERA',
      tope: 2_000_000,
    });
    expect(comoMaqueta(r)).toEqual([
      ['31/08/2026', '', 'Saldo anterior', '', '', '0'],
      ['09/09/2026', 'Factura 84765', 'Crédito 8 días, vence 17/09/2026', '44,500', '', '44,500'],
      ['12/09/2026', 'Abono 33', 'Efectivo · aplicado a 84765', '', '44,500', '0'],
      [
        '15/09/2026',
        'Factura 84765 v2',
        'Corrección: total 44,500 → 39,000; 5,500 a favor',
        '',
        '5,500',
        'A favor 5,500',
      ],
      ['03/10/2026', 'Factura 84790', 'Crédito 8 días, vence 11/10/2026', '52,500', '', '47,000'],
      ['03/10/2026', 'Abono 58', 'Transferencia · aplicado a 84790', '', '20,000', '27,000'],
      ['', 'Totales del periodo', '', '97,000', '70,000', '27,000'],
    ]);
    expect(pendientesComoMaqueta(r)).toEqual([
      ['Factura 84790', '03/10/2026', '11/10/2026', 'Faltan 7', '52,500', '20,000', '0', '32,500'],
    ]);
    expect(r.resumen).toEqual({ pendiente: 32_500, vencido: 0, saldoFavor: 5_500, neto: 27_000 });
  });

  it('coincide con Cuentas por cobrar (maqueta docs/maquetas/cuentas.html)', () => {
    const { reportes } = escenarioMaquetas();
    const cartera = reportes.cartera({
      tipo: 'cliente',
      terceroCodigo: 10001,
      soloVencidas: false,
      incluirSoloFavor: true,
    });
    const grupo = cartera.grupos[0];
    expect(grupo?.documentos.map((d) => [d.numero, d.dias, d.saldo])).toEqual([[84790, 7, 32_500]]);
    expect([grupo?.saldo, grupo?.vencido, grupo?.saldoFavor, grupo?.neto]).toEqual([
      32_500, 0, 5_500, 27_000,
    ]);
  });
});

describe('estado de cuenta (Fase 5c): maqueta de AGRINA S.A.S.', () => {
  const peticion: PeticionEstadoCuenta = { tipo: 'proveedor', ...PERIODO };

  it('reproduce saldo anterior, saldo corrido, pendientes, saldo a favor y neto', () => {
    const { reportes } = escenarioMaquetas();
    const r = reportes.estadoCuenta(peticion);
    expect(r.tercero).toMatchObject({
      nombre: 'AGRINA S.A.S.',
      tipoIdentificacion: 'NIT',
      numeroIdentificacion: '900123456',
      celular: '3005551201',
      direccion: 'CL 30 # 1-45 ZONA INDUSTRIAL',
      tope: null,
    });
    expect(comoMaqueta(r)).toEqual([
      ['31/08/2026', '', 'Saldo anterior', '', '', '2,602,000'],
      [
        '05/09/2026',
        'Abono 12',
        'Transferencia · aplicado a compra 31 (FE-5521)',
        '',
        '1,500,000',
        '1,102,000',
      ],
      [
        '22/09/2026',
        'Compra 36',
        'FE-5698 · crédito 30 días, vence 22/10/2026',
        '1,188,000',
        '',
        '2,290,000',
      ],
      ['28/09/2026', 'Compra 37', 'FE-5730 · pagada de contado', '960,000', '', '3,250,000'],
      [
        '28/09/2026',
        'Abono 22',
        'Efectivo · pago de contado de la compra 37',
        '',
        '960,000',
        '2,290,000',
      ],
      [
        '29/09/2026',
        'Compra 37 v2',
        'Corrección: total 960,000 → 924,400; 35,600 a favor',
        '',
        '35,600',
        '2,254,400',
      ],
      [
        '01/10/2026',
        'Devolución de compra 2',
        'Compra 37 · 5 KG QUESO MOZZARELLA; 89,500 a favor',
        '',
        '89,500',
        '2,164,900',
      ],
      ['', 'Totales del periodo', '', '2,148,000', '2,585,100', '2,164,900'],
    ]);
    expect(pendientesComoMaqueta(r)).toEqual([
      [
        'Compra 31 · FE-5521',
        '25/08/2026',
        '24/09/2026',
        'Vencida 10',
        '2,602,000',
        '1,500,000',
        '0',
        '1,102,000',
      ],
      [
        'Compra 36 · FE-5698',
        '22/09/2026',
        '22/10/2026',
        'Faltan 18',
        '1,188,000',
        '0',
        '0',
        '1,188,000',
      ],
    ]);
    expect(r.resumen).toEqual({
      pendiente: 2_290_000,
      vencido: 1_102_000,
      saldoFavor: 125_100,
      neto: 2_164_900,
    });
  });

  it('a un día anterior: solo lo ocurrido hasta ese día y los días contra esa fecha', () => {
    const { reportes } = escenarioMaquetas();
    const r = reportes.estadoCuenta({ ...peticion, hasta: '2026-09-28' });
    expect(r.movimientos.map((m) => m.documento)).toEqual([
      'Abono 12',
      'Compra 36',
      'Compra 37',
      'Abono 22',
    ]);
    expect(pendientesComoMaqueta(r).map((p) => p[3])).toEqual(['Vencida 4', 'Faltan 24']);
    expect(r.resumen.saldoFavor).toBe(0);
  });
});

describe('estado de cuenta (Fase 5c): hoja carta y nombre del archivo', () => {
  it('encabezado en el thead de la hoja (se repite en cada página) y «Página N de M»', () => {
    const { reportes } = escenarioMaquetas();
    const html = reportes.html({
      reporte: 'estado-cuenta',
      filtros: { tipo: 'proveedor', ...PERIODO },
    });
    const encabezado = /<table class="hoja">\s*<thead><tr><td>([\s\S]*?)<\/td><\/tr><\/thead>/.exec(
      html,
    )?.[1];
    expect(encabezado).toContain('SALSAMENTARIA EL BUEN CIUDADANO');
    expect(encabezado).toContain('NIT 70694229-1 · No responsable de IVA');
    expect(encabezado).toContain('ESTADO DE CUENTA</strong>PROVEEDOR');
    expect(encabezado).toContain('Periodo 01/09/2026 a 04/10/2026');
    expect(encabezado).toContain('Generado 04/10/2026 4:12 p. m.');
    expect(encabezado).toContain('<b>Proveedor:</b> 10001 - AGRINA S.A.S.');
    expect(html).toContain('"Página " counter(page) " de " counter(pages)');
    expect(html).toContain('Compras pendientes al 04/10/2026');
    expect(html).toContain('<strong>$ 125,100</strong>');
    expect(html).not.toContain('<script');

    const cliente = reportes.html({
      reporte: 'estado-cuenta',
      filtros: { tipo: 'cliente', ...PERIODO },
    });
    expect(cliente).toContain('<td class="num">A favor 5,500</td>');
    expect(cliente).toContain('Saldo a favor del cliente<strong>$ 5,500</strong>');
    expect(cliente).toContain('Neto a pagar<strong>$ 27,000</strong>');
    expect(cliente).toContain('<b>Tope de crédito:</b> $ 2,000,000');
  });

  it('el archivo lleva el tercero y la fecha; no se exporta a Excel', () => {
    const { reportes } = escenarioMaquetas();
    const cliente = leerPeticionReporte({
      reporte: 'estado-cuenta',
      filtros: { tipo: 'cliente', ...PERIODO },
    });
    expect(reportes.nombreArchivo(cliente, 'pdf')).toBe(
      'Estado de cuenta JUAN JJ FERTILIA 04-10-2026.pdf',
    );
    expect(
      reportes.nombreArchivo(
        { reporte: 'estado-cuenta', filtros: { tipo: 'proveedor', ...PERIODO } },
        'pdf',
      ),
    ).toBe('Estado de cuenta AGRINA S.A.S. 04-10-2026.pdf');
    expect(() => reportes.excel(cliente)).toThrow(ErrorDeNegocio);
  });

  it('el archivo reemplaza los caracteres que Windows no admite en el nombre del tercero', () => {
    const { db, reportes } = escenarioMaquetas();
    const terceros = crearServicioTerceros(
      db,
      crearEjecutorTransacciones(db, { reloj: () => AHORA }),
    );
    const { codigo } = terceros.crear(
      'cliente',
      tercero(
        false,
        'DISTRI/BUIDORA "LA 10": SUR\\NORTE*?<A>|B',
        '1',
        '3000000000',
        'CL 1',
        'CENTRO',
      ),
    );
    expect(
      reportes.nombreArchivo(
        {
          reporte: 'estado-cuenta',
          filtros: { tipo: 'cliente', ...PERIODO, terceroCodigo: codigo },
        },
        'pdf',
      ),
    ).toBe('Estado de cuenta DISTRI BUIDORA LA 10 SUR NORTE A B 04-10-2026.pdf');
  });

  it('valida el tercero, el periodo y la petición recibida por IPC', () => {
    const { reportes } = escenarioMaquetas();
    expect(() => reportes.estadoCuenta({ tipo: 'cliente', ...PERIODO, terceroCodigo: 99 })).toThrow(
      /No existe el cliente 99/,
    );
    expect(() => reportes.estadoCuenta({ tipo: 'cliente', ...PERIODO, terceroCodigo: 0 })).toThrow(
      /Consumidor final/,
    );
    expect(() =>
      reportes.estadoCuenta({ tipo: 'proveedor', ...PERIODO, desde: HOY, hasta: '2026-09-01' }),
    ).toThrow(/posterior/);
    expect(() => leerPeticionEstadoCuenta({ tipo: 'otro', ...PERIODO })).toThrow(ErrorDeNegocio);
    expect(() =>
      leerPeticionEstadoCuenta({ tipo: 'cliente', ...PERIODO, terceroCodigo: '10001' }),
    ).toThrow(ErrorDeNegocio);
  });
});

describe('estado de cuenta (Fase 5c): datos de ejemplo', () => {
  it('a hoy cuadra con la cartera y el saldo a favor de cada tercero', () => {
    const db = baseDeDatosDePrueba();
    sembrarDatosDemo(db, { hoy: HOY, desfase: '-05:00' });
    const ejecutar = crearEjecutorTransacciones(db, { reloj: () => AHORA });
    const reportes = crearServicioReportes(db, {
      negocio: crearServicioNegocio(db, ejecutar),
      ahora: () => AHORA,
    });
    for (const tipo of ['cliente', 'proveedor'] as const) {
      const codigos = (
        db
          .prepare(
            `SELECT codigo FROM ${tipo === 'cliente' ? 'clientes' : 'proveedores'} WHERE codigo > 0`,
          )
          .all() as { codigo: number }[]
      ).map((f) => f.codigo);
      for (const codigo of codigos) {
        const r = reportes.estadoCuenta({
          tipo,
          terceroCodigo: codigo,
          desde: '2026-01-01',
          hasta: HOY,
        });
        const pendientes =
          tipo === 'cliente'
            ? facturasPendientesCliente(db, codigo)
            : facturasPendientesProveedor(db, codigo);
        const etiqueta = `${tipo} ${codigo}`;
        expect(r.resumen.pendiente, etiqueta).toBe(pendientes.reduce((s, p) => s + p.saldo, 0));
        expect(r.pendientes.length, etiqueta).toBe(pendientes.length);
        expect(r.resumen.saldoFavor, etiqueta).toBe(saldoFavorDe(db, tipo, codigo));
        expect(r.saldoFinal, etiqueta).toBe(r.resumen.neto);
        expect(r.saldoAnterior + r.cargos - r.abonos, etiqueta).toBe(r.saldoFinal);
      }
    }
  });

  it('JUAN JJ FERTILIA sigue la maqueta del estado de cuenta', () => {
    const db = baseDeDatosDePrueba();
    sembrarDatosDemo(db, { hoy: HOY, desfase: '-05:00' });
    const ejecutar = crearEjecutorTransacciones(db, { reloj: () => AHORA });
    const reportes = crearServicioReportes(db, {
      negocio: crearServicioNegocio(db, ejecutar),
      ahora: () => AHORA,
    });
    const r = reportes.estadoCuenta({ tipo: 'cliente', ...PERIODO });
    expect(
      r.movimientos.map((m) => [
        m.fecha,
        m.detalle.replace(/\d{5}/g, 'N'),
        m.cargo,
        m.abono,
        m.saldo,
      ]),
    ).toEqual([
      ['2026-09-09', 'Crédito 8 días, vence 17/09/2026', 44_500, 0, 44_500],
      ['2026-09-12', 'Efectivo · aplicado a N', 0, 44_500, 0],
      ['2026-09-15', 'Corrección: total 44,500 → 39,000; 5,500 a favor', 0, 5_500, -5_500],
      ['2026-10-03', 'Crédito 8 días, vence 11/10/2026', 52_500, 0, 47_000],
      ['2026-10-03', 'Transferencia · aplicado a N', 0, 20_000, 27_000],
    ]);
    expect(r.resumen).toEqual({ pendiente: 32_500, vencido: 0, saldoFavor: 5_500, neto: 27_000 });
  });
});
