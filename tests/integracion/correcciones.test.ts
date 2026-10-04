import { describe, expect, it } from 'vitest';
import { ErrorDeNegocio } from '../../src/domain/errores';
import type { BaseDeDatos } from '../../src/data/conexion';
import { idFormaSaldoFavor } from '../../src/data/repositorios/catalogos.repo';
import { leerCartera } from '../../src/data/repositorios/correcciones.repo';
import { stockEnBodega } from '../../src/data/repositorios/kardex.repo';
import { saldoFavorDe } from '../../src/data/repositorios/saldosFavor.repo';
import { crearEjecutorTransacciones } from '../../src/data/transaccion';
import { crearServicioAbonos } from '../../src/main/servicios/abonos';
import { crearServicioAjustes } from '../../src/main/servicios/ajustes';
import { crearServicioCompras } from '../../src/main/servicios/compras';
import { crearServicioCorrecciones } from '../../src/main/servicios/correcciones';
import { crearServicioDevoluciones } from '../../src/main/servicios/devoluciones';
import { crearServicioProductos } from '../../src/main/servicios/productos';
import { crearServicioSaldoFavor } from '../../src/main/servicios/saldoFavor';
import { crearServicioTerceros } from '../../src/main/servicios/terceros';
import { crearServicioVentas } from '../../src/main/servicios/ventas';
import type { TipoAbono } from '../../src/shared/abonos';
import type { PeticionGuardarCompra } from '../../src/shared/compras';
import type { DatosTerceroNuevo } from '../../src/shared/maestros';
import type { PeticionGuardarFactura } from '../../src/shared/ventas';
import { baseDeDatosDePrueba } from './ayudas';

/** Día de hoy en todas las pruebas. */
const HOY = '2026-10-04';

/** Producto de las pruebas. */
const PAPA = 231;

/** Forma de pago «Efectivo» (sembrada por la migración inicial). */
const EFECTIVO = 1;

/**
 * Datos de un tercero de prueba, sin tope de crédito.
 *
 * @param numero - Número de identificación.
 * @param nombre - Nombre.
 * @returns Datos completos.
 */
function tercero(numero: string, nombre: string): DatosTerceroNuevo {
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
    topeCredito: null,
  };
}

/**
 * Base con un proveedor, un cliente, la papa (costo 12,000; menor 17,500) y
 * todos los servicios con el día fijo en {@link HOY}.
 *
 * @returns Conexión, servicios y códigos.
 */
function crear(): {
  db: BaseDeDatos;
  ventas: ReturnType<typeof crearServicioVentas>;
  compras: ReturnType<typeof crearServicioCompras>;
  abonos: ReturnType<typeof crearServicioAbonos>;
  ajustes: ReturnType<typeof crearServicioAjustes>;
  correcciones: ReturnType<typeof crearServicioCorrecciones>;
  devoluciones: ReturnType<typeof crearServicioDevoluciones>;
  saldoFavor: ReturnType<typeof crearServicioSaldoFavor>;
  cliente: number;
  proveedor: number;
} {
  const reloj = (): string => `${HOY}T10:00:00.000-05:00`;
  const hoy = (): string => HOY;
  const db = baseDeDatosDePrueba();
  const ejecutar = crearEjecutorTransacciones(db, { reloj });
  const terceros = crearServicioTerceros(db, ejecutar);
  const proveedor = terceros.crear('proveedor', tercero('900', 'AGRINA')).codigo;
  crearServicioProductos(db, ejecutar).crear({
    codigo: PAPA,
    nombre: 'PAPA FRANCESA AGRINA PREMIUM *2.5 KG',
    proveedorCodigo: proveedor,
    unidad: 'UND',
    costo: 12_000,
    precios: { mayor: 16_000, menor: 17_500, minimo: 14_000 },
  });
  const cliente = terceros.crear('cliente', tercero('212121354', 'JUAN JJ FERTILIA')).codigo;
  return {
    db,
    ventas: crearServicioVentas(db, ejecutar, { reloj }),
    compras: crearServicioCompras(db, ejecutar, { hoy }),
    abonos: crearServicioAbonos(db, ejecutar, { hoy }),
    ajustes: crearServicioAjustes(db, ejecutar),
    correcciones: crearServicioCorrecciones(db, ejecutar),
    devoluciones: crearServicioDevoluciones(db, ejecutar),
    saldoFavor: crearServicioSaldoFavor(db, ejecutar),
    cliente,
    proveedor,
  };
}

