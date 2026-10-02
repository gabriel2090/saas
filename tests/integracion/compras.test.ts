import { describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../../src/data/conexion';
import { listarHistorial } from '../../src/data/repositorios/historial.repo';
import { crearEjecutorTransacciones } from '../../src/data/transaccion';
import { crearServicioAbonos } from '../../src/main/servicios/abonos';
import { crearServicioAjustes } from '../../src/main/servicios/ajustes';
import { crearServicioCompras } from '../../src/main/servicios/compras';
import { crearServicioProductos } from '../../src/main/servicios/productos';
import { crearServicioTerceros } from '../../src/main/servicios/terceros';
import type { PeticionGuardarCompra } from '../../src/shared/compras';
import type { DatosTerceroNuevo } from '../../src/shared/maestros';
import { baseDeDatosDePrueba } from './ayudas';

/** Día de hoy en las pruebas. */
const HOY = '2026-10-02';

/**
 * Datos de un proveedor de prueba.
 *
 * @param numero - Número de identificación (único por proveedor).
 * @param nombre - Nombre.
 * @returns Datos completos.
 */
function proveedor(numero: string, nombre: string): DatosTerceroNuevo {
  return {
    codigo: null,
    tipoPersona: 'juridica',
    nombre,
    tipoIdentificacion: 'NIT',
    numeroIdentificacion: numero,
    celular: '3001234567',
    direccion: 'Calle 1 # 2-3',
    barrio: '',
    ciudad: '',
    topeCredito: null,
  };
}

/**
 * Base con dos proveedores, tres productos y los servicios de la Fase 2.
 *
 * @returns Conexión, códigos y servicios.
 */
function crear(): {
  db: BaseDeDatos;
  compras: ReturnType<typeof crearServicioCompras>;
  abonos: ReturnType<typeof crearServicioAbonos>;
  ajustes: ReturnType<typeof crearServicioAjustes>;
  productos: ReturnType<typeof crearServicioProductos>;
  prov: number;
  otro: number;
} {
  const db = baseDeDatosDePrueba();
  const ejecutar = crearEjecutorTransacciones(db);
  const terceros = crearServicioTerceros(db, ejecutar);
  const productos = crearServicioProductos(db, ejecutar);
  const prov = terceros.crear('proveedor', proveedor('900000001', 'CÁRNICOS DEL VALLE')).codigo;
  const otro = terceros.crear('proveedor', proveedor('900000002', 'AGRINA')).codigo;
  productos.crear({
    codigo: 103,
    nombre: 'CHORIZO',
    proveedorCodigo: prov,
    unidad: 'UND',
    costo: 7800,
    precios: { mayor: 10_000, menor: 11_000, minimo: 9000 },
  });
  productos.crear({
    codigo: 104,
    nombre: 'JAMÓN',
    proveedorCodigo: prov,
    unidad: 'KG',
    costo: 18_500,
    precios: { mayor: 24_000, menor: 25_000, minimo: 23_000 },
  });
  productos.crear({
    codigo: 101,
    nombre: 'CAJA PIZZA',
    proveedorCodigo: otro,
    unidad: 'UND',
    costo: 1500,
    precios: { mayor: 2000, menor: 2200, minimo: 1800 },
  });
  return {
    db,
    compras: crearServicioCompras(db, ejecutar, { hoy: () => HOY }),
    abonos: crearServicioAbonos(db, ejecutar, { hoy: () => HOY }),
    ajustes: crearServicioAjustes(db, ejecutar),
    productos,
    prov,
    otro,
  };
}

/**
 * Compra de prueba del proveedor principal.
 *
 * @param proveedorCodigo - Proveedor.
 * @param cambios - Campos a reemplazar.
 * @returns Petición completa.
 */
function compra(
  proveedorCodigo: number,
  cambios: Partial<PeticionGuardarCompra> = {},
): PeticionGuardarCompra {
  return {
    proveedorCodigo,
    numeroProveedor: 'FV-100',
    fecha: '2026-09-01',
    plazoDias: 30,
    bodegaId: 1,
    ordenCompra: '',
    lineas: [
      { productoCodigo: 103, cantidad: 24_000, costoUnitario: 7900 },
      { productoCodigo: 104, cantidad: 15_500, costoUnitario: 18_900 },
      { productoCodigo: 101, cantidad: 100_000, costoUnitario: 1450 },
    ],
    flete: 20_000,
    fleteProveedor: false,
    descuento: { modo: 'pesos', valor: 0 },
    descuentoEnCosto: false,
    contado: null,
    ...cambios,
  };
}

/**
 * Cuenta las filas de una tabla.
 *
 * @param db - Conexión.
 * @param tabla - Tabla.
 * @returns Cantidad de filas.
 */
function contar(db: BaseDeDatos, tabla: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get() as { n: number }).n;
}

