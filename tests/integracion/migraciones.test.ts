import { describe, expect, it } from 'vitest';
import { abrirBaseDeDatos, verificarIntegridad } from '../../src/data/conexion';
import { migracionesDelProyecto } from '../../src/data/migraciones';
import { aplicarMigraciones, calcularChecksum, type Migracion } from '../../src/data/migrador';
import { FECHA_PRUEBA } from './ayudas';

/**
 * Lista los nombres de las tablas de usuario de la base.
 *
 * @param db - Conexión abierta.
 * @returns Nombres de tablas ordenados.
 */
function tablas(db: ReturnType<typeof abrirBaseDeDatos>): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
      name: string;
    }[]
  ).map((t) => t.name);
}

describe('migraciones del proyecto', () => {
  it('se cargan ordenadas y consecutivas desde 1', () => {
    const versiones = migracionesDelProyecto().map((m) => m.version);
    expect(versiones[0]).toBe(1);
    versiones.forEach((v, i) => expect(v).toBe(i + 1));
  });

  it('crean el esquema con sus datos iniciales', () => {
    const db = abrirBaseDeDatos(':memory:');
    expect(aplicarMigraciones(db, migracionesDelProyecto(), () => FECHA_PRUEBA)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(tablas(db)).toEqual([
      'abonos',
      'abonos_aplicaciones',
      'ajustes_inventario',
      'bodegas',
      'borradores_factura',
      'clientes',
      'configuracion',
      'consecutivos',
      'devoluciones',
      'devoluciones_lineas',
      'facturas_cliente',
      'facturas_cliente_lineas',
      'facturas_cliente_versiones',
      'facturas_proveedor',
      'facturas_proveedor_lineas',
      'facturas_proveedor_versiones',
      'formas_pago',
      'historial_cambios',
      'movimientos_inventario',
      'preferencias_interfaz',
      'productos',
      'proveedores',
      'reintegros',
      'saldos_favor',
      'schema_migraciones',
    ]);
    expect(db.prepare('SELECT nombre, es_principal FROM bodegas').all()).toEqual([
      { nombre: 'Principal', es_principal: 1 },
    ]);
    expect(
      db.prepare('SELECT nombre, calcula_cambio, es_sistema FROM formas_pago ORDER BY id').all(),
    ).toEqual([
      { nombre: 'Efectivo', calcula_cambio: 1, es_sistema: 0 },
      { nombre: 'Transferencia', calcula_cambio: 0, es_sistema: 0 },
      { nombre: 'Tarjeta', calcula_cambio: 0, es_sistema: 0 },
      { nombre: 'Saldo a favor', calcula_cambio: 0, es_sistema: 1 },
    ]);
    expect(db.prepare('SELECT codigo, nombre, es_sistema FROM clientes').all()).toEqual([
      { codigo: 0, nombre: 'CONSUMIDOR FINAL', es_sistema: 1 },
    ]);
    const consecutivos = db
      .prepare('SELECT clave, siguiente FROM consecutivos ORDER BY clave')
      .all();
    expect(consecutivos).toEqual([
      { clave: 'abono_cliente', siguiente: 1 },
      { clave: 'abono_proveedor', siguiente: 1 },
      { clave: 'ajuste', siguiente: 1 },
      { clave: 'cliente', siguiente: 10001 },
      { clave: 'compra', siguiente: 1 },
      { clave: 'devolucion_compra', siguiente: 1 },
      { clave: 'devolucion_venta', siguiente: 1 },
      { clave: 'factura_cliente', siguiente: 1 },
      { clave: 'producto', siguiente: 101 },
      { clave: 'proveedor', siguiente: 10001 },
      { clave: 'reintegro', siguiente: 1 },
    ]);
    expect(verificarIntegridad(db).ok).toBe(true);
  });

  it('protegen el kardex y las reglas de los maestros', () => {
    const db = abrirBaseDeDatos(':memory:');
    aplicarMigraciones(db, migracionesDelProyecto());
    expect(() => db.prepare('UPDATE bodegas SET activo = 0 WHERE es_principal = 1').run()).toThrow(
      /CHECK/,
    );
    expect(() =>
      db
        .prepare("INSERT INTO bodegas (nombre, nombre_clave, es_principal) VALUES ('B', 'b', 1)")
        .run(),
    ).toThrow(/UNIQUE/);
    expect(() =>
      db
        .prepare(
          `INSERT INTO productos (codigo, nombre, proveedor_codigo, unidad, costo, precio_mayor, precio_menor, precio_minimo)
           VALUES (101, 'X', 99999, 'UND', 1, 1, 1, 1)`,
        )
        .run(),
    ).toThrow(/FOREIGN KEY/);
    db.prepare(
      `INSERT INTO proveedores (codigo, tipo_persona, nombre, tipo_identificacion, numero_identificacion, celular, direccion)
       VALUES (10001, 'juridica', 'P', 'NIT', '900', '300', 'Calle 1')`,
    ).run();
    db.prepare(
      `INSERT INTO productos (codigo, nombre, proveedor_codigo, unidad, costo, precio_mayor, precio_menor, precio_minimo)
       VALUES (101, 'X', 10001, 'UND', 1, 1, 1, 1)`,
    ).run();
    db.prepare(
      `INSERT INTO movimientos_inventario (fecha, producto_codigo, bodega_id, tipo, cantidad, costo_unitario)
       VALUES ('2026-10-01T10:00:00-05:00', 101, 1, 'inicial', 1000, 1)`,
    ).run();
    expect(() => db.prepare('UPDATE movimientos_inventario SET cantidad = 5').run()).toThrow(
      /no se pueden modificar/,
    );
    expect(() => db.prepare('DELETE FROM movimientos_inventario').run()).toThrow(
      /no se pueden borrar/,
    );
  });

  it('activa las claves foráneas', () => {
    const db = abrirBaseDeDatos(':memory:');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('aplicarlas dos veces no cambia nada', () => {
    const db = abrirBaseDeDatos(':memory:');
    aplicarMigraciones(db, migracionesDelProyecto());
    expect(aplicarMigraciones(db, migracionesDelProyecto())).toEqual([]);
  });
});

describe('migrador', () => {
  /**
   * Migraciones de ejemplo para probar el migrador de forma aislada.
   */
  const ejemplo: Migracion[] = [
    { version: 1, nombre: 'uno', sql: 'CREATE TABLE a (id INTEGER PRIMARY KEY);' },
    { version: 2, nombre: 'dos', sql: 'CREATE TABLE b (id INTEGER PRIMARY KEY);' },
  ];

  it('aplica solo las pendientes', () => {
    const db = abrirBaseDeDatos(':memory:');
    expect(aplicarMigraciones(db, ejemplo.slice(0, 1))).toEqual([1]);
    expect(aplicarMigraciones(db, ejemplo)).toEqual([2]);
  });

  it('falla con mensaje claro si una migración aplicada fue modificada', () => {
    const db = abrirBaseDeDatos(':memory:');
    aplicarMigraciones(db, ejemplo);
    const modificada = [
      { ...ejemplo[0]!, sql: 'CREATE TABLE a (id INTEGER PRIMARY KEY, x TEXT);' },
      ejemplo[1]!,
    ];
    expect(() => aplicarMigraciones(db, modificada)).toThrow(/fue modificada después de aplicarse/);
  });

  it('falla si la base tiene migraciones más nuevas que la aplicación', () => {
    const db = abrirBaseDeDatos(':memory:');
    aplicarMigraciones(db, ejemplo);
    expect(() => aplicarMigraciones(db, ejemplo.slice(0, 1))).toThrow(/no conoce/);
  });

  it('exige versiones consecutivas', () => {
    const db = abrirBaseDeDatos(':memory:');
    expect(() => aplicarMigraciones(db, [ejemplo[1]!])).toThrow(/consecutivas/);
  });

  it('revierte por completo una migración que falla a mitad', () => {
    const db = abrirBaseDeDatos(':memory:');
    const rota: Migracion = {
      version: 1,
      nombre: 'rota',
      sql: 'CREATE TABLE c (id INTEGER); SELECT * FROM no_existe;',
    };
    expect(() => aplicarMigraciones(db, [rota])).toThrow();
    expect(tablas(db)).toEqual(['schema_migraciones']);
  });

  it('el checksum ignora la diferencia entre LF y CRLF', () => {
    expect(calcularChecksum('a\r\nb')).toBe(calcularChecksum('a\nb'));
  });
});
