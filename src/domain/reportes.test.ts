import { describe, expect, it } from 'vitest';
import type { PeticionInventario, TerceroReporte } from '../shared/reportes';
import {
  armarCartera,
  armarInventario,
  estadoVencimiento,
  textoDias,
  type DocumentoPendiente,
  type EntradaCartera,
  type ProductoInventario,
} from './reportes';

/** Día de hoy de las pruebas. */
const HOY = '2026-10-04';

/**
 * Crea un tercero de prueba.
 *
 * @param codigo - Código.
 * @param nombre - Nombre.
 * @returns Tercero.
 */
function tercero(codigo: number, nombre: string): TerceroReporte {
  return { codigo, nombre, identificacion: 'CC 1', celular: '', tope: null };
}

/**
 * Crea un documento pendiente de prueba.
 *
 * @param id - Id.
 * @param terceroCodigo - Tercero.
 * @param vence - Vencimiento.
 * @param saldo - Saldo.
 * @param extra - Campos a cambiar.
 * @returns Documento.
 */
function doc(
  id: number,
  terceroCodigo: number,
  vence: string,
  saldo: number,
  extra: Partial<DocumentoPendiente> = {},
): DocumentoPendiente {
  return {
    id,
    terceroCodigo,
    numero: 100 + id,
    referencia: '',
    saldoInicial: false,
    fecha: '2026-09-01',
    vence,
    total: saldo,
    abonado: 0,
    saldo,
    ...extra,
  };
}

/**
 * Entrada de cartera con los datos de la maqueta aprobada (cuentas.html).
 *
 * @param filtros - Filtros a cambiar.
 * @returns Entrada.
 */
function entradaMaqueta(filtros: Partial<EntradaCartera['filtros']> = {}): EntradaCartera {
  return {
    hoy: HOY,
    terceros: [
      tercero(10001, 'JUAN JJ FERTILIA'),
      tercero(10002, 'PIZZERIA LA NONNA S.A.S.'),
      tercero(10003, 'RESTAURANTE EL FOGON'),
      tercero(10004, 'ASADERO DON POLLO'),
      tercero(10006, 'HOTEL BRISAS DEL MAR'),
    ],
    documentos: [
      doc(1, 10001, '2026-10-11', 32_500, { total: 52_500, abonado: 20_000 }),
      doc(2, 10002, '2026-09-29', 202_700, { total: 540_500, abonado: 300_000 }),
      doc(3, 10002, '2026-09-09', 120_000, { saldoInicial: true }),
      doc(4, 10004, '2026-10-12', 66_750),
      doc(5, 10004, '2026-09-12', 227_800),
      doc(6, 10006, '2026-10-24', 161_600),
      doc(7, 10001, '2026-10-30', 0),
    ],
    saldosFavor: new Map([
      [10001, 5_500],
      [10003, 23_000],
    ]),
    filtros: { terceroCodigo: null, soloVencidas: false, incluirSoloFavor: true, ...filtros },
  };
}

describe('estadoVencimiento y textoDias', () => {
  it('cuenta los días vencidos, el día de hoy y los que faltan', () => {
    expect(estadoVencimiento('2026-09-29', HOY)).toEqual({ vencida: true, dias: 5 });
    expect(estadoVencimiento(HOY, HOY)).toEqual({ vencida: false, dias: 0 });
    expect(estadoVencimiento('2026-10-12', HOY)).toEqual({ vencida: false, dias: 8 });
    expect(textoDias({ vencida: true, dias: 5 })).toBe('Vencida 5');
    expect(textoDias({ vencida: false, dias: 0 })).toBe('Vence hoy');
    expect(textoDias({ vencida: false, dias: 8 })).toBe('Faltan 8');
  });
});

