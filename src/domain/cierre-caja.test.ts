import { describe, expect, it } from 'vitest';
import type { CalculoCierre, ConceptoCierre } from '../shared/cierreCaja';
import {
  calcularTramo,
  columnasCierre,
  contadoInicial,
  efectivoARetirar,
  esperadoPorForma,
  exigirCierreAnulable,
  huellaCierre,
  textoDiferencia,
  totalConteo,
  ultimoCierreVigente,
  validarArqueo,
  type AbonoCaja,
  type EntradaTramo,
  type FormaPagoCaja,
  type ReintegroCaja,
  type VentaCaja,
} from './cierre-caja';
import { ErrorDeNegocio } from './errores';

/** Formas de pago: Efectivo calcula cambio; «Saldo a favor» es de sistema. */
const FORMAS: FormaPagoCaja[] = [
  { id: 1, nombre: 'Efectivo', calculaCambio: true, activo: true, esSistema: false },
  { id: 2, nombre: 'Transferencia', calculaCambio: false, activo: true, esSistema: false },
  { id: 3, nombre: 'Tarjeta', calculaCambio: false, activo: true, esSistema: false },
  { id: 4, nombre: 'Saldo a favor', calculaCambio: false, activo: true, esSistema: true },
];

/** Momento del cierre anterior (inicio del tramo). */
const DESDE = '2026-10-03T19:05:00.000-05:00';
/** Momento de guardar (fin del tramo). */
const HASTA = '2026-10-04T19:02:00.000-05:00';

/**
 * Momento del 4 de octubre a una hora.
 *
 * @param hora - Hora `HH:MM`.
 * @returns ISO con zona.
 */
function hoy(hora: string): string {
  return `2026-10-04T${hora}:00.000-05:00`;
}

/**
 * Venta de contado de prueba.
 *
 * @param id - Id y número.
 * @param formaPagoId - Forma.
 * @param total - Total.
 * @param momento - Momento.
 * @param anuladaEn - Anulación.
 * @returns La venta.
 */
function venta(
  id: number,
  formaPagoId: number,
  total: number,
  momento = hoy('10:00'),
  anuladaEn: string | null = null,
): VentaCaja {
  return {
    id,
    numero: 84_000 + id,
    tercero: 'CONSUMIDOR FINAL',
    formaPagoId,
    momento,
    total,
    anuladaEn,
  };
}

/**
 * Abono de prueba.
 *
 * @param id - Id y número.
 * @param datos - Campos a cambiar.
 * @returns El abono.
 */
function abono(id: number, datos: Partial<AbonoCaja>): AbonoCaja {
  return {
    id,
    tipo: 'cliente',
    numero: id,
    tercero: 'PIZZERIA LA NONNA',
    formaPagoId: 1,
    dia: '2026-10-04',
    registradoEn: hoy('11:00'),
    anuladoEn: null,
    valor: 10_000,
    deCompraContado: false,
    ...datos,
  };
}

/**
 * Reintegro de prueba.
 *
 * @param id - Id y número.
 * @param datos - Campos a cambiar.
 * @returns El reintegro.
 */
function reintegro(id: number, datos: Partial<ReintegroCaja>): ReintegroCaja {
  return {
    id,
    numero: id,
    tercero: 'JUAN JJ FERTILIA',
    sentido: 'entrega',
    origen: 'saldo_favor',
    documentoTipo: null,
    venta: null,
    formaPagoId: 1,
    momento: hoy('12:00'),
    anuladoEn: null,
    valor: 5_000,
    ...datos,
  };
}

/**
 * Calcula un tramo con valores por defecto.
 *
 * @param datos - Campos a cambiar.
 * @returns El cálculo.
 */
function tramo(datos: Partial<EntradaTramo>): CalculoCierre {
  return calcularTramo({
    desde: DESDE,
    hasta: HASTA,
    formas: FORMAS,
    ventas: [],
    abonos: [],
    reintegros: [],
    ...datos,
  });
}

/**
 * Valores de un concepto por forma.
 *
 * @param calculo - Cálculo.
 * @param concepto - Concepto.
 * @returns Valores en el orden de las columnas.
 */
