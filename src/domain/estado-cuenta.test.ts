import { describe, expect, it } from 'vitest';
import { nombreArchivoEstadoCuenta } from '../shared/estadoCuenta';
import {
  armarEstadoCuenta,
  cantidadCorta,
  claveDeFavor,
  textoSaldoNeto,
  type AbonoCuenta,
  type EntradaEstadoCuenta,
  type FacturaCuenta,
} from './estado-cuenta';

/**
 * Momento ISO de un día a una hora.
 *
 * @param dia - Día `AAAA-MM-DD`.
 * @param hora - Hora `HH:MM`.
 * @returns Momento con desfase de Colombia.
 */
function en(dia: string, hora = '10:00'): string {
  return `${dia}T${hora}:00.000-05:00`;
}

/**
 * Factura con valores por defecto.
 *
 * @param datos - Campos a fijar.
 * @returns Factura.
 */
function factura(
  datos: Partial<FacturaCuenta> & Pick<FacturaCuenta, 'id' | 'numero' | 'dia'>,
): FacturaCuenta {
  return {
    referencia: '',
    saldoInicial: false,
    contado: false,
    momento: en(datos.dia),
    plazoDias: 8,
    vence: datos.dia,
    totalInicial: 0,
    anuladaEn: null,
    motivoAnulacion: '',
    ...datos,
  };
}

/**
 * Abono con valores por defecto.
 *
 * @param datos - Campos a fijar.
 * @returns Abono.
 */
function abono(
  datos: Partial<AbonoCuenta> & Pick<AbonoCuenta, 'id' | 'numero' | 'dia' | 'aplicaciones'>,
): AbonoCuenta {
  return {
    momento: en(datos.dia, '11:00'),
    formaPago: 'Efectivo',
    conSaldoFavor: false,
    contado: false,
    anuladoEn: null,
    motivoAnulacion: '',
    ...datos,
  };
}

/** Entrada vacía de un periodo. */
const VACIA: Omit<EntradaEstadoCuenta, 'tipo'> = {
  desde: '2026-09-01',
  hasta: '2026-10-04',
  facturas: [],
  versiones: [],
  abonos: [],
  devoluciones: [],
  reintegros: [],
  favor: [],
};

/** Maqueta docs/maquetas/estado-cuenta.html: cliente 10001 JUAN JJ FERTILIA. */
const JUAN: EntradaEstadoCuenta = {
  ...VACIA,
  tipo: 'cliente',
  facturas: [
    factura({
      id: 1,
      numero: 84765,
      dia: '2026-09-09',
      vence: '2026-09-17',
      totalInicial: 44_500,
    }),
    factura({
      id: 2,
      numero: 84790,
      dia: '2026-10-03',
      vence: '2026-10-11',
      totalInicial: 52_500,
    }),
  ],
  versiones: [
    {
      id: 7,
      facturaId: 1,
      version: 2,
      momento: en('2026-09-15'),
      totalAnterior: 44_500,
      totalNuevo: 39_000,
    },
  ],
  abonos: [
    abono({
      id: 1,
      numero: 33,
      dia: '2026-09-12',
      aplicaciones: [{ facturaId: 1, valor: 44_500 }],
    }),
    abono({
      id: 2,
      numero: 58,
      dia: '2026-10-03',
      formaPago: 'Transferencia',
      aplicaciones: [{ facturaId: 2, valor: 20_000 }],
    }),
  ],
  favor: [
    {
      documentoTipo: 'correccion_venta',
      documentoId: 7,
      momento: en('2026-09-15'),
      valor: 5_500,
      facturaId: 1,
    },
  ],
};