/**
 * Venta de `unidades` papas a la escala menor ($ 17,500).
 *
 * @param cliente - Cliente.
 * @param unidades - Unidades.
 * @param contado - Si es de contado (en efectivo).
 * @returns Petición completa.
 */
function venta(cliente: number, unidades: number, contado = false): PeticionGuardarFactura {
  return {
    ranura: null,
    clienteCodigo: cliente,
    condicion: contado ? 'contado' : 'credito',
    plazoDias: contado ? 0 : 8,
    bodegaId: 1,
    lineas: [
      { productoCodigo: PAPA, escala: 'menor', cantidad: unidades * 1000, precioAlterado: null },
    ],
    contado: contado ? { formaPagoId: EFECTIVO, recibido: null } : null,
    cajasEmpaque: null,
  };
}

/**
 * Compra de `unidades` papas a un costo, sin flete ni descuento.
 *
 * @param proveedor - Proveedor.
 * @param numero - Número de la factura del proveedor.
 * @param unidades - Unidades.
 * @param costo - Costo unitario.
 * @param contado - Si es «Pagada de contado».
 * @returns Petición completa.
 */
function compra(
  proveedor: number,
  numero: string,
  unidades: number,
  costo: number,
  contado = false,
): PeticionGuardarCompra {
  return {
    proveedorCodigo: proveedor,
    numeroProveedor: numero,
    fecha: HOY,
    plazoDias: 30,
    bodegaId: 1,
    ordenCompra: '',
    lineas: [{ productoCodigo: PAPA, cantidad: unidades * 1000, costoUnitario: costo }],
    flete: 0,
    fleteProveedor: false,
    descuento: { modo: 'pesos', valor: 0 },
    descuentoEnCosto: false,
    contado: contado ? { formaPagoId: EFECTIVO } : null,
  };
}

/**
 * Lo esperado después de un paso de una secuencia.
 */
interface Esperado {
  /** Unidades de papa en la bodega 1 (suma del kardex). */
  stock: number;
  /** Saldo de cada factura, por id. */
  saldos: Record<number, number>;
  /** Saldo a favor disponible del tercero. */
  disponible: number;
}

/**
 * Verifica que todo cuadre después de un paso:
 * - el stock es la suma del kardex esperada;
 * - el saldo de cada factura (D-127) es el esperado y ninguno es negativo;
 * - el saldo a favor disponible es el esperado y no es negativo;
 * - la identidad de cartera del tercero: Σ saldos de sus facturas activas con
 *   cartera − disponible = Σ (total − devuelto) de esas facturas − Σ abonos
 *   activos en dinero + Σ reintegros activos de saldo a favor.
 *
 * @param db - Conexión.
 * @param tipo - Cliente o proveedor.
 * @param codigo - Código del tercero.
 * @param esperado - Stock, saldos y disponible esperados.
 */
function cuadra(db: BaseDeDatos, tipo: TipoAbono, codigo: number, esperado: Esperado): void {
  expect(stockEnBodega(db, PAPA, 1)).toBe(esperado.stock * 1000);
  const tabla = tipo === 'cliente' ? 'facturas_cliente' : 'facturas_proveedor';
  const columna = tipo === 'cliente' ? 'cliente_codigo' : 'proveedor_codigo';
  const filtroCartera = tipo === 'cliente' ? "AND condicion = 'credito'" : '';
  const facturas = db
    .prepare(`SELECT id, estado FROM ${tabla} WHERE ${columna} = ? ${filtroCartera}`)
    .all(codigo) as { id: number; estado: string }[];
  let sumaSaldos = 0;
  let sumaNeto = 0;
  for (const f of facturas) {
    const c = leerCartera(db, tipo, f.id);
    const saldo = f.estado === 'activa' ? c.total - c.aplicado - c.devuelto + c.trasladado : 0;
    expect(saldo, `saldo de la factura ${f.id}`).toBeGreaterThanOrEqual(0);
    const saldoEsperado = esperado.saldos[f.id];
    if (saldoEsperado !== undefined) {
      expect(saldo, `saldo de la factura ${f.id}`).toBe(saldoEsperado);
    }
    if (f.estado === 'activa') {
      sumaSaldos += saldo;
      sumaNeto += c.total - c.devuelto;
    }
  }
  const disponible = saldoFavorDe(db, tipo, codigo);
  expect(disponible, 'saldo a favor').toBe(esperado.disponible);
  expect(disponible).toBeGreaterThanOrEqual(0);
  const abonosDinero = (
    db
      .prepare(
        `SELECT COALESCE(SUM(valor), 0) AS v FROM abonos
         WHERE tipo = ? AND ${columna} = ? AND estado = 'activo' AND forma_pago_id <> ?`,
      )
      .get(tipo, codigo, idFormaSaldoFavor(db)) as { v: number }
  ).v;
  const reintegros = (
    db
      .prepare(
        `SELECT COALESCE(SUM(valor), 0) AS v FROM reintegros
         WHERE tipo = ? AND ${columna} = ? AND estado = 'activo' AND origen = 'saldo_favor'`,
      )
      .get(tipo, codigo) as { v: number }
  ).v;
  expect(sumaSaldos - disponible, 'identidad de cartera').toBe(
    sumaNeto - abonosDinero + reintegros,
  );
}

