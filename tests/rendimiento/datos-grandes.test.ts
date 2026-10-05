import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirBaseDeDatos, type BaseDeDatos } from '../../src/data/conexion';
import { migracionesDelProyecto } from '../../src/data/migraciones';
import { aplicarMigraciones } from '../../src/data/migrador';
import { listarHistorial } from '../../src/data/repositorios/historial.repo';
import { crearEjecutorTransacciones } from '../../src/data/transaccion';
import { claveComparacion } from '../../src/domain/texto';
import { sembrarDatosGrandes } from '../../src/main/demo/grande';
import { sembrarDatosDemo } from '../../src/main/demo/sembrar';
import { crearServicioCompras } from '../../src/main/servicios/compras';
import { crearServicioNegocio } from '../../src/main/servicios/negocio';
import { crearServicioProductos } from '../../src/main/servicios/productos';
import { crearServicioReimpresiones } from '../../src/main/servicios/reimpresiones';
import { crearServicioReportes } from '../../src/main/servicios/reportes';
import { crearServicioTerceros } from '../../src/main/servicios/terceros';
import { crearServicioVentas } from '../../src/main/servicios/ventas';

/** Día de los datos. */
const HOY = '2026-10-04';

/** Momento de las consultas. */
const AHORA = `${HOY}T16:00:00.000-05:00`;

/** Archivo donde queda el informe de tiempos. */
const INFORME = join(tmpdir(), 'saas-rendimiento.txt');

/**
 * Tiempo medido de una consulta.
 */
interface Medicion {
  /** Qué se midió. */
  nombre: string;
  /** Mediana en milisegundos. */
  mediana: number;
  /** Peor vez en milisegundos. */
  peor: number;
  /** Detalle (filas devueltas, etc.). */
  detalle: string;
}

/** Mediciones acumuladas para el informe. */
const mediciones: Medicion[] = [];

/** Planes de consulta acumulados para el informe. */
const planes: string[] = [];

/** Carpeta temporal de la base. */
let carpeta = '';
/** Base con el volumen grande. */
let db: BaseDeDatos;
/** Duración del sembrado. */
let segundosSembrado = 0;

/**
 * Mide una operación varias veces (la primera calienta la caché de SQLite).
 *
 * @param nombre - Qué se mide.
 * @param operacion - Operación; devuelve un detalle para el informe.
 * @param veces - Repeticiones medidas.
 * @returns Mediana en milisegundos.
 */
function medir(nombre: string, operacion: () => string, veces = 5): number {
  operacion();
  const tiempos: number[] = [];
  let detalle = '';
  for (let i = 0; i < veces; i++) {
    const inicio = performance.now();
    detalle = operacion();
    tiempos.push(performance.now() - inicio);
  }
  tiempos.sort((a, b) => a - b);
  const mediana = tiempos[Math.floor(tiempos.length / 2)] ?? 0;
  mediciones.push({ nombre, mediana, peor: tiempos.at(-1) ?? 0, detalle });
  return mediana;
}

/**
 * Guarda el plan de consulta de SQLite de una sentencia.
 *
 * @param nombre - Qué consulta es.
 * @param sql - Sentencia.
 * @param parametros - Parámetros.
 * @returns Líneas del plan.
 */
function plan(nombre: string, sql: string, ...parametros: unknown[]): string[] {
  const filas = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...parametros) as { detail: string }[];
  const lineas = filas.map((f) => f.detail);
  planes.push(`${nombre}:\n${lineas.map((l) => `    ${l}`).join('\n')}`);
  return lineas;
}

beforeAll(() => {
  carpeta = mkdtempSync(join(tmpdir(), 'saas-rendimiento-'));
  db = abrirBaseDeDatos(join(carpeta, 'inventario.db'));
  aplicarMigraciones(db, migracionesDelProyecto());
  const inicio = performance.now();
  sembrarDatosDemo(db, { hoy: HOY, desfase: '-05:00' });
  sembrarDatosGrandes(db, { hoy: HOY, desfase: '-05:00' });
  segundosSembrado = (performance.now() - inicio) / 1000;
});

afterAll(() => {
  const contar = (tabla: string): number =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get() as { n: number }).n;
  const informe = [
    `Datos: ${contar('productos')} productos, ${contar('movimientos_inventario')} movimientos, ` +
      `${contar('facturas_cliente')} facturas de venta, ${contar('facturas_proveedor')} compras, ` +
      `${contar('abonos')} abonos, ${contar('historial_cambios')} registros de historial.`,
    `Sembrado: ${segundosSembrado.toFixed(1)} s.`,
    '',
    'Tiempos (mediana / peor, en ms):',
    ...mediciones.map(
      (m) =>
        `  ${m.nombre.padEnd(52)} ${m.mediana.toFixed(1).padStart(8)} / ${m.peor.toFixed(1).padStart(8)}  ${m.detalle}`,
    ),
    '',
    'Planes de consulta:',
    ...planes,
  ].join('\n');
  writeFileSync(INFORME, informe, 'utf8');
  console.log(`${informe}\n\nInforme: ${INFORME}`);
  db.close();
  rmSync(carpeta, { recursive: true, force: true });
});

