import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { abrirBaseDeDatos } from '../../src/data/conexion';
import { migracionesDelProyecto } from '../../src/data/migraciones';
import { aplicarMigraciones } from '../../src/data/migrador';
import { esCarpetaProtegida, prepararDatosDemo } from '../../src/main/demo/carpeta';
import { obtenerConfiguracion } from '../../src/data/repositorios/configuracion.repo';
import { leerCartera } from '../../src/data/repositorios/correcciones.repo';
import { saldoFavorDe } from '../../src/data/repositorios/saldosFavor.repo';
import { CLAVE_MARCA_DEMO, sembrarDatosDemo } from '../../src/main/demo/sembrar';
import { baseDeDatosDePrueba } from './ayudas';

/**
 * Siembra los datos de ejemplo con el día fijo.
 *
 * @returns Conexión y resultado.
 */
function sembrar(): {
  db: ReturnType<typeof baseDeDatosDePrueba>;
  resultado: ReturnType<typeof sembrarDatosDemo>;
} {
  const db = baseDeDatosDePrueba();
  const resultado = sembrarDatosDemo(db, {
    hoy: '2026-10-04',
    desfase: '-05:00',
    impresora: 'POS-80',
  });
  return { db, resultado };
}

/**
 * Código de un tercero por su nombre.
 *
 * @param db - Conexión.
 * @param tabla - `clientes` o `proveedores`.
 * @param nombre - Nombre exacto.
 * @returns Código.
 */
function codigo(
  db: ReturnType<typeof baseDeDatosDePrueba>,
  tabla: 'clientes' | 'proveedores',
  nombre: string,
): number {
  return (
    db.prepare(`SELECT codigo FROM ${tabla} WHERE nombre = ?`).get(nombre) as { codigo: number }
  ).codigo;
}

describe('datos de ejemplo', () => {
  it('se cargan con las reglas de la app y todo cuadra', () => {
    const { db, resultado } = sembrar();
    expect(resultado.claveRecuperacion).not.toBe('');
    expect(resultado.resumen).toHaveLength(6);
    expect(obtenerConfiguracion(db, CLAVE_MARCA_DEMO)).toBe('2026-10-04T11:05:00.000-05:00');
    expect(obtenerConfiguracion(db, 'facturacion.impresora')).toBe('POS-80');

    // Solo dos pares producto-bodega quedan en negativo, a propósito.
    const stocks = db
      .prepare(
        `SELECT m.producto_codigo AS codigo, b.nombre AS bodega, SUM(m.cantidad) AS stock
           FROM movimientos_inventario m JOIN bodegas b ON b.id = m.bodega_id
          GROUP BY m.producto_codigo, m.bodega_id`,
      )
      .all() as { codigo: number; bodega: string; stock: number }[];
    expect(new Set(stocks.map((s) => s.codigo)).size).toBe(11);
    expect(stocks.filter((s) => s.stock < 0)).toEqual([
      { codigo: 104, bodega: 'Principal', stock: -3_000 },
      { codigo: 304, bodega: 'Bodega Norte', stock: -3_000 },
    ]);
    expect(stocks.filter((s) => s.codigo === 231)).toEqual([
      { codigo: 231, bodega: 'Principal', stock: 175_000 },
      { codigo: 231, bodega: 'Bodega Norte', stock: 16_000 },
    ]);
    expect(stocks.find((s) => s.codigo === 301 && s.bodega === 'Bodega Norte')?.stock).toBe(6_500);

    // Ninguna factura queda con saldo negativo.
    for (const [tipo, tabla] of [
      ['cliente', 'facturas_cliente'],
      ['proveedor', 'facturas_proveedor'],
    ] as const) {
      const ids = db.prepare(`SELECT id FROM ${tabla} WHERE estado = 'activa'`).all() as {
        id: number;
      }[];
      for (const { id } of ids) {
        const c = leerCartera(db, tipo, id);
        expect(c.total - c.aplicado - c.devuelto + c.trasladado).toBeGreaterThanOrEqual(0);
      }
    }

    expect(saldoFavorDe(db, 'cliente', codigo(db, 'clientes', 'JUAN JJ FERTILIA'))).toBe(5_500);
    expect(saldoFavorDe(db, 'cliente', codigo(db, 'clientes', 'RESTAURANTE EL FOGON'))).toBe(
      23_000,
    );
    expect(
      saldoFavorDe(db, 'proveedor', codigo(db, 'proveedores', 'EMPAQUES DEL CARIBE S.A.S.')),
    ).toBe(13_600);

    const estados = db
      .prepare(`SELECT estado, COUNT(*) AS n FROM facturas_cliente GROUP BY estado ORDER BY estado`)
      .all();
    expect(estados).toEqual([
      { estado: 'activa', n: 13 },
      { estado: 'anulada', n: 1 },
    ]);

    // Saldos iniciales importados, con su número y sin mover inventario.
    const iniciales = db
      .prepare(
        `SELECT 'cliente' AS tipo, CAST(numero AS TEXT) AS numero, total FROM facturas_cliente WHERE origen = 'saldo_inicial'
         UNION ALL
         SELECT 'proveedor', numero_proveedor, total FROM facturas_proveedor WHERE origen = 'saldo_inicial'
         ORDER BY 1, 2`,
      )
      .all();
    expect(iniciales).toEqual([
      { tipo: 'cliente', numero: '84590', total: 85_000 },
      { tipo: 'cliente', numero: '84655', total: 140_000 },
      { tipo: 'proveedor', numero: 'EC-1201', total: 210_000 },
      { tipo: 'proveedor', numero: 'FV-0712', total: 640_000 },
    ]);
    const primera = db.prepare(
      'SELECT MIN(numero) AS n FROM facturas_cliente WHERE origen IS NOT ?',
    );
    expect(primera.get('saldo_inicial')).toEqual({ n: 84761 });
  });

  it('no se cargan dos veces en la misma base', () => {
    const { db } = sembrar();
    expect(() => sembrarDatosDemo(db)).toThrow();
  });
});

