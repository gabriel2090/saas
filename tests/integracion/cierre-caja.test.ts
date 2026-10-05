import { describe, expect, it } from 'vitest';
import { crearEjecutorTransacciones } from '../../src/data/transaccion';
import { ErrorDeNegocio } from '../../src/domain/errores';
import { leerPeticionGuardarCierre } from '../../src/main/ipc/cierres.ipc';
import { leerPeticionReporte } from '../../src/main/ipc/reportes.ipc';
import { crearServicioAbonos } from '../../src/main/servicios/abonos';
import { crearServicioCierreCaja } from '../../src/main/servicios/cierreCaja';
import { crearServicioCompras } from '../../src/main/servicios/compras';
import { crearServicioCorrecciones } from '../../src/main/servicios/correcciones';
import { crearServicioNegocio } from '../../src/main/servicios/negocio';
import { crearServicioProductos } from '../../src/main/servicios/productos';
import { crearServicioReportes } from '../../src/main/servicios/reportes';
import { crearServicioTerceros } from '../../src/main/servicios/terceros';
import { crearServicioVentas } from '../../src/main/servicios/ventas';
import type {
  CalculoCierre,
  ConceptoCierre,
  PeticionGuardarCierre,
} from '../../src/shared/cierreCaja';
import { CODIGO_CONSUMIDOR_FINAL } from '../../src/shared/ventas';
import { baseDeDatosDePrueba } from './ayudas';

/** Formas de pago sembradas por la migración inicial. */
const EFECTIVO = 1;
/** Transferencia. */
const TRANSFERENCIA = 2;
/** Tarjeta. */
const TARJETA = 3;

/**
 * Valores de un concepto por forma (Efectivo, Transferencia, Tarjeta).
 *
 * @param calculo - Cálculo.
 * @param concepto - Concepto.
 * @returns Valores.
 */
function valores(calculo: CalculoCierre, concepto: ConceptoCierre): number[] {
  return calculo.filas.find((f) => f.concepto === concepto)?.valores ?? [];
}

/**
 * Captura el error de negocio de una función.
 *
 * @param fn - Función que debe fallar.
 * @returns El error.
 */
function errorDe(fn: () => unknown): ErrorDeNegocio {
  try {
    fn();
  } catch (error) {
    if (error instanceof ErrorDeNegocio) return error;
    throw error;
  }
  throw new Error('Se esperaba un error de negocio.');
}

/**
 * Arma la base con los servicios de la app y un reloj que se mueve.
 *
 * @returns Servicios, conexión y función para mover el reloj.
 */
function escenario(): {
  db: ReturnType<typeof baseDeDatosDePrueba>;
  el: (fecha: string, hora: string) => void;
  cierres: ReturnType<typeof crearServicioCierreCaja>;
  reportes: ReturnType<typeof crearServicioReportes>;
  vender: (forma: number, unidades: number) => { id: number; numero: number };
  abonos: ReturnType<typeof crearServicioAbonos>;
  correcciones: ReturnType<typeof crearServicioCorrecciones>;
  compras: ReturnType<typeof crearServicioCompras>;
  juan: number;
  agrina: number;
  ventas: ReturnType<typeof crearServicioVentas>;
} {
  const db = baseDeDatosDePrueba();
  let ahora = '2026-10-03T08:00:00.000-05:00';
  const reloj = (): string => ahora;
  const dia = (): string => ahora.slice(0, 10);
  const el = (fecha: string, hora: string): void => {
    ahora = `${fecha}T${hora}:00.000-05:00`;
  };
  const ejecutar = crearEjecutorTransacciones(db, { reloj });
  const terceros = crearServicioTerceros(db, ejecutar);
  const productos = crearServicioProductos(db, ejecutar);
  const ventas = crearServicioVentas(db, ejecutar, { reloj });
  const negocio = crearServicioNegocio(db, ejecutar);
  const datos = {
    codigo: null,
    tipoPersona: 'natural' as const,
    tipoIdentificacion: 'CC' as const,
    celular: '3000000000',
    direccion: 'CL 1',
    barrio: 'CENTRO',
    ciudad: 'BARRANQUILLA',
    topeCredito: null,
  };
  const agrina = terceros.crear('proveedor', {
    ...datos,
    nombre: 'AGRINA S.A.S.',
    numeroIdentificacion: '900123456',
  }).codigo;
  const juan = terceros.crear('cliente', {
    ...datos,
    nombre: 'JUAN JJ FERTILIA',
    numeroIdentificacion: '212121354',
  }).codigo;
  productos.crear({
    codigo: 231,
    nombre: 'PAPA FRANCESA AGRINA PREMIUM *2.5 KG',
    proveedorCodigo: agrina,
    unidad: 'UND',
    costo: 11_800,
    precios: { mayor: 16_000, menor: 17_500, minimo: 12_300 },
  });
  const vender = (forma: number, unidades: number): { id: number; numero: number } =>
    ventas.guardar({
      ranura: null,
      clienteCodigo: CODIGO_CONSUMIDOR_FINAL,
      condicion: 'contado',
      plazoDias: 0,
      bodegaId: 1,
      lineas: [
        { productoCodigo: 231, escala: 'menor', cantidad: unidades * 1000, precioAlterado: null },
      ],
      contado: { formaPagoId: forma, recibido: null },
      cajasEmpaque: null,
    });
  return {
    db,
    el,
    cierres: crearServicioCierreCaja(db, ejecutar, { ahora: reloj }),
    reportes: crearServicioReportes(db, { negocio, ahora: reloj }),
    vender,
    abonos: crearServicioAbonos(db, ejecutar, { hoy: dia }),
    correcciones: crearServicioCorrecciones(db, ejecutar),
    compras: crearServicioCompras(db, ejecutar, { hoy: dia }),
    juan,
    agrina,
    ventas,
  };
}