describe('factura de proveedor', () => {
  it('guarda la compra, el kardex, el costo nuevo y la cuenta por pagar en una transacción', () => {
    const { db, compras, productos, prov } = crear();
    expect(compras.contexto()).toEqual({ siguienteNumero: 1, hoy: HOY });
    const guardada = compras.guardar(compra(prov, { ordenCompra: ' OC 7 ' }));
    // 189,600 + 292,950 + 145,000
    expect(guardada).toMatchObject({ numero: 1, total: 627_550, abonoNumero: null });

    const factura = db
      .prepare('SELECT vence, subtotal, flete, total, orden_compra AS oc FROM facturas_proveedor')
      .get();
    expect(factura).toEqual({
      vence: '2026-10-01',
      subtotal: 627_550,
      flete: 20_000,
      total: 627_550,
      oc: 'OC 7',
    });
    expect(contar(db, 'facturas_proveedor_lineas')).toBe(3);
    expect(contar(db, 'facturas_proveedor_versiones')).toBe(1);

    const kardex = db
      .prepare(
        `SELECT producto_codigo AS p, tipo, cantidad, costo_unitario AS costo, documento_id AS doc
         FROM movimientos_inventario ORDER BY id`,
      )
      .all();
    expect(kardex).toEqual([
      { p: 103, tipo: 'compra', cantidad: 24_000, costo: 8152, doc: '1' },
      { p: 104, tipo: 'compra', cantidad: 15_500, costo: 19_502, doc: '1' },
      { p: 101, tipo: 'compra', cantidad: 100_000, costo: 1496, doc: '1' },
    ]);
    expect(productos.obtener(103).costo).toBe(8152);
    expect(productos.obtener(104).stockTotal).toBe(15_500);

    expect(compras.contextoProveedor(prov)).toEqual({
      deuda: { total: 627_550, vencido: 627_550 },
      ultimoPlazo: 30,
    });
    expect(compras.contexto().siguienteNumero).toBe(2);

    const historial = listarHistorial(db, {});
    expect(historial.some((h) => h.entidad === 'factura_proveedor' && h.accion === 'crear')).toBe(
      true,
    );
    const costo = historial.find((h) => h.entidad === 'producto' && h.entidadId === '103');
    expect(costo?.motivo).toBe('Compra 1');
  });

  it('no actualiza el costo ni deja historial si no cambia', () => {
    const { db, compras, prov } = crear();
    compras.guardar(
      compra(prov, {
        lineas: [{ productoCodigo: 103, cantidad: 1000, costoUnitario: 7800 }],
        flete: 0,
      }),
    );
    expect(
      listarHistorial(db, {}).filter((h) => h.entidad === 'producto' && h.accion === 'editar'),
    ).toEqual([]);
  });

  it('bloquea el número repetido del mismo proveedor, sin importar espacios ni mayúsculas (D-49)', () => {
    const { compras, prov, otro } = crear();
    compras.guardar(compra(prov));
    expect(() => compras.guardar(compra(prov, { numeroProveedor: 'fv - 100' }))).toThrow(
      /ya tiene registrada la factura fv - 100 \(compra 1\)/,
    );
    // Otro proveedor sí puede usar el mismo número.
    expect(compras.guardar(compra(otro)).numero).toBe(2);
  });

  it('no deja nada guardado si algo falla y no gasta el consecutivo', () => {
    const { db, compras, prov } = crear();
    expect(() =>
      compras.guardar(
        compra(prov, { lineas: [{ productoCodigo: 999, cantidad: 1000, costoUnitario: 1 }] }),
      ),
    ).toThrow(/no existe el producto con código 999/);
    expect(() => compras.guardar(compra(prov, { fecha: '2026-10-03' }))).toThrow(/posterior a hoy/);
    expect(() => compras.guardar(compra(prov, { bodegaId: 99 }))).toThrow(/bodega/);
    expect(() => compras.guardar(compra(prov, { numeroProveedor: '  ' }))).toThrow(/número/);
    expect(() =>
      compras.guardar(compra(prov, { descuento: { modo: 'pesos', valor: 10_000_000 } })),
    ).toThrow(/subtotal/);
    expect(contar(db, 'facturas_proveedor')).toBe(0);
    expect(contar(db, 'movimientos_inventario')).toBe(0);
    expect(compras.contexto().siguienteNumero).toBe(1);
  });

  it('no compra productos inactivos (D-56)', () => {
    const { compras, productos, prov } = crear();
    productos.cambiarEstado(103, false);
    expect(() => compras.guardar(compra(prov))).toThrow(/inactivo/);
  });

  it('pagada de contado crea el abono automático por el total (D-48)', () => {
    const { db, compras, abonos, prov } = crear();
    const guardada = compras.guardar(
      compra(prov, { contado: { formaPagoId: 1 }, fleteProveedor: true }),
    );
    expect(guardada.total).toBe(647_550);
    expect(guardada.abonoNumero).toBe(1);
    const contexto = abonos.contextoTercero('proveedor', prov);
    expect(contexto.deuda.total).toBe(0);
    expect(contexto.facturas).toEqual([]);
    expect(contexto.abonos[0]).toMatchObject({
      numero: 1,
      valor: 647_550,
      origen: 'contado',
      observacion: 'Pago de contado de la compra 1',
    });
    expect(db.prepare('SELECT pagada_contado AS c FROM facturas_proveedor').get()).toEqual({
      c: 1,
    });
  });

  it('la columna Stock lee el stock de la bodega (D-66)', () => {
    const { compras, prov } = crear();
    compras.guardar(compra(prov));
    expect(compras.stockBodega(1)).toEqual([
      { productoCodigo: 101, cantidad: 100_000 },
      { productoCodigo: 103, cantidad: 24_000 },
      { productoCodigo: 104, cantidad: 15_500 },
    ]);
  });

  it('las facturas, sus líneas y sus versiones no se pueden borrar', () => {
    const { db, compras, prov } = crear();
    compras.guardar(compra(prov));
    expect(() => db.prepare('DELETE FROM facturas_proveedor').run()).toThrow(/anulan/);
    expect(() => db.prepare('UPDATE facturas_proveedor_lineas SET total = 0').run()).toThrow(
      /no se pueden modificar/,
    );
    expect(() => db.prepare('DELETE FROM facturas_proveedor_versiones').run()).toThrow(
      /no se pueden borrar/,
    );
  });
});

