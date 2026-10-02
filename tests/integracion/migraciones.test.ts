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

  it('crean el esquema base con sus datos iniciales', () => {
    const db = abrirBaseDeDatos(':memory:');
    expect(aplicarMigraciones(db, migracionesDelProyecto(), () => FECHA_PRUEBA)).toEqual([1]);
    expect(tablas(db)).toEqual([
      'configuracion',
      'consecutivos',
      'historial_cambios',
      'schema_migraciones',
    ]);
    const consecutivos = db
      .prepare('SELECT clave, siguiente FROM consecutivos ORDER BY clave')
      .all();
    expect(consecutivos).toEqual([
      { clave: 'cliente', siguiente: 10001 },
      { clave: 'producto', siguiente: 101 },
      { clave: 'proveedor', siguiente: 10001 },
    ]);
    expect(verificarIntegridad(db).ok).toBe(true);
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
