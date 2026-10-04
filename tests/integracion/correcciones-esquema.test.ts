import { describe, expect, it } from 'vitest';
import { abrirBaseDeDatos, type BaseDeDatos } from '../../src/data/conexion';
import { migracionesDelProyecto } from '../../src/data/migraciones';
import { aplicarMigraciones } from '../../src/data/migrador';
import {
  idPorNombre,
  listarCatalogo,
  obtenerCatalogo,
} from '../../src/data/repositorios/catalogos.repo';
import { baseDeDatosDePrueba } from './ayudas';

/**
 * Momento fijo de los documentos de prueba.
 */
const MOMENTO = '2026-10-04T15:20:15-05:00';

/**
 * Crea un proveedor, un cliente, un producto, una venta a crédito (factura
 * 84772) y una compra (37) mínimas para probar el esquema de la 0007.
 *
 * @param db - Base con las migraciones aplicadas.
 * @returns Ids de la venta y de la compra.
 */
function sembrar(db: BaseDeDatos): { venta: number; compra: number } {
  db.prepare(
    `INSERT INTO proveedores (codigo, tipo_persona, nombre, tipo_identificacion, numero_identificacion, celular, direccion)
     VALUES (10012, 'juridica', 'AGRINA S.A.S.', 'NIT', '800111222', '300', 'Calle 1')`,
  ).run();
  db.prepare(
    `INSERT INTO clientes (codigo, tipo_persona, nombre, tipo_identificacion, numero_identificacion, celular, direccion)
     VALUES (10065, 'natural', 'JUAN JJ FERTILIA', 'NIT', '212121354', '300', 'Calle 2')`,
  ).run();
  db.prepare(
    `INSERT INTO productos (codigo, nombre, proveedor_codigo, unidad, costo, precio_mayor, precio_menor, precio_minimo)
     VALUES (231, 'PAPA FRANCESA', 10012, 'UND', 12292, 16000, 17500, 12300)`,
  ).run();
  const venta = db
    .prepare(
      `INSERT INTO facturas_cliente (numero, cliente_codigo, fecha, dia, condicion, plazo_dias, vence, bodega_id, total)
       VALUES (84772, 10065, '2026-10-02T15:15:00-05:00', '2026-10-02', 'credito', 8, '2026-10-10', 1, 79250)`,
    )
    .run().lastInsertRowid;
  const compra = db
    .prepare(
      `INSERT INTO facturas_proveedor (numero, proveedor_codigo, numero_proveedor, numero_proveedor_clave, fecha,
         plazo_dias, vence, bodega_id, subtotal, total, registrada_en)
       VALUES (37, 10012, 'FE-5521', 'FE-5521', '2026-09-28', 0, '2026-09-28', 1, 960000, 960000, ?)`,
    )
    .run(MOMENTO).lastInsertRowid;
  return { venta: Number(venta), compra: Number(compra) };
}

/**
 * Inserta una devolución de venta activa sobre una factura.
 *
 * @param db - Base de prueba.
 * @param facturaId - Id de la factura de cliente.
 * @returns Id de la devolución.
 */
function devolverVenta(db: BaseDeDatos, facturaId: number): number {
  const id = Number(
    db
      .prepare(
        `INSERT INTO devoluciones (tipo, numero, factura_cliente_id, factura_version, fecha, dia, bodega_id, total)
         VALUES ('venta', 1, ?, 1, ?, '2026-10-04', 1, 35000)`,
      )
      .run(facturaId, MOMENTO).lastInsertRowid,
  );
  db.prepare(
    `INSERT INTO devoluciones_lineas (devolucion_id, renglon, factura_renglon, producto_codigo, cantidad,
       valor_unitario, total, costo_unitario)
     VALUES (?, 1, 1, 231, 2000, 17500, 35000, 12292)`,
  ).run(id);
  return id;
}

describe('migración 0007: forma de pago de sistema «Saldo a favor» (D-130)', () => {
  it('existe, no se modifica y no aparece en el catálogo editable', () => {
    const db = baseDeDatosDePrueba();
    const id = idPorNombre(db, 'forma-pago', 'Saldo a favor');
    expect(id).not.toBeNull();
    expect(listarCatalogo(db, 'forma-pago').map((f) => f.nombre)).toEqual([
      'Efectivo',
      'Transferencia',
      'Tarjeta',
    ]);
    expect(obtenerCatalogo(db, 'forma-pago', id ?? 0)).toBeNull();
    expect(() => db.prepare('UPDATE formas_pago SET activo = 0 WHERE id = ?').run(id)).toThrow(
      /es del sistema/,
    );
  });

  it('si el usuario ya tenía una forma con ese nombre, la convierte en la de sistema', () => {
    const db = abrirBaseDeDatos(':memory:');
    const migraciones = migracionesDelProyecto();
    aplicarMigraciones(
      db,
      migraciones.filter((m) => m.version < 7),
    );
    db.prepare(
      "INSERT INTO formas_pago (nombre, nombre_clave, calcula_cambio, activo) VALUES ('SALDO A FAVOR', 'saldo a favor', 1, 0)",
    ).run();
    aplicarMigraciones(db, migraciones);
    expect(
      db
        .prepare(
          "SELECT nombre, activo, calcula_cambio, es_sistema FROM formas_pago WHERE nombre_clave = 'saldo a favor'",
        )
        .all(),
    ).toEqual([{ nombre: 'SALDO A FAVOR', activo: 1, calcula_cambio: 0, es_sistema: 1 }]);
  });
});