/**
 * Ejecuta una operación que debe fallar y devuelve el error de negocio.
 *
 * @param operacion - Operación.
 * @returns El error lanzado.
 */
function fallo(operacion: () => unknown): ErrorDeNegocio {
  try {
    operacion();
  } catch (error) {
    if (error instanceof ErrorDeNegocio) {
      return error;
    }
    throw error;
  }
  throw new Error('La operación debía fallar.');
}

describe('secuencias de cliente: todo cuadra tras cada paso', () => {
  it('venta, abono, corrección, saldo a favor, devolución, anulaciones', () => {
    const s = crear();
    const { db, cliente } = s;
    const paso = (esperado: Esperado): void => cuadra(db, 'cliente', cliente, esperado);
    s.compras.guardar(compra(s.proveedor, 'FV-1', 100, 12_000));

    const f1 = s.ventas.guardar(venta(cliente, 10)).id;
    paso({ stock: 90, saldos: { [f1]: 175_000 }, disponible: 0 });

    const a1 = s.abonos.guardar({
      tipo: 'cliente',
      terceroCodigo: cliente,
      fecha: HOY,
      formaPagoId: EFECTIVO,
      valor: 100_000,
      observacion: '',
      aplicaciones: [{ facturaId: f1, valor: 100_000 }],
    }).id;
    paso({ stock: 90, saldos: { [f1]: 75_000 }, disponible: 0 });

    const corregida = s.correcciones.corregirVenta({
      facturaId: f1,
      version: 1,
      cambios: [{ renglon: 1, cantidad: 4000, precio: 17_500 }],
      motivo: 'Devolvió 6 en la entrega',
    });
    expect(corregida).toMatchObject({
      version: 2,
      total: 70_000,
      saldo: 0,
      movimientoFavor: 30_000,
    });
    paso({ stock: 96, saldos: { [f1]: 0 }, disponible: 30_000 });

    const f2 = s.ventas.guardar(venta(cliente, 2)).id;
    const formaFavor = s.abonos.contexto('cliente').formaSaldoFavor.id;
    const a2 = s.abonos.guardar({
      tipo: 'cliente',
      terceroCodigo: cliente,
      fecha: HOY,
      formaPagoId: formaFavor,
      valor: 20_000,
      observacion: '',
      aplicaciones: [{ facturaId: f2, valor: 20_000 }],
    }).id;
    paso({ stock: 94, saldos: { [f1]: 0, [f2]: 15_000 }, disponible: 10_000 });

    const d1 = s.devoluciones.guardar({
      tipo: 'venta',
      facturaId: f1,
      version: 2,
      devolucionesConocidas: 0,
      bodegaId: 1,
      lineas: [{ renglon: 1, cantidad: 1000 }],
      motivo: '',
    });
    expect(d1).toMatchObject({ numero: 1, total: 17_500, saldo: 0, movimientoFavor: 17_500 });
    paso({ stock: 95, saldos: { [f1]: 0, [f2]: 15_000 }, disponible: 27_500 });

    // Con una devolución activa no se corrige ni se anula, y el mensaje dice qué hacer.
    const bloqueo = fallo(() =>
      s.correcciones.corregirVenta({
        facturaId: f1,
        version: 2,
        cambios: [{ renglon: 1, cantidad: 3000, precio: 17_500 }],
        motivo: '',
      }),
    );
    expect(bloqueo.message).toContain('tiene devoluciones activas (1)');
    expect(bloqueo.message).toContain('Anúlelas en Devolución de venta');

    // Anular el abono de efectivo: F1 recupera lo trasladado que sigue disponible (27,500);
    // los 20,000 que el cliente ya usó en F2 quedan como saldo de F1.
    s.abonos.anular({ id: a1, motivo: 'Cheque devuelto' });
    paso({ stock: 95, saldos: { [f1]: 72_500, [f2]: 15_000 }, disponible: 0 });

    const anuladaD1 = s.devoluciones.anular({ id: d1.id, motivo: '' });
    expect(anuladaD1).toMatchObject({ saldo: 90_000, movimientoFavor: 0 });
    paso({ stock: 94, saldos: { [f1]: 90_000, [f2]: 15_000 }, disponible: 0 });

    // Anular el abono pagado con saldo a favor devuelve ese saldo al cliente.
    s.abonos.anular({ id: a2, motivo: '' });
    paso({ stock: 94, saldos: { [f1]: 90_000, [f2]: 35_000 }, disponible: 20_000 });

    const anulacionF1 = s.correcciones.anular({
      tipo: 'cliente',
      facturaId: f1,
      version: 2,
      motivo: '',
    });
    expect(anulacionF1.movimientoFavor).toBe(-20_000);
    paso({ stock: 98, saldos: { [f1]: 0, [f2]: 35_000 }, disponible: 0 });

    s.correcciones.anular({ tipo: 'cliente', facturaId: f2, version: 1, motivo: '' });
    paso({ stock: 100, saldos: { [f1]: 0, [f2]: 0 }, disponible: 0 });
  });

  it('una venta de contado arregla cada diferencia con un reintegro', () => {
    const s = crear();
    const { db, cliente } = s;
    const paso = (stock: number): void =>
      cuadra(db, 'cliente', cliente, { stock, saldos: {}, disponible: 0 });
    const f = s.ventas.guardar(venta(cliente, 3, true)).id;
    paso(-3);

    const menos = s.correcciones.corregirVenta({
      facturaId: f,
      version: 1,
      cambios: [{ renglon: 1, cantidad: 2000, precio: 17_500 }],
      motivo: '',
    });
    expect(menos.reintegro).toMatchObject({
      numero: 1,
      sentido: 'entrega',
      valor: 17_500,
      formaPagoNombre: 'Efectivo',
    });
    paso(-2);

    const mas = s.correcciones.corregirVenta({
      facturaId: f,
      version: 2,
      cambios: [{ renglon: 1, cantidad: 2000, precio: 18_000 }],
      motivo: '',
    });
    expect(mas.reintegro).toMatchObject({ sentido: 'recibe', valor: 1000 });
    paso(-2);

    const devolucion = s.devoluciones.guardar({
      tipo: 'venta',
      facturaId: f,
      version: 3,
      devolucionesConocidas: 0,
      bodegaId: 1,
      lineas: [{ renglon: 1, cantidad: 1000 }],
      motivo: '',
    });
    expect(devolucion.reintegro).toMatchObject({ sentido: 'entrega', valor: 18_000 });
    paso(-1);

    const anulada = s.devoluciones.anular({ id: devolucion.id, motivo: '' });
    expect(anulada.reintegro).toMatchObject({ sentido: 'recibe', valor: 18_000 });
    paso(-2);

    const anulacion = s.correcciones.anular({
      tipo: 'cliente',
      facturaId: f,
      version: 3,
      motivo: '',
    });
    expect(anulacion.reintegro).toMatchObject({ sentido: 'entrega', valor: 36_000 });
    paso(0);

    const { reintegros } = s.saldoFavor.consultar({ tipo: 'cliente', codigo: cliente });
    expect(reintegros.map((r) => [r.sentido, r.valor, r.origen])).toEqual([
      ['entrega', 36_000, 'documento'],
      ['recibe', 18_000, 'documento'],
      ['entrega', 18_000, 'documento'],
      ['recibe', 1000, 'documento'],
      ['entrega', 17_500, 'documento'],
    ]);
    const atado = fallo(() =>
      s.saldoFavor.anularReintegro({ id: reintegros[0]?.id ?? 0, motivo: '' }),
    );
    expect(atado.message).toContain('no se anula por separado');
  });
});

