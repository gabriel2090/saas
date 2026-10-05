import { read, utils } from 'xlsx';
import { describe, expect, it } from 'vitest';
import { stockEnBodega } from '../../src/data/repositorios/kardex.repo';
import { crearEjecutorTransacciones } from '../../src/data/transaccion';
import { ErrorDeNegocio } from '../../src/domain/errores';
import { sembrarDatosDemo } from '../../src/main/demo/sembrar';
import { leerPeticionHistorial, leerPeticionReporte } from '../../src/main/ipc/reportes.ipc';
import { crearServicioNegocio } from '../../src/main/servicios/negocio';
import { crearServicioReportes } from '../../src/main/servicios/reportes';
import type { PeticionHistorial } from '../../src/shared/historial';
import type { PeticionKardex } from '../../src/shared/kardex';
import { baseDeDatosDePrueba } from './ayudas';

/** Día de los datos de ejemplo. */
const HOY = '2026-10-04';

/** Momento del corte en las pruebas. */
const AHORA = `${HOY}T16:12:00.000-05:00`;

/** Id de la bodega principal. */
const PRINCIPAL = 1;

/**
 * Base con los datos de ejemplo y el servicio de reportes.
 *
 * @returns Conexión y servicio.
 */
function crear(): {
  db: ReturnType<typeof baseDeDatosDePrueba>;
  reportes: ReturnType<typeof crearServicioReportes>;
} {
  const db = baseDeDatosDePrueba();
  sembrarDatosDemo(db, { hoy: HOY, desfase: '-05:00' });
  const ejecutar = crearEjecutorTransacciones(db, { reloj: () => AHORA });
  return {
    db,
    reportes: crearServicioReportes(db, {
      negocio: crearServicioNegocio(db, ejecutar),
      ahora: () => AHORA,
    }),
  };
}

/**
 * Kardex de todo el año de los datos de ejemplo.
 *
 * @param productoCodigo - Producto.
 * @param bodegaId - Bodega o `null`.
 * @returns Petición.
 */
function kardex(productoCodigo: number, bodegaId: number | null): PeticionKardex {
  return { productoCodigo, bodegaId, desde: '2026-01-01', hasta: HOY };
}

/**
 * Historial de todo el año con filtros opcionales.
 *
 * @param cambios - Filtros a cambiar.
 * @returns Petición.
 */
function historial(cambios: Partial<PeticionHistorial> = {}): PeticionHistorial {
  return { desde: '2026-01-01', hasta: HOY, tipo: null, accion: null, texto: '', ...cambios };
}