describe('migración 0007: devoluciones (D-131)', () => {
  it('no se borran y solo se anulan', () => {
    const db = baseDeDatosDePrueba();
    const { venta } = sembrar(db);
    const id = devolverVenta(db, venta);
    expect(() => db.prepare('DELETE FROM devoluciones').run()).toThrow(/no se pueden borrar/);
    expect(() => db.prepare('UPDATE devoluciones SET total = 1').run()).toThrow(
      /solo se puede anular/,
    );
    expect(() => db.prepare('UPDATE devoluciones_lineas SET cantidad = 1').run()).toThrow(
      /no se pueden modificar/,
    );
    db.prepare(
      "UPDATE devoluciones SET estado = 'anulada', anulada_en = ?, motivo_anulacion = 'Error' WHERE id = ?",
    ).run(MOMENTO, id);
    expect(() =>
      db.prepare("UPDATE devoluciones SET motivo_anulacion = 'Otro' WHERE id = ?").run(id),
    ).toThrow(/solo se puede anular/);
  });

  it('una devolución va a una factura de su tipo', () => {
    const db = baseDeDatosDePrueba();
    const { compra } = sembrar(db);
    expect(() =>
      db
        .prepare(
          `INSERT INTO devoluciones (tipo, numero, factura_proveedor_id, factura_version, fecha, dia, bodega_id, total)
           VALUES ('venta', 1, ?, 1, ?, '2026-10-04', 1, 100)`,
        )
        .run(compra, MOMENTO),
    ).toThrow(/CHECK/);
  });

  it('una factura con devoluciones activas no se corrige ni se anula hasta anularlas', () => {
    const db = baseDeDatosDePrueba();
    const { venta } = sembrar(db);
    const id = devolverVenta(db, venta);
    expect(() =>
      db.prepare('UPDATE facturas_cliente SET version = 2 WHERE id = ?').run(venta),
    ).toThrow(/devoluciones activas/);
    expect(() =>
      db
        .prepare("UPDATE facturas_cliente SET estado = 'anulada', anulada_en = ? WHERE id = ?")
        .run(MOMENTO, venta),
    ).toThrow(/devoluciones activas/);
    db.prepare("UPDATE devoluciones SET estado = 'anulada', anulada_en = ? WHERE id = ?").run(
      MOMENTO,
      id,
    );
    db.prepare('UPDATE facturas_cliente SET version = 2, total = 48250 WHERE id = ?').run(venta);
    expect(
      db.prepare('SELECT version, total FROM facturas_cliente WHERE id = ?').get(venta),
    ).toEqual({ version: 2, total: 48250 });
  });
});

describe('migración 0007: saldo a favor y reintegros (D-127, D-128)', () => {
  it('el libro de saldo a favor es de solo inserción y coherente con el tercero', () => {
    const db = baseDeDatosDePrueba();
    const { venta, compra } = sembrar(db);
    db.prepare(
      `INSERT INTO saldos_favor (tipo, cliente_codigo, fecha, valor, origen, documento_tipo, documento_id, factura_cliente_id)
       VALUES ('cliente', 10065, ?, 21750, 'correccion', 'factura_cliente', ?, ?)`,
    ).run(MOMENTO, venta, venta);
    expect(() => db.prepare('UPDATE saldos_favor SET valor = 1').run()).toThrow(
      /no se pueden modificar/,
    );
    expect(() => db.prepare('DELETE FROM saldos_favor').run()).toThrow(/no se pueden borrar/);
    expect(() =>
      db
        .prepare(
          `INSERT INTO saldos_favor (tipo, cliente_codigo, fecha, valor, origen, documento_tipo, documento_id, factura_proveedor_id)
           VALUES ('cliente', 10065, ?, 100, 'correccion', 'factura_proveedor', ?, ?)`,
        )
        .run(MOMENTO, compra, compra),
    ).toThrow(/CHECK/);
  });

  it('los reintegros de una venta de contado no se anulan; los de saldo a favor sí', () => {
    const db = baseDeDatosDePrueba();
    sembrar(db);
    const insertar = db.prepare(
      `INSERT INTO reintegros (numero, tipo, cliente_codigo, sentido, origen, documento_tipo, documento_id,
         fecha, dia, forma_pago_id, valor)
       VALUES (?, 'cliente', 10065, 'entrega', ?, ?, ?, ?, '2026-10-04', 1, 21750)`,
    );
    const deSaldo = Number(insertar.run(1, 'saldo_favor', null, null, MOMENTO).lastInsertRowid);
    const deVenta = Number(
      insertar.run(2, 'documento', 'factura_cliente', 1, MOMENTO).lastInsertRowid,
    );
    const anular = db.prepare(
      "UPDATE reintegros SET estado = 'anulado', anulado_en = ? WHERE id = ?",
    );
    anular.run(MOMENTO, deSaldo);
    expect(() => anular.run(MOMENTO, deVenta)).toThrow(/CHECK/);
    expect(() => db.prepare('UPDATE reintegros SET valor = 1 WHERE id = ?').run(deVenta)).toThrow(
      /solo se puede anular/,
    );
    expect(() => insertar.run(3, 'documento', null, null, MOMENTO)).toThrow(/CHECK/);
  });
});