describe('secuencias de proveedor: todo cuadra tras cada paso', () => {
  it('compra, abono, corrección de contado, devolución, reintegro y anulaciones', () => {
    const s = crear();
    const { db, proveedor } = s;
    const paso = (esperado: Esperado): void => cuadra(db, 'proveedor', proveedor, esperado);
    const c1 = s.compras.guardar(compra(proveedor, 'FV-1', 50, 12_000)).id;
    const c2 = s.compras.guardar(compra(proveedor, 'FV-2', 10, 13_000, true)).id;
    paso({ stock: 60, saldos: { [c1]: 600_000, [c2]: 0 }, disponible: 0 });

    const p1 = s.abonos.guardar({
      tipo: 'proveedor',
      terceroCodigo: proveedor,
      fecha: HOY,
      formaPagoId: EFECTIVO,
      valor: 200_000,
      observacion: '',
      aplicaciones: [{ facturaId: c1, valor: 200_000 }],
    }).id;
    paso({ stock: 60, saldos: { [c1]: 400_000, [c2]: 0 }, disponible: 0 });

    const corregida = s.correcciones.corregirCompra({
      facturaId: c2,
      version: 1,
      cambios: [{ renglon: 1, cantidad: 8000, costoUnitario: 13_000 }],
      flete: 0,
      descuento: { modo: 'pesos', valor: 0 },
      motivo: '',
    });
    expect(corregida).toMatchObject({ total: 104_000, saldo: 0, movimientoFavor: 26_000 });
    paso({ stock: 58, saldos: { [c1]: 400_000, [c2]: 0 }, disponible: 26_000 });

    const d1 = s.devoluciones.guardar({
      tipo: 'compra',
      facturaId: c1,
      version: 1,
      devolucionesConocidas: 0,
      bodegaId: 1,
      lineas: [{ renglon: 1, cantidad: 5000 }],
      motivo: 'Vencidas',
    });
    expect(d1).toMatchObject({ total: 60_000, saldo: 340_000, movimientoFavor: 0 });
    paso({ stock: 53, saldos: { [c1]: 340_000, [c2]: 0 }, disponible: 26_000 });

    const reintegro = s.saldoFavor.reintegrar({
      tipo: 'proveedor',
      terceroCodigo: proveedor,
      formaPagoId: EFECTIVO,
      valor: 6000,
      observacion: '',
      disponibleEsperado: 26_000,
    });
    expect(reintegro).toMatchObject({ sentido: 'recibe', valor: 6000 });
    paso({ stock: 53, saldos: { [c1]: 340_000, [c2]: 0 }, disponible: 20_000 });

    // Anular C2 tendría que recuperar 26,000 del saldo a favor, pero ya se usaron 6,000.
    const bloqueo = fallo(() =>
      s.correcciones.anular({ tipo: 'proveedor', facturaId: c2, version: 2, motivo: '' }),
    );
    expect(bloqueo.message).toContain('Anule primero el abono o el reintegro que lo usó');
    paso({ stock: 53, saldos: { [c1]: 340_000, [c2]: 0 }, disponible: 20_000 });

    s.saldoFavor.anularReintegro({ id: reintegro.id, motivo: '' });
    paso({ stock: 53, saldos: { [c1]: 340_000, [c2]: 0 }, disponible: 26_000 });

    const anulacionC2 = s.correcciones.anular({
      tipo: 'proveedor',
      facturaId: c2,
      version: 2,
      motivo: '',
    });
    expect(anulacionC2).toMatchObject({
      movimientoFavor: -26_000,
      abonoContadoAnulado: 1,
      costos: [{ productoCodigo: PAPA, anterior: 13_000, nuevo: 12_000 }],
    });
    expect(
      (db.prepare('SELECT costo FROM productos WHERE codigo = ?').get(PAPA) as { costo: number })
        .costo,
    ).toBe(12_000);
    paso({ stock: 45, saldos: { [c1]: 340_000, [c2]: 0 }, disponible: 0 });

    s.devoluciones.anular({ id: d1.id, motivo: '' });
    paso({ stock: 50, saldos: { [c1]: 400_000 }, disponible: 0 });

    s.abonos.anular({ id: p1, motivo: '' });
    paso({ stock: 50, saldos: { [c1]: 600_000 }, disponible: 0 });

    s.correcciones.anular({ tipo: 'proveedor', facturaId: c1, version: 1, motivo: '' });
    paso({ stock: 0, saldos: { [c1]: 0 }, disponible: 0 });
  });

  it('busca compras por número interno o del proveedor y avisa si hay varias', () => {
    const s = crear();
    const otro = crearServicioTerceros(s.db, crearEjecutorTransacciones(s.db)).crear(
      'proveedor',
      tercero('901', 'CÁRNICOS'),
    ).codigo;
    s.compras.guardar(compra(s.proveedor, 'FV-7', 1, 12_000));
    s.compras.guardar(compra(otro, 'fv -7', 1, 12_000));
    expect(s.correcciones.buscarCompra('2').numero).toBe(2);
    const varias = fallo(() => s.correcciones.buscarCompra('FV-7'));
    expect(varias.message).toContain('compra 2 (CÁRNICOS), compra 1 (AGRINA)');
    expect(varias.message).toContain('Escriba la «Compra No.»');
    expect(fallo(() => s.correcciones.buscarCompra('X-1')).codigo).toBe('NO_ENCONTRADO');
  });
});