/** Maqueta docs/maquetas/estado-cuenta.html: proveedor 10001 AGRINA S.A.S. */
const AGRINA: EntradaEstadoCuenta = {
  ...VACIA,
  tipo: 'proveedor',
  facturas: [
    factura({
      id: 1,
      numero: 31,
      referencia: 'FE-5521',
      dia: '2026-08-25',
      plazoDias: 30,
      vence: '2026-09-24',
      totalInicial: 2_602_000,
    }),
    factura({
      id: 2,
      numero: 36,
      referencia: 'FE-5698',
      dia: '2026-09-22',
      plazoDias: 30,
      vence: '2026-10-22',
      totalInicial: 1_188_000,
    }),
    factura({
      id: 3,
      numero: 37,
      referencia: 'FE-5730',
      dia: '2026-09-28',
      contado: true,
      plazoDias: 0,
      vence: '2026-09-28',
      totalInicial: 960_000,
    }),
  ],
  versiones: [
    {
      id: 9,
      facturaId: 3,
      version: 2,
      momento: en('2026-09-29'),
      totalAnterior: 960_000,
      totalNuevo: 924_400,
    },
  ],
  abonos: [
    abono({
      id: 1,
      numero: 12,
      dia: '2026-09-05',
      formaPago: 'Transferencia',
      aplicaciones: [{ facturaId: 1, valor: 1_500_000 }],
    }),
    // El abono automático se guarda en el mismo momento que la compra de contado.
    abono({
      id: 2,
      numero: 22,
      dia: '2026-09-28',
      momento: en('2026-09-28'),
      contado: true,
      aplicaciones: [{ facturaId: 3, valor: 960_000 }],
    }),
  ],
  devoluciones: [
    {
      id: 4,
      numero: 2,
      facturaId: 3,
      dia: '2026-10-01',
      momento: en('2026-10-01'),
      total: 89_500,
      lineas: [{ cantidad: 5_000, unidad: 'KG', nombre: 'QUESO MOZZARELLA' }],
      anuladaEn: null,
      motivoAnulacion: '',
    },
  ],
  favor: [
    {
      documentoTipo: 'correccion_compra',
      documentoId: 9,
      momento: en('2026-09-29'),
      valor: 35_600,
      facturaId: 3,
    },
    {
      documentoTipo: 'devolucion',
      documentoId: 4,
      momento: en('2026-10-01'),
      valor: 89_500,
      facturaId: 3,
    },
  ],
};

/**
 * Renglones como en la maqueta: fecha, documento, detalle, cargo, abono y saldo en texto.
 *
 * @param entrada - Entrada.
 * @returns Renglones.
 */
function renglones(entrada: EntradaEstadoCuenta): string[][] {
  return armarEstadoCuenta(entrada).movimientos.map((m) => [
    m.fecha,
    m.documento,
    m.detalle,
    m.cargo ? String(m.cargo) : '',
    m.abono ? String(m.abono) : '',
    textoSaldoNeto(m.saldo),
  ]);
}

describe('estado de cuenta (D-149): maqueta de JUAN JJ FERTILIA', () => {
  it('saldo anterior, movimientos con saldo corrido neto y totales', () => {
    const r = armarEstadoCuenta(JUAN);
    expect(r.saldoAnterior).toBe(0);
    expect(renglones(JUAN)).toEqual([
      ['2026-09-09', 'Factura 84765', 'Crédito 8 días, vence 17/09/2026', '44500', '', '44,500'],
      ['2026-09-12', 'Abono 33', 'Efectivo · aplicado a 84765', '', '44500', '0'],
      [
        '2026-09-15',
        'Factura 84765 v2',
        'Corrección: total 44,500 → 39,000; 5,500 a favor',
        '',
        '5500',
        'A favor 5,500',
      ],
      ['2026-10-03', 'Factura 84790', 'Crédito 8 días, vence 11/10/2026', '52500', '', '47,000'],
      ['2026-10-03', 'Abono 58', 'Transferencia · aplicado a 84790', '', '20000', '27,000'],
    ]);
    expect([r.cargos, r.abonos, r.saldoFinal]).toEqual([97_000, 70_000, 27_000]);
  });

  it('pendientes al último día con sus días y el resumen', () => {
    const r = armarEstadoCuenta(JUAN);
    expect(r.pendientes).toEqual([
      {
        documento: 'Factura 84790',
        fecha: '2026-10-03',
        vence: '2026-10-11',
        vencida: false,
        dias: 7,
        total: 52_500,
        abonado: 20_000,
        devuelto: 0,
        saldo: 32_500,
      },
    ]);
    expect(r.resumen).toEqual({ pendiente: 32_500, vencido: 0, saldoFavor: 5_500, neto: 27_000 });
  });
});