describe('carpeta de los datos de ejemplo', () => {
  /**
   * Corre una prueba en una carpeta temporal que se borra al final.
   *
   * @param prueba - Prueba con la carpeta de la app.
   */
  const enCarpeta = (prueba: (carpeta: string) => void): void => {
    const carpeta = mkdtempSync(join(tmpdir(), 'saas-demo-'));
    try {
      prueba(carpeta);
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  };
  const ruta = (carpeta: string): string => join(carpeta, 'datos', 'inventario.db');
  const ahora = new Date(2026, 9, 4, 17, 30, 5);
  /** Carpeta de la app instalada, ficticia: nunca se crea. */
  const REAL = join(tmpdir(), 'saas-carpeta-real-ficticia', 'Inventario y Facturación');

  it('nunca toca la carpeta de datos del negocio ni lo que está dentro', () => {
    expect(esCarpetaProtegida(REAL, REAL)).toBe(true);
    expect(esCarpetaProtegida(`${REAL.toUpperCase()}\\`, REAL)).toBe(true);
    expect(esCarpetaProtegida(join(REAL, 'otra'), REAL)).toBe(true);
    expect(esCarpetaProtegida(`${REAL} (desarrollo)`, REAL)).toBe(false);
    for (const accion of ['cargar', 'borrar'] as const) {
      const r = prepararDatosDemo(REAL, accion, REAL, ahora);
      expect(r.ok).toBe(false);
      expect(r.lineas[0]).toContain('es la carpeta de datos del negocio');
    }
    expect(existsSync(REAL)).toBe(false);
  });

  it('cargar reemplaza una base de ejemplo y borrar la quita', () => {
    enCarpeta((carpeta) => {
      expect(prepararDatosDemo(carpeta, 'cargar', REAL, ahora).ok).toBe(true);
      const segunda = prepararDatosDemo(carpeta, 'cargar', REAL, ahora);
      expect(segunda.ok).toBe(true);
      expect(segunda.lineas[0]).toBe('Se borró la base de ejemplo anterior.');
      expect(readdirSync(carpeta)).toEqual(['datos']);
      const borrado = prepararDatosDemo(carpeta, 'borrar', REAL, ahora);
      expect(borrado.ok).toBe(true);
      expect(existsSync(ruta(carpeta))).toBe(false);
      expect(prepararDatosDemo(carpeta, 'borrar', REAL, ahora).lineas[0]).toBe(
        'No había datos de ejemplo.',
      );
    });
  });

  it('una base que no es de ejemplo no se borra: se guarda aparte', () => {
    enCarpeta((carpeta) => {
      mkdirSync(join(carpeta, 'datos'));
      const propia = abrirBaseDeDatos(ruta(carpeta));
      aplicarMigraciones(propia, migracionesDelProyecto());
      propia.close();

      const borrar = prepararDatosDemo(carpeta, 'borrar', REAL, ahora);
      expect(borrar.ok).toBe(false);
      expect(existsSync(ruta(carpeta))).toBe(true);

      const cargar = prepararDatosDemo(carpeta, 'cargar', REAL, ahora);
      expect(cargar.ok).toBe(true);
      expect(readdirSync(carpeta).sort()).toEqual(['datos', 'datos-anterior-20261004-173005']);
      expect(existsSync(join(carpeta, 'datos-anterior-20261004-173005', 'inventario.db'))).toBe(
        true,
      );
    });
  });
});