describe('armarCartera', () => {
  it('ordena los grupos por el vencimiento más antiguo y deja al final los de solo saldo a favor', () => {
    const { grupos } = armarCartera(entradaMaqueta());
    expect(grupos.map((g) => g.tercero.codigo)).toEqual([10002, 10004, 10001, 10006, 10003]);
    expect(grupos[0]?.documentos.map((d) => d.id)).toEqual([3, 2]);
    expect(grupos[1]?.documentos.map((d) => d.id)).toEqual([5, 4]);
  });

  it('cuenta las facturas vencidas y por vencer sin contar las de saldo cero', () => {
    const { resumen } = armarCartera(entradaMaqueta());
    expect(resumen).toEqual({
      total: 811_350,
      vencido: 550_500,
      porVencer: 260_850,
      documentosVencidos: 3,
      documentosPorVencer: 3,
      saldoFavor: 28_500,
      neto: 782_850,
      terceros: 5,
    });
  });

  it('calcula subtotales, neto y devuelto por documento', () => {
    const { grupos } = armarCartera(entradaMaqueta());
    const juan = grupos.find((g) => g.tercero.codigo === 10001);
    expect(juan).toMatchObject({ saldo: 32_500, vencido: 0, saldoFavor: 5_500, neto: 27_000 });
    const nonna = grupos[0];
    expect(nonna).toMatchObject({ saldo: 322_700, vencido: 322_700 });
    expect(nonna?.documentos[1]).toMatchObject({ devuelto: 37_800, vencida: true, dias: 5 });
  });

  it('«Solo vencidas» quita los documentos por vencer y los grupos que quedan vacíos', () => {
    const { grupos, resumen } = armarCartera(
      entradaMaqueta({ soloVencidas: true, incluirSoloFavor: false }),
    );
    expect(grupos.map((g) => g.tercero.codigo)).toEqual([10002, 10004]);
    expect(resumen.documentosPorVencer).toBe(0);
    expect(resumen.total).toBe(550_500);
  });

  it('con «Solo vencidas», quien tiene saldo a favor y solo facturas por vencer no aparece como «solo a favor»', () => {
    const { grupos } = armarCartera(entradaMaqueta({ soloVencidas: true }));
    expect(grupos.map((g) => g.tercero.codigo)).toEqual([10002, 10004, 10003]);
  });

  it('filtra por tercero y respeta la casilla de saldo a favor', () => {
    expect(armarCartera(entradaMaqueta({ terceroCodigo: 10004 })).grupos).toHaveLength(1);
    const soloFavor = armarCartera(entradaMaqueta({ terceroCodigo: 10003 }));
    expect(soloFavor.grupos[0]).toMatchObject({ saldo: 0, saldoFavor: 23_000, neto: -23_000 });
    expect(
      armarCartera(entradaMaqueta({ terceroCodigo: 10003, incluirSoloFavor: false })).grupos,
    ).toEqual([]);
  });

  it('desempata por nombre cuando dos terceros tienen el mismo vencimiento más antiguo', () => {
    const entrada = entradaMaqueta();
    entrada.documentos = [doc(1, 10006, '2026-09-01', 10), doc(2, 10004, '2026-09-01', 10)];
    entrada.saldosFavor = new Map();
    expect(armarCartera(entrada).grupos.map((g) => g.tercero.nombre)).toEqual([
      'ASADERO DON POLLO',
      'HOTEL BRISAS DEL MAR',
    ]);
  });
});