describe('doble pulsación: la segunda vez no guarda nada', () => {
  it('corrección, devolución, anulaciones, reintegro y ajuste', () => {
    const s = crear();
    const { db, cliente } = s;
    s.compras.guardar(compra(s.proveedor, 'FV-1', 20, 12_000));
    const f = s.ventas.guardar(venta(cliente, 4)).id;
    const contarVersiones = (): number =>
      (
        db
          .prepare('SELECT COUNT(*) AS n FROM facturas_cliente_versiones WHERE factura_id = ?')
          .get(f) as { n: number }
      ).n;

    const corregir = (): unknown =>
      s.correcciones.corregirVenta({
        facturaId: f,
        version: 1,
        cambios: [{ renglon: 1, cantidad: 3000, precio: 17_500 }],
        motivo: '',
      });
    corregir();
    const segunda = fallo(corregir);
    expect(segunda.codigo).toBe('CONFLICTO');
    expect(segunda.message).toContain('puede que la corrección ya se haya guardado');
    expect(contarVersiones()).toBe(2);
    cuadra(db, 'cliente', cliente, { stock: 17, saldos: { [f]: 52_500 }, disponible: 0 });

    const devolver = (): { id: number } =>
      s.devoluciones.guardar({
        tipo: 'venta',
        facturaId: f,
        version: 2,
        devolucionesConocidas: 0,
        bodegaId: 1,
        lineas: [{ renglon: 1, cantidad: 1000 }],
        motivo: '',
      });
    const d = devolver();
    expect(fallo(devolver).message).toContain('puede que esta devolución ya se haya guardado');
    cuadra(db, 'cliente', cliente, { stock: 18, saldos: { [f]: 35_000 }, disponible: 0 });

    s.devoluciones.anular({ id: d.id, motivo: '' });
    expect(fallo(() => s.devoluciones.anular({ id: d.id, motivo: '' })).codigo).toBe('CONFLICTO');
    cuadra(db, 'cliente', cliente, { stock: 17, saldos: { [f]: 52_500 }, disponible: 0 });

    const anular = (): unknown =>
      s.correcciones.anular({ tipo: 'cliente', facturaId: f, version: 2, motivo: '' });
    anular();
    expect(fallo(anular).message).toContain('ya está anulada');
    cuadra(db, 'cliente', cliente, { stock: 20, saldos: { [f]: 0 }, disponible: 0 });

    // Reintegro: la segunda pulsación ve un saldo a favor distinto del que se mostró.
    const f2 = s.ventas.guardar(venta(cliente, 1)).id;
    s.abonos.guardar({
      tipo: 'cliente',
      terceroCodigo: cliente,
      fecha: HOY,
      formaPagoId: EFECTIVO,
      valor: 17_500,
      observacion: '',
      aplicaciones: [{ facturaId: f2, valor: 17_500 }],
    });
    s.correcciones.anular({ tipo: 'cliente', facturaId: f2, version: 1, motivo: '' });
    const reintegrar = (): unknown =>
      s.saldoFavor.reintegrar({
        tipo: 'cliente',
        terceroCodigo: cliente,
        formaPagoId: EFECTIVO,
        valor: 17_500,
        observacion: '',
        disponibleEsperado: 17_500,
      });
    reintegrar();
    expect(fallo(reintegrar).message).toContain('puede que el reintegro ya se haya guardado');
    cuadra(db, 'cliente', cliente, { stock: 20, saldos: {}, disponible: 0 });

    const ajuste = s.ajustes.registrar({
      productoCodigo: PAPA,
      bodegaId: 1,
      tipo: 'dano',
      cantidad: 2000,
      motivo: 'Dañadas',
    });
    expect(s.ajustes.anular({ id: ajuste.id, motivo: '' }).estado).toBe('anulado');
    expect(fallo(() => s.ajustes.anular({ id: ajuste.id, motivo: '' })).message).toContain(
      'ya está anulado',
    );
    expect(stockEnBodega(db, PAPA, 1)).toBe(20_000);
  });
});