describe('kardex (Fase 5b)', () => {
  it('el saldo final de cada bodega cuadra con el stock del kardex', () => {
    const { db, reportes } = crear();
    for (const [codigo, bodega] of [
      [231, PRINCIPAL],
      [231, 2],
      [104, PRINCIPAL],
      [301, 2],
    ] as const) {
      const r = reportes.kardex(kardex(codigo, bodega));
      expect(r.saldoFinal).toBe(stockEnBodega(db, codigo, bodega));
      expect(r.saldoAnterior + r.entradas - r.salidas).toBe(r.saldoFinal);
    }
  });

  it('muestra el documento de origen, el tercero y la versión de la corrección', () => {
    const { reportes } = crear();
    const r = reportes.kardex(kardex(231, PRINCIPAL));
    expect(r.bodega).toBe('Principal');
    expect(r.saldoFinal).toBe(175_000);
    const cajas = reportes.kardex(kardex(102, PRINCIPAL));
    const correccion = cajas.filas.find((f) => f.movimiento === 'Corrección de venta');
    expect(correccion).toMatchObject({
      documento: 'Factura 84762 · versión 2',
      tercero: 'JUAN JJ FERTILIA',
      entrada: 1000,
      ver: { tipo: 'factura-cliente', numero: 84762 },
    });
    const compra = r.filas.find((f) => f.documento === 'Compra 6 · FE-5698 · versión 2');
    expect(compra).toMatchObject({ salida: 2000, tercero: 'AGRINA S.A.S.' });
  });

  it('devoluciones, anulaciones y ajustes llevan su texto y su marca', () => {
    const { reportes } = crear();
    const cajas = reportes.kardex(kardex(101, null));
    expect(cajas.filas.find((f) => f.movimiento === 'Devolución de venta')).toMatchObject({
      documento: 'Devolución 1 · fact. 84763',
      ver: { tipo: 'factura-cliente', numero: 84763 },
    });
    expect(cajas.filas.find((f) => f.movimiento === 'Anulación de venta')?.marca).toBe('ANULADA');
    const vasos = reportes.kardex(kardex(103, PRINCIPAL));
    expect(vasos.filas.at(-1)?.documento).toBe('Devolución 1 · compra 7');
    const tocineta = reportes.kardex(kardex(305, PRINCIPAL));
    expect(tocineta.filas.at(-1)).toMatchObject({
      movimiento: 'Ajuste (daño)',
      documento: 'Ajuste 1',
      ver: null,
    });
  });

  it('el saldo anterior suma lo que pasó antes del periodo y cuenta el día «hasta» completo', () => {
    const { reportes } = crear();
    const completo = reportes.kardex(kardex(231, null));
    const parcial = reportes.kardex({
      productoCodigo: 231,
      bodegaId: null,
      desde: '2026-09-22',
      hasta: '2026-10-02',
    });
    const antes = completo.filas.filter((f) => f.fecha < '2026-09-22');
    expect(parcial.saldoAnterior).toBe(antes.at(-1)?.saldo);
    expect(parcial.filas.map((f) => f.id)).toEqual(
      completo.filas
        .filter((f) => f.fecha >= '2026-09-22' && f.fecha < '2026-10-03')
        .map((f) => f.id),
    );
    expect(parcial.filas.at(-1)?.movimiento).toBe('Corrección de compra');
  });

  it('existencia negativa y periodos o productos inválidos', () => {
    const { reportes } = crear();
    const bolsa = reportes.kardex(kardex(104, PRINCIPAL));
    expect(bolsa.saldoFinal).toBe(-3000);
    expect(bolsa.valorCostoActual).toBeLessThan(0);
    expect(() => reportes.kardex(kardex(999_999, null))).toThrow(ErrorDeNegocio);
    expect(() => reportes.kardex(kardex(231, 99))).toThrow(ErrorDeNegocio);
    expect(() =>
      reportes.kardex({ productoCodigo: 231, bodegaId: null, desde: HOY, hasta: '2026-01-01' }),
    ).toThrow(/posterior/);
    expect(() =>
      reportes.kardex({ productoCodigo: 231, bodegaId: null, desde: '2026-02-30', hasta: HOY }),
    ).toThrow(/no es válida/);
  });

  it('se imprime en carta y se exporta a Excel con las cifras como números', () => {
    const { reportes } = crear();
    const peticion = leerPeticionReporte({ reporte: 'kardex', filtros: kardex(231, null) });
    const html = reportes.html(peticion);
    expect(html).toContain('KARDEX');
    expect(html).toContain('<th>Bodega</th>');
    expect(html).toContain('Compra 6 · FE-5698 · versión 2');
    expect(html).toContain('Saldo anterior al 01/01/2026');
    expect(reportes.html({ reporte: 'kardex', filtros: kardex(231, PRINCIPAL) })).not.toContain(
      '<th>Bodega</th>',
    );
    expect(reportes.nombreArchivo(peticion, 'pdf')).toBe(`Kardex 231 ${HOY}.pdf`);
    expect(reportes.nombreArchivo(peticion, 'xlsx')).toBe(`Kardex 231 ${HOY}.xlsx`);

    const kardexTodas = reportes.kardex(kardex(231, null));
    const libro = read(reportes.excel(peticion), { type: 'array' });
    expect(libro.SheetNames).toEqual(['Kardex']);
    const filas = utils.sheet_to_json<unknown[]>(libro.Sheets.Kardex ?? {}, {
      header: 1,
      raw: true,
    });
    expect(filas[0]).toEqual(['Kardex']);
    expect(filas[2]?.[0]).toContain('Producto 231 - PAPA FRANCESA AGRINA PREMIUM *2.5 KG');
    expect(filas[4]).toEqual([
      'Fecha',
      'Hora',
      'Movimiento',
      'Documento',
      'Tercero',
      'Bodega',
      'Entrada',
      'Salida',
      'Saldo',
      'Costo unitario',
    ]);
    expect(filas[5]?.[2]).toBe('Saldo anterior al 01/01/2026');
    expect(filas).toHaveLength(5 + 1 + kardexTodas.filas.length + 1);
    const primera = filas[6] ?? [];
    expect(typeof primera[0]).toBe('number');
    expect(primera[8]).toBe((kardexTodas.filas[0]?.saldo ?? 0) / 1000);
    const total = filas.at(-1) ?? [];
    expect(total[0]).toBe(`Totales del periodo · ${kardexTodas.filas.length} movimientos`);
    expect(total[8]).toBe(kardexTodas.saldoFinal / 1000);

    const principal = read(reportes.excel({ reporte: 'kardex', filtros: kardex(231, PRINCIPAL) }), {
      type: 'array',
    });
    const encabezado = utils.sheet_to_json<unknown[]>(principal.Sheets.Kardex ?? {}, {
      header: 1,
    })[4];
    expect(encabezado).not.toContain('Bodega');
    expect(() => reportes.excel({ reporte: 'historial', filtros: historial() })).toThrow(
      ErrorDeNegocio,
    );
  });
});