describe('abonos a proveedor', () => {
  /**
   * Base con tres compras del proveedor principal (la más antigua primero).
   *
   * @returns Lo mismo que {@link crear} más los ids de las compras.
   */
  function conTresCompras(): ReturnType<typeof crear> & { ids: number[] } {
    const base = crear();
    const ids = [
      { numero: 'A', fecha: '2026-08-20', costo: 10_000 },
      { numero: 'B', fecha: '2026-09-05', costo: 20_000 },
      { numero: 'C', fecha: '2026-09-22', costo: 30_000 },
    ].map(
      ({ numero, fecha, costo }) =>
        base.compras.guardar(
          compra(base.prov, {
            numeroProveedor: numero,
            fecha,
            lineas: [{ productoCodigo: 103, cantidad: 10_000, costoUnitario: costo }],
            flete: 0,
          }),
        ).id,
    );
    return { ...base, ids };
  }

  it('lista las facturas pendientes de la más antigua a la más reciente con la deuda vencida', () => {
    const { abonos, prov } = conTresCompras();
    const contexto = abonos.contextoTercero('proveedor', prov);
    expect(contexto.facturas.map((f) => [f.referencia, f.saldo, f.vence])).toEqual([
      ['A', 100_000, '2026-09-19'],
      ['B', 200_000, '2026-10-05'],
      ['C', 300_000, '2026-10-22'],
    ]);
    expect(contexto.deuda).toEqual({ total: 600_000, vencido: 100_000 });
    expect(abonos.contexto('proveedor')).toEqual({ siguienteNumero: 1, hoy: HOY });
  });

  it('guarda un abono repartido entre varias facturas y baja sus saldos', () => {
    const { db, abonos, prov, ids } = conTresCompras();
    const [a, b] = ids;
    const guardado = abonos.guardar({
      tipo: 'proveedor' as const,
      terceroCodigo: prov,
      fecha: HOY,
      formaPagoId: 2,
      valor: 250_000,
      observacion: ' transferencia ',
      aplicaciones: [
        { facturaId: a ?? 0, valor: 100_000 },
        { facturaId: b ?? 0, valor: 150_000 },
        { facturaId: ids[2] ?? 0, valor: 0 },
      ],
    });
    expect(guardado.numero).toBe(1);
    expect(contar(db, 'abonos_aplicaciones')).toBe(2);
    const contexto = abonos.contextoTercero('proveedor', prov);
    expect(contexto.facturas.map((f) => f.saldo)).toEqual([50_000, 300_000]);
    expect(contexto.deuda.total).toBe(350_000);
    expect(contexto.abonos[0]).toMatchObject({
      numero: 1,
      formaPagoNombre: 'Transferencia',
      observacion: 'transferencia',
      estado: 'activo',
    });
    expect(
      contexto.abonos[0]?.aplicaciones.map((x) => [x.facturaNumero, x.valor, x.saldoActual]),
    ).toEqual([
      [1, 100_000, 0],
      [2, 150_000, 50_000],
    ]);
  });

  it('rechaza repartos inválidos sin gastar el consecutivo', () => {
    const { abonos, prov, ids } = conTresCompras();
    const base = {
      tipo: 'proveedor' as const,
      terceroCodigo: prov,
      fecha: HOY,
      formaPagoId: 1,
      observacion: '',
    };
    expect(() =>
      abonos.guardar({
        ...base,
        valor: 150_000,
        aplicaciones: [{ facturaId: ids[0] ?? 0, valor: 150_000 }],
      }),
    ).toThrow(/mayor que su saldo/);
    expect(() =>
      abonos.guardar({
        ...base,
        valor: 150_000,
        aplicaciones: [{ facturaId: ids[0] ?? 0, valor: 100_000 }],
      }),
    ).toThrow(/Falta repartir/);
    expect(() =>
      abonos.guardar({ ...base, fecha: '2026-10-03', valor: 1, aplicaciones: [] }),
    ).toThrow(/posterior a hoy/);
    expect(() => abonos.guardar({ ...base, formaPagoId: 99, valor: 1, aplicaciones: [] })).toThrow(
      /forma de pago/,
    );
    expect(abonos.contexto('proveedor').siguienteNumero).toBe(1);
  });

  it('anular devuelve el saldo a las facturas y queda en el historial (§8, D-62)', () => {
    const { db, abonos, prov, ids } = conTresCompras();
    const { id } = abonos.guardar({
      tipo: 'proveedor' as const,
      terceroCodigo: prov,
      fecha: HOY,
      formaPagoId: 1,
      valor: 100_000,
      observacion: '',
      aplicaciones: [{ facturaId: ids[0] ?? 0, valor: 100_000 }],
    });
    abonos.anular({ id, motivo: ' Error de digitación ' });
    const contexto = abonos.contextoTercero('proveedor', prov);
    expect(contexto.deuda.total).toBe(600_000);
    expect(contexto.abonos[0]).toMatchObject({
      estado: 'anulado',
      motivoAnulacion: 'Error de digitación',
    });
    const anulacion = listarHistorial(db, {}).find(
      (h) => h.entidad === 'abono_proveedor' && h.accion === 'anular',
    );
    expect(anulacion?.motivo).toBe('Error de digitación');
    expect(JSON.parse(anulacion?.despues ?? '{}')).toMatchObject({
      aplicaciones: [{ compraNumero: 1, valor: 100_000, saldoAntes: 0, saldoDespues: 100_000 }],
    });
    expect(() => abonos.anular({ id, motivo: '' })).toThrow(/ya está anulado/);
  });

  it('un abono no se modifica ni se borra: solo se anula', () => {
    const { db, abonos, prov, ids } = conTresCompras();
    abonos.guardar({
      tipo: 'proveedor' as const,
      terceroCodigo: prov,
      fecha: HOY,
      formaPagoId: 1,
      valor: 1000,
      observacion: '',
      aplicaciones: [{ facturaId: ids[0] ?? 0, valor: 1000 }],
    });
    expect(() => db.prepare('UPDATE abonos SET valor = 5').run()).toThrow(/solo se puede anular/);
    expect(() => db.prepare('DELETE FROM abonos').run()).toThrow(/se anulan/);
    expect(() => db.prepare('DELETE FROM abonos_aplicaciones').run()).toThrow(
      /no se pueden borrar/,
    );
  });

  it('el detalle del abono trae los datos del recibo', () => {
    const { abonos, prov, ids } = conTresCompras();
    const { id } = abonos.guardar({
      tipo: 'proveedor' as const,
      terceroCodigo: prov,
      fecha: HOY,
      formaPagoId: 1,
      valor: 1000,
      observacion: 'Parcial',
      aplicaciones: [{ facturaId: ids[0] ?? 0, valor: 1000 }],
    });
    expect(abonos.obtener(id)).toMatchObject({
      tipo: 'proveedor',
      terceroNombre: 'CÁRNICOS DEL VALLE',
      terceroIdentificacion: 'NIT 900000001',
      formaPagoNombre: 'Efectivo',
    });
    expect(() => abonos.obtener(999)).toThrow(/no existe/);
  });
});