describe('estado de cuenta (D-149): maqueta de AGRINA S.A.S.', () => {
  it('saldo anterior, compra de contado con su abono, corrección y devolución', () => {
    const r = armarEstadoCuenta(AGRINA);
    expect(r.saldoAnterior).toBe(2_602_000);
    expect(renglones(AGRINA)).toEqual([
      [
        '2026-09-05',
        'Abono 12',
        'Transferencia · aplicado a compra 31 (FE-5521)',
        '',
        '1500000',
        '1,102,000',
      ],
      [
        '2026-09-22',
        'Compra 36',
        'FE-5698 · crédito 30 días, vence 22/10/2026',
        '1188000',
        '',
        '2,290,000',
      ],
      ['2026-09-28', 'Compra 37', 'FE-5730 · pagada de contado', '960000', '', '3,250,000'],
      [
        '2026-09-28',
        'Abono 22',
        'Efectivo · pago de contado de la compra 37',
        '',
        '960000',
        '2,290,000',
      ],
      [
        '2026-09-29',
        'Compra 37 v2',
        'Corrección: total 960,000 → 924,400; 35,600 a favor',
        '',
        '35600',
        '2,254,400',
      ],
      [
        '2026-10-01',
        'Devolución de compra 2',
        'Compra 37 · 5 KG QUESO MOZZARELLA; 89,500 a favor',
        '',
        '89500',
        '2,164,900',
      ],
    ]);
    expect([r.cargos, r.abonos, r.saldoFinal]).toEqual([2_148_000, 2_585_100, 2_164_900]);
  });

  it('pendientes con «Vencida 10» y «Faltan 18», saldo a favor del negocio y neto', () => {
    const r = armarEstadoCuenta(AGRINA);
    expect(
      r.pendientes.map((p) => [
        p.documento,
        p.vencida,
        p.dias,
        p.total,
        p.abonado,
        p.devuelto,
        p.saldo,
      ]),
    ).toEqual([
      ['Compra 31 · FE-5521', true, 10, 2_602_000, 1_500_000, 0, 1_102_000],
      ['Compra 36 · FE-5698', false, 18, 1_188_000, 0, 0, 1_188_000],
    ]);
    expect(r.resumen).toEqual({
      pendiente: 2_290_000,
      vencido: 1_102_000,
      saldoFavor: 125_100,
      neto: 2_164_900,
    });
  });

  it('lo posterior a «hasta» no cuenta y los pendientes se calculan a ese día', () => {
    const r = armarEstadoCuenta({ ...AGRINA, hasta: '2026-09-28' });
    expect(r.movimientos.map((m) => m.documento)).toEqual([
      'Abono 12',
      'Compra 36',
      'Compra 37',
      'Abono 22',
    ]);
    expect(r.resumen).toEqual({
      pendiente: 2_290_000,
      vencido: 1_102_000,
      saldoFavor: 0,
      neto: 2_290_000,
    });
    expect(r.pendientes[0]).toMatchObject({ vencida: true, dias: 4 });
  });

  it('el periodo puede empezar después de todo: solo queda el saldo anterior', () => {
    const r = armarEstadoCuenta({ ...AGRINA, desde: '2026-10-02', hasta: '2026-10-04' });
    expect(r.saldoAnterior).toBe(2_164_900);
    expect(r.movimientos).toEqual([]);
    expect(r.saldoFinal).toBe(2_164_900);
  });
});

