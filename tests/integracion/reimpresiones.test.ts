import { describe, expect, it } from 'vitest';
import { crearEjecutorTransacciones } from '../../src/data/transaccion';
import { sembrarDatosDemo } from '../../src/main/demo/sembrar';
import { crearServicioAbonos } from '../../src/main/servicios/abonos';
import { crearServicioCorrecciones } from '../../src/main/servicios/correcciones';
import { crearServicioImportador } from '../../src/main/servicios/importador';
import { crearServicioImpresion } from '../../src/main/servicios/impresion';
import { crearServicioNegocio } from '../../src/main/servicios/negocio';
import { crearServicioReimpresiones } from '../../src/main/servicios/reimpresiones';
import { crearServicioVentas } from '../../src/main/servicios/ventas';
import type { TipoReimpresion } from '../../src/shared/reimpresiones';
import { baseDeDatosDePrueba } from './ayudas';

/** Día de los datos de ejemplo. */
const HOY = '2026-10-04';

/**
 * Base con los datos de ejemplo, un saldo inicial importado de cliente y de
 * proveedor, y los servicios de reimpresiones e impresión.
 *
 * @returns Conexión y servicios.
 */
function crear(): {
  db: ReturnType<typeof baseDeDatosDePrueba>;
  reimpresiones: ReturnType<typeof crearServicioReimpresiones>;
  impresion: ReturnType<typeof crearServicioImpresion>;
} {
  const db = baseDeDatosDePrueba();
  sembrarDatosDemo(db, { hoy: HOY, desfase: '-05:00' });
  const reloj = (): string => `${HOY}T18:00:00.000-05:00`;
  const ejecutar = crearEjecutorTransacciones(db, { reloj });
  const importador = crearServicioImportador(db, ejecutar, { hoy: () => HOY });
  const cliente = db.prepare('SELECT codigo FROM clientes WHERE es_sistema = 0 LIMIT 1').get() as {
    codigo: number;
  };
  const proveedor = db.prepare('SELECT codigo FROM proveedores LIMIT 1').get() as {
    codigo: number;
  };
  const saldo = (tercero: number, numero: string): Record<string, string> => ({
    tercero: String(tercero),
    numero,
    fecha: '01/09/2026',
    vence: '30/09/2026',
    plazo: '',
    saldo: '10000',
  });
  expect(
    importador.importar('saldos-clientes', [{ numero: 2, valores: saldo(cliente.codigo, '70001') }])
      .importadas,
  ).toBe(1);
  expect(
    importador.importar('saldos-proveedores', [
      { numero: 2, valores: saldo(proveedor.codigo, 'SI-1') },
    ]).importadas,
  ).toBe(1);
  return {
    db,
    reimpresiones: crearServicioReimpresiones(db),
    impresion: crearServicioImpresion({
      negocio: crearServicioNegocio(db, ejecutar),
      abonos: crearServicioAbonos(db, ejecutar, { hoy: () => HOY }),
      ventas: crearServicioVentas(db, ejecutar, { reloj }),
      correcciones: crearServicioCorrecciones(db, ejecutar),
      reloj,
    }),
  };
}

/**
 * Petición sin filtros de un tipo.
 *
 * @param tipo - Tipo de documento.
 * @returns Petición.
 */
function todos(
  tipo: TipoReimpresion,
): Parameters<ReturnType<typeof crearServicioReimpresiones>['buscar']>[0] {
  return { tipo, texto: '', desde: null, hasta: null };
}

