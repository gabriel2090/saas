import { read, utils } from 'xlsx';
import { describe, expect, it } from 'vitest';
import { facturasPendientesProveedor } from '../../src/data/repositorios/compras.repo';
import { stockEnBodega } from '../../src/data/repositorios/kardex.repo';
import { saldoFavorDe } from '../../src/data/repositorios/saldosFavor.repo';
import { facturasPendientesCliente } from '../../src/data/repositorios/ventas.repo';
import { crearEjecutorTransacciones } from '../../src/data/transaccion';
import { sembrarDatosDemo } from '../../src/main/demo/sembrar';
import { crearServicioNegocio } from '../../src/main/servicios/negocio';
import { crearServicioReportes } from '../../src/main/servicios/reportes';
import type { PeticionCartera, PeticionInventario } from '../../src/shared/reportes';
import { baseDeDatosDePrueba } from './ayudas';

/** Día de los datos de ejemplo. */
const HOY = '2026-10-04';

/** Momento del corte en las pruebas. */
const AHORA = `${HOY}T16:12:00.000-05:00`;

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

/** Inventario sin filtros. */
const INVENTARIO: PeticionInventario = {
  bodegaId: null,
  proveedorCodigo: null,
  texto: '',
  mostrarSinExistencia: false,
  incluirInactivos: false,
};

/**
 * Cartera sin filtros.
 *
 * @param tipo - Cliente o proveedor.
 * @returns Petición.
 */
function cartera(tipo: PeticionCartera['tipo']): PeticionCartera {
  return { tipo, terceroCodigo: null, soloVencidas: false, incluirSoloFavor: true };
}

describe('reportes de la Fase 5a', () => {
  it('cuentas por cobrar cuadra con las facturas pendientes y el saldo a favor de cada cliente', () => {
    const { db, reportes } = crear();
    const r = reportes.cartera(cartera('cliente'));
    expect(r.corte).toBe(AHORA);
    expect(r.grupos.length).toBeGreaterThan(0);
    for (const g of r.grupos) {
      const pendientes = facturasPendientesCliente(db, g.tercero.codigo);
      expect(g.documentos.map((d) => d.id).sort()).toEqual(pendientes.map((p) => p.id).sort());
      expect(g.saldo).toBe(pendientes.reduce((s, p) => s + p.saldo, 0));
      expect(g.saldoFavor).toBe(Math.max(0, saldoFavorDe(db, 'cliente', g.tercero.codigo)));
    }
    const documentos = r.grupos.flatMap((g) => g.documentos);
    expect(r.resumen.documentosVencidos + r.resumen.documentosPorVencer).toBe(documentos.length);
    expect(r.resumen.total).toBe(documentos.reduce((s, d) => s + d.saldo, 0));
  });

  it('cuentas por pagar cuadra con las compras pendientes de cada proveedor', () => {
    const { db, reportes } = crear();
    const r = reportes.cartera(cartera('proveedor'));
    for (const g of r.grupos) {
      const pendientes = facturasPendientesProveedor(db, g.tercero.codigo);
      expect(g.saldo).toBe(pendientes.reduce((s, p) => s + p.saldo, 0));
    }
    const primeros = r.grupos
      .filter((g) => g.documentos.length > 0)
      .map((g) => g.documentos[0]?.vence ?? '');
    expect(primeros).toEqual([...primeros].sort());
  });

  it('el inventario coincide con el kardex de cada par producto-bodega', () => {
    const { db, reportes } = crear();
    const r = reportes.inventario(INVENTARIO);
    expect(r.bodegas.length).toBeGreaterThan(0);
    for (const f of r.filas) {
      r.bodegas.forEach((b, i) => {
        expect(f.porBodega[i]).toBe(stockEnBodega(db, f.codigo, b.id));
      });
    }
    expect(r.resumen.valorTotal).toBe(r.filas.reduce((s, f) => s + f.valor, 0));
    expect(r.resumen.valorTotal).toBe(r.resumen.valorPorBodega.reduce((s, v) => s + v, 0));
  });

  it('arma el HTML carta con el corte, el total y el número de página', () => {
    const { reportes } = crear();
    const html = reportes.html({ reporte: 'cartera', filtros: cartera('cliente') });
    expect(html).toContain('CUENTAS POR COBRAR');
    expect(html).toContain('Corte: 04/10/2026 4:12 p. m.');
    expect(html).toContain('counter(pages)');
    expect(html).not.toContain('<script');
    expect(reportes.html({ reporte: 'inventario', filtros: INVENTARIO })).toContain(
      'INVENTARIO VALORIZADO',
    );
  });

  it('exporta a Excel con las cifras como números', () => {
    const { reportes } = crear();
    const inventario = reportes.inventario(INVENTARIO);
    const libro = read(reportes.excel({ reporte: 'inventario', filtros: INVENTARIO }), {
      type: 'array',
    });
    expect(libro.SheetNames).toEqual(['Inventario']);
    const filas = utils.sheet_to_json<unknown[]>(libro.Sheets.Inventario ?? {}, {
      header: 1,
      raw: true,
    });
    expect(filas[0]).toEqual(['Inventario valorizado']);
    expect(filas[4]?.[0]).toBe('Código');
    const total = filas.at(-1) ?? [];
    expect(total.at(-2)).toBe(inventario.resumen.valorTotal);

    const libroCartera = read(
      reportes.excel({ reporte: 'cartera', filtros: cartera('proveedor') }),
      {
        type: 'array',
      },
    );
    expect(libroCartera.SheetNames).toEqual(['Documentos', 'Por proveedor']);
    const documentos = utils.sheet_to_json<unknown[]>(libroCartera.Sheets.Documentos ?? {}, {
      header: 1,
      raw: true,
    });
    expect(typeof documentos[5]?.[0]).toBe('number');
    expect(
      reportes.nombreArchivo({ reporte: 'cartera', filtros: cartera('proveedor') }, 'xlsx'),
    ).toBe('Cuentas por pagar 2026-10-04.xlsx');
  });
});