describe('estado de cuenta: anulaciones, saldo a favor y reintegros', () => {
  /** Factura de 100,000 con un abono de 60,000. */
  const base: EntradaEstadoCuenta = {
    ...VACIA,
    tipo: 'cliente',
    facturas: [
      factura({
        id: 1,
        numero: 500,
        dia: '2026-09-02',
        vence: '2026-09-10',
        totalInicial: 100_000,
        anuladaEn: en('2026-09-20', '15:00'),
        motivoAnulacion: 'Se facturó al cliente equivocado',
      }),
      factura({ id: 2, numero: 501, dia: '2026-09-25', vence: '2026-10-03', totalInicial: 30_000 }),
    ],
    abonos: [
      abono({
        id: 1,
        numero: 4,
        dia: '2026-09-05',
        aplicaciones: [{ facturaId: 1, valor: 60_000 }],
      }),
      abono({
        id: 2,
        numero: 5,
        dia: '2026-09-26',
        formaPago: 'Saldo a favor',
        conSaldoFavor: true,
        aplicaciones: [{ facturaId: 2, valor: 30_000 }],
      }),
    ],
    reintegros: [
      {
        id: 1,
        numero: 3,
        dia: '2026-09-28',
        momento: en('2026-09-28'),
        sentido: 'entrega',
        formaPago: 'Efectivo',
        valor: 10_000,
        anuladoEn: en('2026-09-29'),
        motivoAnulacion: 'No vino a recogerlo',
      },
    ],
    favor: [
      {
        documentoTipo: 'anulacion_venta',
        documentoId: 1,
        momento: en('2026-09-20', '15:00'),
        valor: 60_000,
        facturaId: 1,
      },
      {
        documentoTipo: 'abono',
        documentoId: 2,
        momento: en('2026-09-26', '11:00'),
        valor: -30_000,
        facturaId: null,
      },
      {
        documentoTipo: 'reintegro',
        documentoId: 1,
        momento: en('2026-09-28'),
        valor: -10_000,
        facturaId: null,
      },
      {
        documentoTipo: 'anulacion_reintegro',
        documentoId: 1,
        momento: en('2026-09-29'),
        valor: 10_000,
        facturaId: null,
      },
    ],
  };

  it('la anulación cancela el saldo y lo abonado pasa a favor; pagar con saldo a favor no mueve el neto', () => {
    const r = armarEstadoCuenta(base);
    expect(renglones(base)).toEqual([
      ['2026-09-02', 'Factura 500', 'Crédito 8 días, vence 10/09/2026', '100000', '', '100,000'],
      ['2026-09-05', 'Abono 4', 'Efectivo · aplicado a 500', '', '60000', '40,000'],
      [
        '2026-09-20',
        'Factura 500',
        'Anulación · Se facturó al cliente equivocado; 60,000 a favor',
        '',
        '100000',
        'A favor 60,000',
      ],
      [
        '2026-09-25',
        'Factura 501',
        'Crédito 8 días, vence 03/10/2026',
        '30000',
        '',
        'A favor 30,000',
      ],
      ['2026-09-26', 'Abono 5', 'Saldo a favor · aplicado a 501', '', '', 'A favor 30,000'],
      [
        '2026-09-28',
        'Reintegro 3',
        'Efectivo · se entregó del saldo a favor',
        '10000',
        '',
        'A favor 20,000',
      ],
      [
        '2026-09-29',
        'Reintegro 3',
        'Anulación · No vino a recogerlo; 10,000 a favor',
        '',
        '10000',
        'A favor 30,000',
      ],
    ]);
    expect(r.movimientos[0]?.marca).toBe('ANULADA');
    expect(r.movimientos[5]?.marca).toBe('ANULADO');
    expect(r.pendientes).toEqual([]);
    expect(r.resumen).toEqual({ pendiente: 0, vencido: 0, saldoFavor: 30_000, neto: -30_000 });
    expect(r.saldoFinal).toBe(-30_000);
  });

  it('la marca no se pone si la anulación es posterior a «hasta»', () => {
    const r = armarEstadoCuenta({ ...base, hasta: '2026-09-10' });
    expect(r.movimientos[0]?.marca).toBe('');
    expect(r.pendientes.map((p) => [p.documento, p.saldo, p.vencida, p.dias])).toEqual([
      ['Factura 500', 40_000, false, 0],
    ]);
  });

  it('abono repartido y anulado: vuelve a deber lo que pagaba', () => {
    const entrada: EntradaEstadoCuenta = {
      ...VACIA,
      tipo: 'proveedor',
      facturas: [
        factura({ id: 1, numero: 5, referencia: 'A-1', dia: '2026-09-01', totalInicial: 50_000 }),
        factura({ id: 2, numero: 6, referencia: 'A-2', dia: '2026-09-02', totalInicial: 40_000 }),
      ],
      abonos: [
        abono({
          id: 1,
          numero: 9,
          dia: '2026-09-03',
          aplicaciones: [
            { facturaId: 1, valor: 50_000 },
            { facturaId: 2, valor: 10_000 },
          ],
          anuladoEn: en('2026-09-04'),
          motivoAnulacion: 'Cheque devuelto',
        }),
      ],
    };
    const r = armarEstadoCuenta(entrada);
    expect(
      r.movimientos.map((m) => [m.documento, m.marca, m.detalle, m.cargo, m.abono, m.saldo]),
    ).toEqual([
      ['Compra 5', '', 'A-1 · crédito 8 días, vence 01/09/2026', 50_000, 0, 50_000],
      ['Compra 6', '', 'A-2 · crédito 8 días, vence 02/09/2026', 40_000, 0, 90_000],
      [
        'Abono 9',
        'ANULADO',
        'Efectivo · aplicado a compra 5 (A-1) por 50,000 y compra 6 (A-2) por 10,000',
        0,
        60_000,
        30_000,
      ],
      ['Abono 9', '', 'Anulación · Cheque devuelto', 60_000, 0, 90_000],
    ]);
    expect(r.pendientes.map((p) => [p.abonado, p.saldo])).toEqual([
      [0, 50_000],
      [0, 40_000],
    ]);
  });

  it('devolución de varias líneas y su anulación', () => {
    const entrada: EntradaEstadoCuenta = {
      ...VACIA,
      tipo: 'cliente',
      facturas: [
        factura({
          id: 1,
          numero: 700,
          dia: '2026-09-01',
          totalInicial: 90_000,
          vence: '2026-09-30',
        }),
      ],
      devoluciones: [
        {
          id: 1,
          numero: 3,
          facturaId: 1,
          dia: '2026-09-05',
          momento: en('2026-09-05'),
          total: 30_000,
          lineas: [
            { cantidad: 2_000, unidad: 'UND', nombre: 'CAJA PIZZA' },
            { cantidad: 1_250, unidad: 'KG', nombre: 'QUESO' },
            { cantidad: 1_000, unidad: 'UND', nombre: 'VASO' },
          ],
          anuladaEn: en('2026-09-06'),
          motivoAnulacion: '',
        },
      ],
    };
    expect(renglones(entrada).slice(1)).toEqual([
      [
        '2026-09-05',
        'Devolución de venta 3',
        'Factura 700 · 2 UND CAJA PIZZA, 1.25 KG QUESO y 1 producto más',
        '',
        '30000',
        '60,000',
      ],
      ['2026-09-06', 'Devolución de venta 3', 'Anulación', '30000', '', '90,000'],
    ]);
  });

  it('un movimiento de saldo a favor sin documento conocido no se pierde', () => {
    const r = armarEstadoCuenta({
      ...VACIA,
      tipo: 'cliente',
      favor: [
        {
          documentoTipo: 'otro',
          documentoId: 1,
          momento: en('2026-09-10'),
          valor: 1_000,
          facturaId: null,
        },
      ],
    });
    expect(r.movimientos).toEqual([
      {
        fecha: '2026-09-10',
        documento: '',
        marca: '',
        detalle: 'Movimiento de saldo a favor; 1,000 a favor',
        cargo: 0,
        abono: 1_000,
        saldo: -1_000,
      },
    ]);
  });
});