describe('visor del historial de cambios (Fase 5b)', () => {
  it('lista del más reciente al más antiguo con tipo, documento y resumen en palabras', () => {
    const { reportes } = crear();
    const r = reportes.historial(historial());
    expect(r.truncado).toBe(false);
    expect(r.registros.length).toBeGreaterThan(50);
    const ids = r.registros.map((x) => x.id);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
    expect(r.registros).toContainEqual(
      expect.objectContaining({
        tipo: 'Factura de venta',
        documento: '84762',
        accion: 'editar',
        resumen: expect.stringContaining('versión 2') as unknown,
      }),
    );
  });

  it('filtra por periodo, tipo, acción y texto', () => {
    const { reportes } = crear();
    const anuladas = reportes.historial(historial({ accion: 'anular' }));
    expect(anuladas.registros.every((x) => x.accion === 'anular')).toBe(true);
    expect(anuladas.registros.map((x) => x.documento).sort()).toEqual(
      ['84768', 'Abono 3', 'Compra 8'].sort(),
    );
    const compras = reportes.historial(historial({ tipo: 'factura-proveedor' }));
    expect(compras.registros.every((x) => x.tipo === 'Factura de proveedor')).toBe(true);
    const octubre = reportes.historial(historial({ desde: '2026-10-04' }));
    expect(octubre.registros.every((x) => x.fecha.startsWith('2026-10-04'))).toBe(true);
    expect(octubre.registros.length).toBeGreaterThan(0);
    const texto = reportes.historial(historial({ texto: 'fogon' }));
    expect(texto.registros.length).toBeGreaterThan(0);
    expect(texto.registros.every((x) => /FOGON/i.test(`${x.resumen} ${x.documento}`))).toBe(true);
    const config = reportes.historial(historial({ tipo: 'configuracion' }));
    expect(new Set(config.registros.map((x) => x.tipo))).toEqual(
      new Set(['Configuración', 'Consecutivo', 'Bodega']),
    );
  });

  it('el detalle de una corrección muestra versión, motivo y solo los campos cambiados', () => {
    const { reportes } = crear();
    const registro = reportes
      .historial(historial({ tipo: 'factura-cliente', accion: 'editar' }))
      .registros.find((x) => x.documento === '84762');
    expect(registro).toBeDefined();
    const d = reportes.detalleHistorial(registro?.id ?? 0);
    expect(d.titulo).toBe('Factura de venta 84762 · Editar');
    expect(d.ver).toMatchObject({ tipo: 'factura-cliente', numero: 84762 });
    expect(d.datos.map((x) => x.etiqueta)).toEqual([
      'Fecha y hora',
      'Cliente',
      'Versión',
      'Motivo',
    ]);
    expect(d.campos).toContainEqual({
      campo: 'Línea 2 · 102 CAJA PIZZA 30*30 FD · cantidad',
      antes: '5',
      despues: '4',
    });
    expect(d.campos.every((c) => c.antes !== c.despues)).toBe(true);
    expect(() => reportes.detalleHistorial(999_999)).toThrow(ErrorDeNegocio);
  });

  it('un abono abre su comprobante y un producto no abre nada', () => {
    const { reportes } = crear();
    const registros = reportes.historial(historial()).registros;
    const abono = registros.find((x) => x.documento === 'Abono 4' && x.tipo === 'Abono de cliente');
    expect(reportes.detalleHistorial(abono?.id ?? 0).ver).toMatchObject({
      tipo: 'abono-cliente',
      numero: 4,
    });
    const producto = registros.find((x) => x.tipo === 'Producto');
    expect(reportes.detalleHistorial(producto?.id ?? 0).ver).toBeNull();
  });

  it('valida la petición recibida por IPC e imprime con los filtros en palabras', () => {
    const { reportes } = crear();
    expect(() => leerPeticionHistorial({ ...historial(), tipo: 'otro' })).toThrow(ErrorDeNegocio);
    expect(() => leerPeticionHistorial({ ...historial(), accion: 'borrar' })).toThrow(
      ErrorDeNegocio,
    );
    const html = reportes.html({
      reporte: 'historial',
      filtros: historial({ accion: 'anular' }),
    });
    expect(html).toContain('HISTORIAL DE CAMBIOS');
    expect(html).toContain('Del 01/01/2026 al 04/10/2026 · todos los tipos · acción Anular');
    expect(html).toContain('Se cobró dos veces con tarjeta');
  });
});