function valores(calculo: CalculoCierre, concepto: ConceptoCierre): number[] {
  return calculo.filas.find((f) => f.concepto === concepto)?.valores ?? [];
}

describe('calcularTramo', () => {
  it('reproduce el cierre de la maqueta: conceptos, movimiento, esperado y retiro', () => {
    const calculo = tramo({
      ventas: [venta(1, 1, 845_300), venta(2, 2, 212_000), venta(3, 3, 96_500)],
      abonos: [
        abono(60, { valor: 120_000 }),
        abono(61, { valor: 250_000, formaPagoId: 2 }),
        abono(70, { tipo: 'proveedor', valor: 185_000, deCompraContado: true }),
        abono(71, { tipo: 'proveedor', valor: 150_000, formaPagoId: 2 }),
        // Abono 55 del cierre anterior, anulado hoy: anulación de días anteriores.
        abono(55, {
          valor: 30_000,
          registradoEn: '2026-10-03T16:00:00.000-05:00',
          anuladoEn: hoy('09:40'),
        }),
      ],
      reintegros: [
        reintegro(1, { sentido: 'recibe', valor: 8_000 }),
        reintegro(2, { valor: 59_500 }),
      ],
    });
    expect(calculo.formas.map((f) => f.nombre)).toEqual(['Efectivo', 'Transferencia', 'Tarjeta']);
    expect(valores(calculo, 'ventas')).toEqual([845_300, 212_000, 96_500]);
    expect(valores(calculo, 'abonosClientes')).toEqual([120_000, 250_000, 0]);
    expect(valores(calculo, 'reintegrosRecibe')).toEqual([8_000, 0, 0]);
    expect(valores(calculo, 'abonosProveedores')).toEqual([185_000, 150_000, 0]);
    expect(valores(calculo, 'reintegrosEntrega')).toEqual([59_500, 0, 0]);
    expect(valores(calculo, 'anulacionesAnteriores')).toEqual([-30_000, 0, 0]);
    expect(calculo.movimiento).toEqual([698_800, 312_000, 96_500]);
    const esperado = esperadoPorForma(calculo.formas, calculo.movimiento, 200_000);
    expect(esperado).toEqual([898_800, 312_000, 96_500]);
    const arqueo = validarArqueo({
      formas: calculo.formas,
      movimiento: calculo.movimiento,
      baseInicial: 200_000,
      contado: [
        { formaPagoId: 1, valor: 896_800 },
        { formaPagoId: 2, valor: 312_000 },
        { formaPagoId: 3, valor: 96_500 },
      ],
      conteo: null,
      baseQueda: 200_000,
      observacion: '  Faltante:  posible cambio mal dado ',
    });
    expect(arqueo.diferencia).toEqual([-2_000, 0, 0]);
    expect(textoDiferencia(arqueo.diferencia[0] ?? 0)).toBe('Faltan 2,000');
    expect(arqueo.observacion).toBe('Faltante: posible cambio mal dado');
    expect(efectivoARetirar(896_800, 200_000)).toBe(696_800);
  });

  it('solo cuenta lo registrado dentro del tramo (desde exclusivo, hasta inclusivo)', () => {
    const calculo = tramo({
      ventas: [
        venta(1, 1, 1_000, DESDE),
        venta(2, 1, 2_000, HASTA),
        venta(3, 1, 4_000, '2026-10-04T19:02:01.000-05:00'),
      ],
    });
    expect(valores(calculo, 'ventas')).toEqual([2_000, 0, 0]);
    expect(calculo.filas[0]?.cantidad).toBe(1);
  });

  it('compara momentos exactos aunque vengan con otra zona horaria', () => {
    // 00:30 UTC del 5 de octubre son las 7:30 p. m. del 4 en Colombia: después del corte.
    const calculo = tramo({ ventas: [venta(1, 1, 1_000, '2026-10-05T00:30:00.000Z')] });
    expect(valores(calculo, 'ventas')).toEqual([0, 0, 0]);
  });

  it('el primer cierre cubre todo lo anterior', () => {
    const calculo = tramo({
      desde: null,
      ventas: [venta(1, 1, 1_000, '2025-01-02T08:00:00.000-05:00'), venta(2, 2, 3_000)],
    });
    expect(valores(calculo, 'ventas')).toEqual([1_000, 3_000, 0]);
  });

  it('un abono anulado en el mismo tramo se compensa y no aparece', () => {
    const calculo = tramo({ abonos: [abono(1, { anuladoEn: hoy('15:00') })] });
    expect(calculo.documentos).toEqual([]);
    expect(calculo.movimiento).toEqual([0, 0, 0]);
  });

  it('un abono anulado después del corte sí cuenta (el cierre es a su momento)', () => {
    const calculo = tramo({
      abonos: [abono(1, { anuladoEn: '2026-10-05T08:00:00.000-05:00' })],
    });
    expect(valores(calculo, 'abonosClientes')).toEqual([10_000, 0, 0]);
  });

  it('la anulación de un abono a proveedor de un tramo anterior devuelve el dinero (+)', () => {
    const calculo = tramo({
      abonos: [
        abono(1, {
          tipo: 'proveedor',
          valor: 7_000,
          formaPagoId: 2,
          registradoEn: '2026-10-01T10:00:00.000-05:00',
          anuladoEn: hoy('08:00'),
        }),
      ],
    });
    expect(valores(calculo, 'anulacionesAnteriores')).toEqual([0, 7_000, 0]);
    expect(calculo.documentos[0]?.momento).toBe(hoy('08:00'));
  });

  it('una anulación de un documento que ya estaba anulado antes del tramo no aparece', () => {
    const calculo = tramo({
      abonos: [
        abono(1, {
          registradoEn: '2026-10-01T10:00:00.000-05:00',
          anuladoEn: '2026-10-02T10:00:00.000-05:00',
        }),
      ],
    });
    expect(calculo.documentos).toEqual([]);
  });

  it('los abonos con «Saldo a favor» no son dinero: se informan aparte', () => {
    const calculo = tramo({
      abonos: [abono(61, { formaPagoId: 4, valor: 5_500, tercero: 'JUAN JJ FERTILIA' })],
    });
    expect(calculo.formas.map((f) => f.id)).toEqual([1, 2, 3]);
    expect(calculo.movimiento).toEqual([0, 0, 0]);
    expect(calculo.saldoFavor).toEqual([
      { documento: 'Abono 61', tercero: 'JUAN JJ FERTILIA', valor: 5_500 },
    ]);
  });

  it('avisa de los abonos cuya fecha elegida no es la de registro', () => {
    const calculo = tramo({
      abonos: [abono(60, { dia: '2026-10-02', valor: 70_000 }), abono(62, {})],
    });
    expect(calculo.otraFecha).toEqual([
      {
        documento: 'Abono 60',
        tercero: 'PIZZERIA LA NONNA',
        valor: 70_000,
        formaPago: 'Efectivo',
        dia: '2026-10-02',
        registradoEn: hoy('11:00'),
      },
    ]);
  });

  it('una venta de contado anulada en el mismo tramo se compensa con todos sus reintegros', () => {
    const v = venta(1, 1, 50_000, hoy('09:00'), hoy('16:00'));
    const atado = { id: 1, numero: v.numero, momento: v.momento };
    const calculo = tramo({
      ventas: [v],
      reintegros: [
        reintegro(1, {
          origen: 'documento',
          documentoTipo: 'correccion_venta',
          venta: atado,
          sentido: 'recibe',
          valor: 4_000,
          momento: hoy('10:00'),
        }),
        reintegro(2, {
          origen: 'documento',
          documentoTipo: 'anulacion_venta',
          venta: atado,
          valor: 54_000,
          momento: hoy('16:00'),
        }),
      ],
    });
    expect(calculo.documentos).toEqual([]);
  });

  it('las correcciones de una venta de contado entran como reintegros', () => {
    const v = venta(1, 1, 50_000, hoy('09:00'));
    const calculo = tramo({
      ventas: [v],
      reintegros: [
        reintegro(1, {
          origen: 'documento',
          documentoTipo: 'devolucion',
          venta: { id: 1, numero: v.numero, momento: v.momento },
          valor: 6_000,
          momento: hoy('10:00'),
        }),
      ],
    });
    expect(valores(calculo, 'ventas')).toEqual([50_000, 0, 0]);
    expect(valores(calculo, 'reintegrosEntrega')).toEqual([6_000, 0, 0]);
    expect(calculo.movimiento).toEqual([44_000, 0, 0]);
    expect(calculo.documentos[1]?.ver).toEqual({
      tipo: 'factura-cliente',
      id: 1,
      numero: v.numero,
    });
  });

  it('anular una venta de un tramo anterior es una anulación de días anteriores', () => {
    const v = venta(1, 2, 50_000, '2026-10-02T09:00:00.000-05:00', hoy('10:00'));
    const calculo = tramo({
      ventas: [v],
      reintegros: [
        reintegro(1, {
          origen: 'documento',
          documentoTipo: 'anulacion_venta',
          venta: { id: 1, numero: v.numero, momento: v.momento },
          formaPagoId: 2,
          valor: 50_000,
          momento: hoy('10:00'),
        }),
      ],
    });
    expect(valores(calculo, 'ventas')).toEqual([0, 0, 0]);
    expect(valores(calculo, 'reintegrosEntrega')).toEqual([0, 0, 0]);
    expect(valores(calculo, 'anulacionesAnteriores')).toEqual([0, -50_000, 0]);
    expect(calculo.documentos[0]?.documento).toBe(`Factura ${v.numero}`);
  });

  it('una venta del tramo anulada después del corte cuenta y lo aclara', () => {
    const calculo = tramo({
      ventas: [venta(1, 1, 9_000, hoy('09:00'), '2026-10-05T09:00:00.000-05:00')],
    });
    expect(valores(calculo, 'ventas')).toEqual([9_000, 0, 0]);
    expect(calculo.documentos[0]?.nota).toContain('Anulada el 05/10/2026');
  });

  it('la anulación de un reintegro de saldo a favor de un tramo anterior lleva signo contrario', () => {
    const calculo = tramo({
      reintegros: [
        reintegro(1, {
          valor: 3_000,
          momento: '2026-10-02T10:00:00.000-05:00',
          anuladoEn: hoy('10:00'),
        }),
        reintegro(2, {
          sentido: 'recibe',
          valor: 1_000,
          momento: '2026-10-02T10:00:00.000-05:00',
          anuladoEn: hoy('11:00'),
        }),
      ],
    });
    expect(valores(calculo, 'anulacionesAnteriores')).toEqual([2_000, 0, 0]);
    expect(calculo.filas.find((f) => f.concepto === 'anulacionesAnteriores')?.cantidad).toBe(2);
  });

  it('ordena los documentos por momento', () => {
    const calculo = tramo({
      ventas: [venta(1, 1, 1_000, hoy('15:00')), venta(2, 1, 1_000, hoy('08:00'))],
    });
    expect(calculo.documentos.map((d) => d.clave)).toEqual(['v2', 'v1']);
  });

  it('la huella cambia si entra un documento nuevo', () => {
    const antes = tramo({ ventas: [venta(1, 1, 1_000)] });
    const despues = tramo({ ventas: [venta(1, 1, 1_000), venta(2, 1, 500)] });
    expect(huellaCierre(DESDE, antes)).toBe(
      huellaCierre(DESDE, tramo({ ventas: [venta(1, 1, 1_000)] })),
    );
    expect(huellaCierre(DESDE, antes)).not.toBe(huellaCierre(DESDE, despues));
  });
});