describe('estado de cuenta: textos y nombre del archivo', () => {
  it('claves del libro, cantidades cortas y saldo neto', () => {
    expect(claveDeFavor('anulacion_compra', 3)).toBe('anulacion-factura:3');
    expect(claveDeFavor('anulacion_abono', 8)).toBe('anulacion-abono:8');
    expect(cantidadCorta(5_000, 'KG')).toBe('5');
    expect(cantidadCorta(1_500, 'KG')).toBe('1.5');
    expect(cantidadCorta(12_000, 'UND')).toBe('12');
    expect(textoSaldoNeto(0)).toBe('0');
    expect(textoSaldoNeto(-5_500)).toBe('A favor 5,500');
  });

  it('el PDF lleva el tercero y la fecha, sin caracteres que Windows no admite', () => {
    expect(nombreArchivoEstadoCuenta('JUAN JJ FERTILIA', '2026-10-04')).toBe(
      'Estado de cuenta JUAN JJ FERTILIA 04-10-2026.pdf',
    );
    expect(nombreArchivoEstadoCuenta('AGRINA S.A.S.', '2026-10-04')).toBe(
      'Estado de cuenta AGRINA S.A.S. 04-10-2026.pdf',
    );
    expect(nombreArchivoEstadoCuenta('A/B: "C" <D>', '2026-01-31')).toBe(
      'Estado de cuenta A B C D 31-01-2026.pdf',
    );
    expect(nombreArchivoEstadoCuenta('1/2\\3:4*5?6"7<8>9|0\tFIN', '2026-01-31')).toBe(
      'Estado de cuenta 1 2 3 4 5 6 7 8 9 0 FIN 31-01-2026.pdf',
    );
  });
});
