import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { abrirBaseDeDatos } from '../../src/data/conexion';
import { migracionesDelProyecto } from '../../src/data/migraciones';
import { aplicarMigraciones } from '../../src/data/migrador';
import { prepararDatosDemo } from '../../src/main/demo/carpeta';
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
    expect(obtenerConfiguracion(db, CLAVE_MARCA_DEMO)).toBe('2026-10-04T10:25:00.000-05:00');
    expect(obtenerConfiguracion(db, 'facturacion.impresora')).toBe('POS-80');

    // Ningún producto queda con stock negativo y todos tienen existencias.
    const stocks = db
      .prepare(
        `SELECT producto_codigo AS codigo, SUM(cantidad) AS stock FROM movimientos_inventario GROUP BY producto_codigo`,
      )
      .all() as { codigo: number; stock: number }[];
    expect(stocks).toHaveLength(10);
    for (const s of stocks) {
      expect(s.stock, `stock de ${s.codigo}`).toBeGreaterThan(0);
    }
    expect(stocks.find((s) => s.codigo === 231)?.stock).toBe(175_000);

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
      { estado: 'activa', n: 9 },
      { estado: 'anulada', n: 1 },
    ]);
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

  it('cargar reemplaza una base de ejemplo y borrar la quita', () => {
    enCarpeta((carpeta) => {
      expect(prepararDatosDemo(carpeta, 'cargar', ahora).ok).toBe(true);
      const segunda = prepararDatosDemo(carpeta, 'cargar', ahora);
      expect(segunda.ok).toBe(true);
      expect(segunda.lineas[0]).toBe('Se borró la base de ejemplo anterior.');
      expect(readdirSync(carpeta)).toEqual(['datos']);
      const borrado = prepararDatosDemo(carpeta, 'borrar', ahora);
      expect(borrado.ok).toBe(true);
      expect(existsSync(ruta(carpeta))).toBe(false);
      expect(prepararDatosDemo(carpeta, 'borrar', ahora).lineas[0]).toBe(
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

      const borrar = prepararDatosDemo(carpeta, 'borrar', ahora);
      expect(borrar.ok).toBe(false);
      expect(existsSync(ruta(carpeta))).toBe(true);

      const cargar = prepararDatosDemo(carpeta, 'cargar', ahora);
      expect(cargar.ok).toBe(true);
      expect(readdirSync(carpeta).sort()).toEqual(['datos', 'datos-anterior-20261004-173005']);
      expect(existsSync(join(carpeta, 'datos-anterior-20261004-173005', 'inventario.db'))).toBe(
        true,
      );
    });
  });
});