describe('columnasCierre', () => {
  it('incluye las inactivas solo si tienen movimiento y siempre la que lleva la base', () => {
    const formas: FormaPagoCaja[] = [
      { id: 1, nombre: 'Efectivo', calculaCambio: true, activo: false, esSistema: false },
      { id: 2, nombre: 'Cheque', calculaCambio: false, activo: false, esSistema: false },
      { id: 3, nombre: 'Nequi', calculaCambio: false, activo: false, esSistema: false },
    ];
    const columnas = columnasCierre(formas, new Set([3]));
    expect(columnas).toEqual([
      { id: 1, nombre: 'Efectivo', seCuenta: true, recibeBase: true },
      { id: 3, nombre: 'Nequi', seCuenta: false, recibeBase: false },
    ]);
  });

  it('exige una forma de pago que calcule el cambio', () => {
    expect(() =>
      columnasCierre(
        [{ id: 2, nombre: 'Transferencia', calculaCambio: false, activo: true, esSistema: false }],
        new Set(),
      ),
    ).toThrow(/calcula el cambio/);
  });
});

describe('arqueo', () => {
  const formas = columnasCierre(FORMAS, new Set());
  const base = {
    formas,
    movimiento: [100_000, -20_000, 0],
    baseInicial: 50_000,
    contado: [
      { formaPagoId: 1, valor: 150_500 },
      { formaPagoId: 2, valor: -20_000 },
      { formaPagoId: 3, valor: 0 },
    ],
    conteo: null,
    baseQueda: 50_000,
    observacion: '',
  };

  it('precarga lo esperado salvo en el efectivo, que se cuenta', () => {
    const esperado = esperadoPorForma(formas, base.movimiento, 50_000);
    expect(esperado).toEqual([150_000, -20_000, 0]);
    expect(contadoInicial(formas, esperado)).toEqual([null, -20_000, 0]);
  });

  it('admite sobrantes y formas con salida neta (negativas)', () => {
    const arqueo = validarArqueo(base);
    expect(arqueo.diferencia).toEqual([500, 0, 0]);
    expect(textoDiferencia(500)).toBe('Sobran 500');
    expect(textoDiferencia(0)).toBe('0');
  });

  it('la base que queda no puede ser mayor que el efectivo contado', () => {
    expect(() => validarArqueo({ ...base, baseQueda: 150_501 })).toThrow(
      /no puede ser mayor que el efectivo contado \(150,500\)/,
    );
  });

  it('exige el contado de cada forma, en pesos enteros y el efectivo no negativo', () => {
    expect(() => validarArqueo({ ...base, contado: base.contado.slice(0, 2) })).toThrow(
      /contado de «Tarjeta»/,
    );
    expect(() =>
      validarArqueo({
        ...base,
        contado: [{ formaPagoId: 1, valor: -1 }, ...base.contado.slice(1)],
      }),
    ).toThrow(/no puede ser negativo/);
    expect(() =>
      validarArqueo({
        ...base,
        contado: [{ formaPagoId: 1, valor: 10.5 }, ...base.contado.slice(1)],
      }),
    ).toThrow(ErrorDeNegocio);
  });

  it('el conteo de billetes debe sumar el efectivo contado y se guarda sin ceros', () => {
    const conteo = [
      { tipo: 'billete' as const, valor: 100_000, cantidad: 1 },
      { tipo: 'billete' as const, valor: 50_000, cantidad: 1 },
      { tipo: 'billete' as const, valor: 20_000, cantidad: 0 },
      { tipo: 'moneda' as const, valor: 500, cantidad: 1 },
    ];
    expect(totalConteo(conteo)).toBe(150_500);
    expect(validarArqueo({ ...base, conteo }).conteo).toHaveLength(3);
    expect(() => validarArqueo({ ...base, conteo: conteo.slice(0, 2) })).toThrow(
      /suma 150,000 y el efectivo contado es 150,500/,
    );
    expect(() =>
      validarArqueo({ ...base, conteo: [{ tipo: 'moneda', valor: 20_000, cantidad: 1 }] }),
    ).toThrow(/denominación 20,000 no es válida/);
  });
});

describe('anular cierres', () => {
  const cierres = [
    { numero: 9, estado: 'activo' as const },
    { numero: 10, estado: 'anulado' as const },
    { numero: 11, estado: 'activo' as const },
    { numero: 12, estado: 'anulado' as const },
  ];

  it('solo el último vigente se puede anular', () => {
    expect(ultimoCierreVigente(cierres)).toBe(11);
    expect(() => exigirCierreAnulable(cierres, 11)).not.toThrow();
    expect(() => exigirCierreAnulable(cierres, 9)).toThrow(
      /Solo se puede anular el último cierre \(el 11\)/,
    );
    expect(() => exigirCierreAnulable(cierres, 12)).toThrow(/ya está anulado/);
    expect(() => exigirCierreAnulable(cierres, 13)).toThrow(/no existe/);
    expect(ultimoCierreVigente([])).toBeNull();
  });
});