/**
 * Petición de guardado con el contado por forma.
 *
 * @param huella - Huella del cálculo.
 * @param contado - Efectivo, Transferencia y Tarjeta.
 * @param baseQueda - Base que queda.
 * @param baseInicial - Base inicial (solo el primer cierre).
 * @returns Petición.
 */
function peticion(
  huella: string,
  contado: [number, number, number],
  baseQueda: number,
  baseInicial: number | null = null,
): PeticionGuardarCierre {
  return {
    huella,
    baseInicial,
    contado: [EFECTIVO, TRANSFERENCIA, TARJETA].map((formaPagoId, i) => ({
      formaPagoId,
      valor: contado[i] ?? 0,
    })),
    conteo: null,
    baseQueda,
    observacion: '',
  };
}

describe('cierre de caja (integración)', () => {
  it('cubre tramos encadenados, compensa, anula el último y lo vuelve a cubrir', () => {
    const e = escenario();

    // ---- Día 1: primer cierre ----
    e.el('2026-10-03', '09:00');
    e.vender(EFECTIVO, 2); // 35,000
    e.el('2026-10-03', '10:00');
    const credito = e.ventas.guardar({
      ranura: null,
      clienteCodigo: e.juan,
      condicion: 'credito',
      plazoDias: 8,
      bodegaId: 1,
      lineas: [{ productoCodigo: 231, escala: 'menor', cantidad: 4000, precioAlterado: null }],
      contado: null,
      cajasEmpaque: null,
    });
    e.el('2026-10-03', '11:00');
    const abonoDia1 = e.abonos.guardar({
      tipo: 'cliente',
      terceroCodigo: e.juan,
      fecha: '2026-10-03',
      formaPagoId: TRANSFERENCIA,
      valor: 20_000,
      observacion: '',
      aplicaciones: [{ facturaId: credito.id, valor: 20_000 }],
    });

    e.el('2026-10-03', '19:00');
    const primero = e.cierres.nuevo();
    expect(primero.numero).toBe(1);
    expect(primero.anterior).toBeNull();
    expect(primero.baseInicial).toBeNull();
    expect(valores(primero.calculo, 'ventas')).toEqual([35_000, 0, 0]);
    expect(valores(primero.calculo, 'abonosClientes')).toEqual([0, 20_000, 0]);
    expect(
      errorDe(() => e.cierres.guardar(peticion(primero.huella, [135_000, 20_000, 0], 100_000)))
        .message,
    ).toMatch(/Escriba la base inicial/);
    const c1 = e.cierres.guardar(peticion(primero.huella, [135_000, 20_000, 0], 100_000, 100_000));
    expect(c1.numero).toBe(1);
    expect(c1.arqueo.map((a) => a.esperado)).toEqual([135_000, 20_000, 0]);
    expect(c1.arqueo.map((a) => a.diferencia)).toEqual([0, 0, 0]);
    expect(c1.esUltimo).toBe(true);

    // ---- Día 2 ----
    e.el('2026-10-04', '08:00');
    e.abonos.anular({ id: abonoDia1.id, motivo: 'Transferencia rechazada' });
    e.el('2026-10-04', '09:00');
    e.vender(TARJETA, 1); // 17,500
    e.el('2026-10-04', '09:30');
    const anulada = e.vender(EFECTIVO, 2); // 35,000, se anula en el mismo tramo
    e.el('2026-10-04', '10:00');
    e.correcciones.anular({ tipo: 'cliente', facturaId: anulada.id, version: 1, motivo: '' });
    e.el('2026-10-04', '11:00');
    const conOtraFecha = e.abonos.guardar({
      tipo: 'cliente',
      terceroCodigo: e.juan,
      fecha: '2026-10-02',
      formaPagoId: EFECTIVO,
      valor: 30_000,
      observacion: '',
      aplicaciones: [{ facturaId: credito.id, valor: 30_000 }],
    });
    e.el('2026-10-04', '12:00');
    e.compras.guardar({
      proveedorCodigo: e.agrina,
      numeroProveedor: 'FE-1',
      fecha: '2026-10-04',
      plazoDias: 0,
      bodegaId: 1,
      ordenCompra: '',
      lineas: [{ productoCodigo: 231, cantidad: 2000, costoUnitario: 11_800 }],
      flete: 0,
      fleteProveedor: false,
      descuento: { modo: 'pesos', valor: 0 },
      descuentoEnCosto: false,
      contado: { formaPagoId: EFECTIVO },
    });

    e.el('2026-10-04', '19:00');
    const visto = e.cierres.nuevo();
    expect(visto.anterior).toEqual({ numero: 1, hasta: c1.hasta, baseQueda: 100_000 });
    expect(visto.baseInicial).toBe(100_000);
    expect(valores(visto.calculo, 'ventas')).toEqual([0, 0, 17_500]);
    expect(valores(visto.calculo, 'reintegrosEntrega')).toEqual([0, 0, 0]);
    expect(valores(visto.calculo, 'abonosClientes')).toEqual([30_000, 0, 0]);
    expect(valores(visto.calculo, 'abonosProveedores')).toEqual([23_600, 0, 0]);
    expect(valores(visto.calculo, 'anulacionesAnteriores')).toEqual([0, -20_000, 0]);
    expect(visto.calculo.movimiento).toEqual([6_400, -20_000, 17_500]);
    expect(visto.calculo.otraFecha.map((a) => a.documento)).toEqual([
      `Abono ${conOtraFecha.numero}`,
    ]);

    // Entra una venta antes de guardar: hay que revisar el arqueo.
    e.el('2026-10-04', '19:01');
    e.vender(TRANSFERENCIA, 1);
    e.el('2026-10-04', '19:02');
    const conflicto = errorDe(() =>
      e.cierres.guardar(peticion(visto.huella, [104_400, -20_000, 17_500], 80_000)),
    );
    expect(conflicto.codigo).toBe('CONFLICTO');
    const estado = e.cierres.nuevo();
    expect(estado.calculo.movimiento).toEqual([6_400, -2_500, 17_500]);
    expect(
      errorDe(() => e.cierres.guardar(peticion(estado.huella, [104_400, -2_500, 17_500], 104_401)))
        .message,
    ).toMatch(/no puede ser mayor que el efectivo contado/);
    const c2 = e.cierres.guardar({
      ...peticion(estado.huella, [104_400, -2_500, 17_500], 80_000),
      observacion: 'Faltante: cambio mal dado',
    });
    expect(c2.numero).toBe(2);
    expect(c2.desde).toBe(c1.hasta);
    expect(c2.arqueo.map((a) => a.diferencia)).toEqual([-2_000, 0, 0]);
    expect(c2.calculo.documentos.length).toBe(5);
    expect(c2.calculo.otraFecha).toHaveLength(1);
    expect(c2.esUltimo).toBe(true);
    expect(e.cierres.obtener(1).esUltimo).toBe(false);

    // Lo anulado después del cierre no cambia lo que contó.
    e.el('2026-10-05', '08:00');
    e.abonos.anular({ id: conOtraFecha.id, motivo: '' });
    expect(valores(e.cierres.obtener(2).calculo, 'abonosClientes')).toEqual([30_000, 0, 0]);
    expect(e.cierres.obtener(2).calculo.documentos.length).toBe(5);

    // Solo el último vigente se anula; su tramo lo cubre el siguiente.
    expect(errorDe(() => e.cierres.anular({ numero: 1, motivo: '' })).message).toMatch(
      /Solo se puede anular el último cierre \(el 2\)/,
    );
    const anulado2 = e.cierres.anular({ numero: 2, motivo: 'Se contó mal la tarjeta' });
    expect(anulado2.estado).toBe('anulado');
    expect(anulado2.esUltimo).toBe(false);
    expect(errorDe(() => e.cierres.anular({ numero: 2, motivo: '' })).message).toMatch(
      /ya está anulado/,
    );
    const tercero = e.cierres.nuevo();
    expect(tercero.numero).toBe(3);
    expect(tercero.anterior?.numero).toBe(1);
    expect(tercero.anuladosEntre).toEqual([2]);
    expect(tercero.baseInicial).toBe(100_000);
    // Desde el día 1: lo del día 2 más la anulación del abono de hoy (compensada en el mismo tramo).
    expect(valores(tercero.calculo, 'abonosClientes')).toEqual([0, 0, 0]);
    expect(tercero.calculo.movimiento).toEqual([-23_600, -2_500, 17_500]);
    expect(e.cierres.listar().map((c) => [c.numero, c.estado])).toEqual([
      [2, 'anulado'],
      [1, 'activo'],
    ]);

    // Historial: dos cierres creados y uno anulado.
    const historial = e.db
      .prepare(
        `SELECT accion, motivo FROM historial_cambios WHERE entidad = 'cierre_caja' ORDER BY id`,
      )
      .all();
    expect(historial).toEqual([
      { accion: 'crear', motivo: null },
      { accion: 'crear', motivo: null },
      { accion: 'anular', motivo: 'Se contó mal la tarjeta' },
    ]);

    // Impreso en hoja carta y nombre del PDF.
    const reporte = leerPeticionReporte({ reporte: 'cierre-caja', filtros: { numero: 2 } });
    const html = e.reportes.html(reporte);
    expect(html).toContain('CIERRE DE CAJA No. 2 (ANULADO)');
    expect(html).toContain('Faltan 2,000');
    expect(html).toContain('Anulaciones de días anteriores');
    expect(html).toContain('Se contó mal la tarjeta');
    expect(e.reportes.nombreArchivo(reporte, 'pdf')).toBe('Cierre de caja 2 2026-10-04.pdf');
    expect(() => e.reportes.excel(reporte)).toThrow(/no se exporta a Excel/);
  });

  it('el esquema impide borrar o editar un cierre y anular uno que no es el último', () => {
    const e = escenario();
    e.el('2026-10-03', '19:00');
    const a = e.cierres.nuevo();
    e.cierres.guardar(peticion(a.huella, [50_000, 0, 0], 50_000, 50_000));
    e.el('2026-10-04', '19:00');
    const b = e.cierres.nuevo();
    e.cierres.guardar(peticion(b.huella, [50_000, 0, 0], 50_000));
    expect(() => e.db.prepare('DELETE FROM cierres_caja WHERE numero = 1').run()).toThrow(
      /no se pueden borrar/,
    );
    expect(() =>
      e.db.prepare('UPDATE cierres_caja SET base_queda = 1 WHERE numero = 1').run(),
    ).toThrow(/solo se puede anular/);
    expect(() =>
      e.db
        .prepare(
          `UPDATE cierres_caja SET estado = 'anulado', anulado_en = '2026-10-05T08:00:00.000-05:00' WHERE numero = 1`,
        )
        .run(),
    ).toThrow(/último cierre de caja vigente/);
    expect(() => e.db.prepare('UPDATE cierres_caja_formas SET contado = 0').run()).toThrow(
      /no se pueden modificar/,
    );
  });

  it('valida la petición que llega por IPC', () => {
    expect(() => leerPeticionGuardarCierre({ huella: 'x' })).toThrow(ErrorDeNegocio);
    expect(
      leerPeticionGuardarCierre({
        huella: 'x',
        baseInicial: null,
        contado: [{ formaPagoId: 1, valor: 10 }],
        conteo: [{ tipo: 'moneda', valor: 50, cantidad: 2 }],
        baseQueda: 0,
        observacion: '',
      }).conteo,
    ).toEqual([{ tipo: 'moneda', valor: 50, cantidad: 2 }]);
  });
});