describe('ajustes de inventario', () => {
  it('la merma resta y el conteo físico deja el stock en lo contado (D-46)', () => {
    const { compras, ajustes, productos, prov } = crear();
    compras.guardar(compra(prov));
    const merma = ajustes.registrar({
      productoCodigo: 104,
      bodegaId: 1,
      tipo: 'merma',
      cantidad: 1500,
      motivo: 'Producto vencido',
    });
    expect(merma).toMatchObject({ numero: 1, cantidad: -1500, stockAnterior: 15_500 });
    expect(ajustes.stock(104, 1)).toBe(14_000);

    const conteo = ajustes.registrar({
      productoCodigo: 103,
      bodegaId: 1,
      tipo: 'conteo',
      cantidad: 20_000,
      motivo: 'Inventario mensual',
    });
    expect(conteo).toMatchObject({ numero: 2, cantidad: -4000, cantidadContada: 20_000 });
    expect(productos.obtener(103).stockTotal).toBe(20_000);
    expect(ajustes.listar().map((a) => a.numero)).toEqual([2, 1]);
  });

  it('exige motivo y rechaza un conteo igual al stock', () => {
    const { ajustes } = crear();
    expect(() =>
      ajustes.registrar({
        productoCodigo: 103,
        bodegaId: 1,
        tipo: 'dano',
        cantidad: 1000,
        motivo: ' ',
      }),
    ).toThrow(/Motivo/);
    expect(() =>
      ajustes.registrar({
        productoCodigo: 103,
        bodegaId: 1,
        tipo: 'conteo',
        cantidad: 0,
        motivo: 'x',
      }),
    ).toThrow(/nada que ajustar/);
    expect(ajustes.listar()).toEqual([]);
  });

  it('después de un ajuste el producto ya no admite stock inicial (D-39)', () => {
    const { ajustes, productos } = crear();
    ajustes.registrar({
      productoCodigo: 103,
      bodegaId: 1,
      tipo: 'conteo',
      cantidad: 5000,
      motivo: 'x',
    });
    expect(productos.obtener(103).tieneMovimientos).toBe(true);
  });
});