describe('rendimiento con el volumen grande', () => {
  it('el inventario valorizado responde rápido', () => {
    const ejecutar = crearEjecutorTransacciones(db, { reloj: () => AHORA });
    const reportes = crearServicioReportes(db, {
      negocio: crearServicioNegocio(db, ejecutar),
      ahora: () => AHORA,
    });
    const base = {
      bodegaId: null,
      proveedorCodigo: null,
      texto: '',
      mostrarSinExistencia: false,
      incluirInactivos: false,
    };
    let filas = 0;
    const t = medir('Inventario valorizado (todas las bodegas)', () => {
      filas = reportes.inventario(base).filas.length;
      return `${filas} filas`;
    });
    expect(filas).toBeGreaterThan(5_000);
    expect(t).toBeLessThan(1_500);
    medir('Inventario valorizado (texto «salchicha»)', () => {
      return `${reportes.inventario({ ...base, texto: 'salchicha' }).filas.length} filas`;
    });
    medir('Inventario valorizado (Bodega Norte)', () => {
      return `${reportes.inventario({ ...base, bodegaId: 2 }).filas.length} filas`;
    });
    medir(
      'HTML carta del inventario',
      () => {
        return `${Math.round(reportes.html({ reporte: 'inventario', filtros: base }).length / 1024)} KB`;
      },
      3,
    );
    medir(
      'Excel del inventario',
      () => {
        return `${Math.round(reportes.excel({ reporte: 'inventario', filtros: base }).length / 1024)} KB`;
      },
      3,
    );
    medir('Cuentas por cobrar', () => {
      const r = reportes.cartera({
        tipo: 'cliente',
        terceroCodigo: null,
        soloVencidas: false,
        incluirSoloFavor: true,
      });
      return `${r.grupos.length} clientes`;
    });
    medir('Cuentas por pagar', () => {
      const r = reportes.cartera({
        tipo: 'proveedor',
        terceroCodigo: null,
        soloVencidas: false,
        incluirSoloFavor: true,
      });
      return `${r.grupos.length} proveedores`;
    });
    plan(
      'Existencias por producto y bodega',
      `SELECT producto_codigo, bodega_id, SUM(cantidad) FROM movimientos_inventario
        GROUP BY producto_codigo, bodega_id HAVING SUM(cantidad) <> 0`,
    );
  });

  it('las búsquedas de productos y documentos responden rápido', () => {
    const ejecutar = crearEjecutorTransacciones(db, { reloj: () => AHORA });
    const productos = crearServicioProductos(db, ejecutar);
    const ventas = crearServicioVentas(db, ejecutar, { reloj: () => AHORA });
    const compras = crearServicioCompras(db, ejecutar);
    const terceros = crearServicioTerceros(db, ejecutar);
    let lista = productos.listar();
    medir('Lista de productos con stock (Facturar, maestro)', () => {
      lista = productos.listar();
      return `${lista.length} productos`;
    });
    medir('Lista de clientes (Facturar, abonos)', () => {
      return `${terceros.listar('cliente').length} clientes`;
    });
    medir('Stock de la bodega Principal (columna Stock)', () => {
      return `${compras.stockBodega(1).length} productos`;
    });
    medir('Crédito de un cliente con historia', () => {
      const cliente = db
        .prepare(
          `SELECT cliente_codigo AS c FROM facturas_cliente WHERE condicion = 'credito'
            GROUP BY cliente_codigo ORDER BY COUNT(*) DESC LIMIT 1`,
        )
        .get() as { c: number };
      return `deuda ${ventas.creditoCliente(cliente.c).deuda.total}`;
    });
    const t = medir(
      'Filtro del buscador por tecla («queso col»)',
      () => {
        const busqueda = claveComparacion('queso col');
        const n = lista.filter(
          (p) =>
            String(p.codigo).startsWith(busqueda) || claveComparacion(p.nombre).includes(busqueda),
        ).length;
        return `${n} coincidencias`;
      },
      20,
    );
    expect(t).toBeLessThan(100);

    const reimpresiones = crearServicioReimpresiones(db);
    medir('Reimpresiones: ventas sin filtro (últimas)', () => {
      const r = reimpresiones.buscar({
        tipo: 'factura-cliente',
        texto: '',
        desde: null,
        hasta: null,
      });
      return `${r.documentos.length} documentos${r.truncado ? ' (cortado)' : ''}`;
    });
    medir('Reimpresiones: venta por número', () => {
      const r = reimpresiones.buscar({
        tipo: 'factura-cliente',
        texto: '88000',
        desde: null,
        hasta: null,
      });
      return `${r.documentos.length} documentos`;
    });
    medir('Reimpresiones: ventas por nombre de cliente', () => {
      const r = reimpresiones.buscar({
        tipo: 'factura-cliente',
        texto: 'cliente queso',
        desde: null,
        hasta: null,
      });
      return `${r.documentos.length} documentos`;
    });
    medir('Reimpresiones: compras por factura del proveedor', () => {
      const r = reimpresiones.buscar({
        tipo: 'factura-proveedor',
        texto: 'G-500',
        desde: null,
        hasta: null,
      });
      return `${r.documentos.length} documentos`;
    });
    medir(
      'Historial: últimos 200 registros',
      () => {
        return `${listarHistorial(db, {}).slice(0, 200).length} registros`;
      },
      3,
    );
  });

  it('el kardex y el visor del historial responden rápido', () => {
    const ejecutar = crearEjecutorTransacciones(db, { reloj: () => AHORA });
    const reportes = crearServicioReportes(db, {
      negocio: crearServicioNegocio(db, ejecutar),
      ahora: () => AHORA,
    });
    const masMovido = db
      .prepare(
        `SELECT producto_codigo AS c, COUNT(*) AS n FROM movimientos_inventario
          GROUP BY producto_codigo ORDER BY n DESC LIMIT 1`,
      )
      .get() as { c: number; n: number };
    const anio = { desde: '2025-10-01', hasta: HOY };
    const t = medir(`Kardex del producto más movido (${masMovido.c}), todas, 1 año`, () => {
      const r = reportes.kardex({ productoCodigo: masMovido.c, bodegaId: null, ...anio });
      return `${r.filas.length} movimientos`;
    });
    expect(t).toBeLessThan(500);
    medir('Kardex del mismo producto, Principal, último mes', () => {
      const r = reportes.kardex({
        productoCodigo: masMovido.c,
        bodegaId: 1,
        desde: '2026-09-01',
        hasta: HOY,
      });
      return `${r.filas.length} movimientos, saldo anterior ${r.saldoAnterior}`;
    });
    medir(
      'HTML carta del kardex (1 año)',
      () => {
        const html = reportes.html({
          reporte: 'kardex',
          filtros: { productoCodigo: masMovido.c, bodegaId: null, ...anio },
        });
        return `${Math.round(html.length / 1024)} KB`;
      },
      3,
    );
    const base = { tipo: null, accion: null, texto: '' };
    const h = medir('Historial: última semana sin filtros', () => {
      const r = reportes.historial({ desde: '2026-09-28', hasta: HOY, ...base });
      return `${r.registros.length} registros${r.truncado ? ' (cortado)' : ''}`;
    });
    expect(h).toBeLessThan(1_000);
    medir(
      'Historial: 1 año, texto «queso» (peor caso)',
      () => {
        const r = reportes.historial({ ...anio, ...base, texto: 'queso' });
        return `${r.registros.length} registros${r.truncado ? ' (cortado)' : ''}`;
      },
      3,
    );
    medir(
      'Historial: 1 año, facturas de venta anuladas',
      () => {
        const r = reportes.historial({
          ...anio,
          ...base,
          tipo: 'factura-cliente',
          accion: 'anular',
        });
        return `${r.registros.length} registros`;
      },
      3,
    );
    medir(
      'Historial: 1 año, factura por número',
      () => {
        const r = reportes.historial({ ...anio, ...base, tipo: 'factura-cliente', texto: '88000' });
        return `${r.registros.length} registros`;
      },
      3,
    );
    const ultimo = reportes.historial({ desde: '2026-09-28', hasta: HOY, ...base }).registros[0];
    medir('Detalle de un registro del historial', () => {
      return reportes.detalleHistorial(ultimo?.id ?? 1).titulo;
    });

    plan(
      'Kardex: movimientos del periodo (todas las bodegas)',
      `SELECT m.id FROM movimientos_inventario m
        WHERE m.producto_codigo = ? AND (? IS NULL OR m.bodega_id = ?) AND m.fecha >= ? AND m.fecha < ?
        ORDER BY m.fecha, m.id`,
      masMovido.c,
      null,
      null,
      anio.desde,
      '2026-10-05',
    );
    plan(
      'Kardex: saldo anterior',
      `SELECT COALESCE(SUM(cantidad), 0) FROM movimientos_inventario
        WHERE producto_codigo = ? AND (? IS NULL OR bodega_id = ?) AND fecha < ?`,
      masMovido.c,
      1,
      1,
      '2026-09-01',
    );
    plan(
      'Historial: periodo con tipo y acción',
      `SELECT id FROM historial_cambios
        WHERE fecha >= ? AND fecha < ? AND entidad IN (?) AND accion = ? ORDER BY id DESC`,
      anio.desde,
      '2026-10-05',
      'factura_cliente',
      'anular',
    );
    plan(
      'Historial: periodo sin filtros',
      `SELECT id FROM historial_cambios WHERE fecha >= ? AND fecha < ? ORDER BY id DESC`,
      '2026-09-28',
      '2026-10-05',
    );
  });
});