describe('reimpresiones (§9.3)', () => {
  it('lista cada tipo del más reciente al más antiguo, sin los saldos iniciales', () => {
    const { db, reimpresiones } = crear();
    const ventas = reimpresiones.buscar(todos('factura-cliente'));
    const enBase = db
      .prepare("SELECT COUNT(*) AS n FROM facturas_cliente WHERE origen = 'venta'")
      .get() as { n: number };
    expect(ventas.documentos).toHaveLength(enBase.n);
    expect(ventas.truncado).toBe(false);
    expect(ventas.documentos.some((d) => d.numero === 70001)).toBe(false);
    const fechas = ventas.documentos.map((d) => d.fecha);
    expect(fechas).toEqual([...fechas].sort().reverse());
    expect(ventas.documentos.some((d) => d.anulado)).toBe(true);
    expect(ventas.documentos.some((d) => d.version > 1)).toBe(true);

    const compras = reimpresiones.buscar(todos('factura-proveedor')).documentos;
    expect(compras).toHaveLength(6);
    expect(compras.some((d) => d.referencia === 'SI-1')).toBe(false);
    expect(compras.every((d) => d.referencia !== '')).toBe(true);

    const abonosCliente = reimpresiones.buscar(todos('abono-cliente')).documentos;
    const abonosProveedor = reimpresiones.buscar(todos('abono-proveedor')).documentos;
    const porTipo = db
      .prepare('SELECT tipo, COUNT(*) AS n FROM abonos GROUP BY tipo ORDER BY tipo')
      .all() as { tipo: string; n: number }[];
    expect(porTipo).toEqual([
      { tipo: 'cliente', n: abonosCliente.length },
      { tipo: 'proveedor', n: abonosProveedor.length },
    ]);
    expect(abonosCliente.some((a) => a.anulado)).toBe(true);
  });

  it('filtra por número, por número del proveedor, por nombre y por rango', () => {
    const { reimpresiones } = crear();
    const [primera] = reimpresiones.buscar(todos('factura-cliente')).documentos;
    if (!primera) {
      throw new Error('Los datos de ejemplo no tienen ventas.');
    }
    const porNumero = reimpresiones.buscar({
      ...todos('factura-cliente'),
      texto: ` ${primera.numero} `,
    }).documentos;
    expect(porNumero.map((d) => d.id)).toContain(primera.id);

    const porNombre = reimpresiones.buscar({
      ...todos('factura-cliente'),
      texto: primera.terceroNombre.slice(0, 4).toLowerCase(),
    }).documentos;
    expect(porNombre.length).toBeGreaterThan(0);
    expect(
      porNombre.every((d) =>
        d.terceroNombre.toLowerCase().includes(primera.terceroNombre.slice(0, 4).toLowerCase()),
      ),
    ).toBe(true);

    const [compra] = reimpresiones.buscar(todos('factura-proveedor')).documentos;
    if (!compra) {
      throw new Error('Los datos de ejemplo no tienen compras.');
    }
    expect(
      reimpresiones
        .buscar({ ...todos('factura-proveedor'), texto: compra.referencia })
        .documentos.map((d) => d.id),
    ).toContain(compra.id);

    const hoy = reimpresiones.buscar({ ...todos('factura-cliente'), desde: HOY, hasta: HOY });
    expect(hoy.documentos.length).toBeGreaterThan(0);
    expect(hoy.documentos.every((d) => d.fecha === HOY)).toBe(true);

    // Los comodines de LIKE se buscan tal cual.
    expect(reimpresiones.buscar({ ...todos('abono-cliente'), texto: '%' }).documentos).toEqual([]);
  });

  it('rechaza fechas inválidas o un rango al revés', () => {
    const { reimpresiones } = crear();
    expect(() =>
      reimpresiones.buscar({ ...todos('abono-proveedor'), desde: '2026-02-30' }),
    ).toThrow(/«Desde» no es válida/);
    expect(() =>
      reimpresiones.buscar({ ...todos('abono-proveedor'), desde: HOY, hasta: '2026-10-01' }),
    ).toThrow(/posterior a «Hasta»/);
  });

  it('cada documento encontrado se ve en tirilla con REIMPRESION y sus leyendas', () => {
    const { reimpresiones, impresion } = crear();
    const tipos: TipoReimpresion[] = [
      'factura-cliente',
      'factura-proveedor',
      'abono-cliente',
      'abono-proveedor',
    ];
    for (const tipo of tipos) {
      for (const d of reimpresiones.buscar(todos(tipo)).documentos) {
        const documento = { tipo, id: d.id, reimpresion: true, tirilla: true };
        expect(impresion.formato(documento)).toBe('tirilla');
        const html = impresion.html(documento);
        expect(html).toContain('size: 80mm auto');
        expect(html).toContain('REIMPRESION');
        expect(html.includes('>ANULAD')).toBe(d.anulado);
        expect(html.includes('CORREGIDA')).toBe(d.version > 1);
      }
    }
  });
});