describe('armarInventario', () => {
  const bodegas = [
    { id: 1, nombre: 'Principal' },
    { id: 2, nombre: 'Norte' },
  ];
  const productos: ProductoInventario[] = [
    {
      codigo: 2,
      nombre: 'Caja pizza',
      unidad: 'UND',
      proveedorCodigo: 1,
      proveedorNombre: 'Agrina',
      costo: 1_000,
      activo: true,
    },
    {
      codigo: 1,
      nombre: 'Queso',
      unidad: 'KG',
      proveedorCodigo: 2,
      proveedorNombre: 'Campiña',
      costo: 20_000,
      activo: true,
    },
    {
      codigo: 3,
      nombre: 'Vaso',
      unidad: 'UND',
      proveedorCodigo: 1,
      proveedorNombre: 'Agrina',
      costo: 150,
      activo: true,
    },
    {
      codigo: 4,
      nombre: 'Tapa vieja',
      unidad: 'UND',
      proveedorCodigo: 1,
      proveedorNombre: 'Agrina',
      costo: 50,
      activo: false,
    },
    {
      codigo: 5,
      nombre: 'Salsa',
      unidad: 'UND',
      proveedorCodigo: 2,
      proveedorNombre: 'Campiña',
      costo: 300,
      activo: true,
    },
  ];
  const existencias = [
    { productoCodigo: 2, bodegaId: 1, cantidad: 10_000 },
    { productoCodigo: 2, bodegaId: 2, cantidad: -2_000 },
    { productoCodigo: 1, bodegaId: 1, cantidad: 1_250 },
    { productoCodigo: 3, bodegaId: 2, cantidad: -3_000 },
    { productoCodigo: 4, bodegaId: 1, cantidad: 7_000 },
  ];
  const filtros: PeticionInventario = {
    bodegaId: null,
    proveedorCodigo: null,
    texto: '',
    mostrarSinExistencia: false,
    incluirInactivos: false,
  };

  it('valora cada par producto-bodega y suma al total solo los positivos', () => {
    const r = armarInventario({ productos, existencias, bodegas, filtros });
    expect(r.filas.map((f) => f.codigo)).toEqual([1, 2, 3]);
    expect(r.filas[0]).toMatchObject({
      porBodega: [1_250, 0],
      existencia: 1_250,
      valor: 25_000,
      valorNegativo: 0,
    });
    expect(r.filas[1]).toMatchObject({
      porBodega: [10_000, -2_000],
      existencia: 8_000,
      valor: 10_000,
      valorNegativo: -2_000,
    });
    expect(r.filas[2]).toMatchObject({ existencia: -3_000, valor: 0, valorNegativo: -450 });
    expect(r.resumen).toEqual({
      productosConExistencia: 2,
      valorPorBodega: [35_000, 0],
      valorTotal: 35_000,
      productosNegativos: 2,
      valorNegativo: -2_450,
    });
  });

  it('una sola bodega deja una columna y no mira las demás', () => {
    const r = armarInventario({
      productos,
      existencias,
      bodegas,
      filtros: { ...filtros, bodegaId: 2 },
    });
    expect(r.bodegas).toEqual([{ id: 2, nombre: 'Norte' }]);
    expect(r.filas.map((f) => f.codigo)).toEqual([2, 3]);
    expect(r.resumen.valorTotal).toBe(0);
    expect(r.resumen.productosNegativos).toBe(2);
  });

  it('filtra por proveedor, por texto sin tildes ni mayúsculas, sin existencia e inactivos', () => {
    const porProveedor = armarInventario({
      productos,
      existencias,
      bodegas,
      filtros: { ...filtros, proveedorCodigo: 2 },
    });
    expect(porProveedor.filas.map((f) => f.codigo)).toEqual([1]);
    const conSinExistencia = armarInventario({
      productos,
      existencias,
      bodegas,
      filtros: { ...filtros, proveedorCodigo: 2, mostrarSinExistencia: true },
    });
    expect(conSinExistencia.filas.map((f) => f.codigo)).toEqual([1, 5]);
    expect(
      armarInventario({ productos, existencias, bodegas, filtros: { ...filtros, texto: 'QUÉSO' } })
        .filas,
    ).toHaveLength(1);
    expect(
      armarInventario({ productos, existencias, bodegas, filtros: { ...filtros, texto: '3' } })
        .filas[0]?.codigo,
    ).toBe(3);
    const conInactivos = armarInventario({
      productos,
      existencias,
      bodegas,
      filtros: { ...filtros, incluirInactivos: true },
    });
    expect(conInactivos.resumen.valorTotal).toBe(35_350);
  });
});
