import { describe, expect, it } from 'vitest';
import type { AbonoDetalle } from '../../data/repositorios/abonos.repo';
import type { FacturaClienteDetalle } from '../../data/repositorios/ventas.repo';
import type { FacturaProveedorParaCorregir } from '../../shared/correcciones';
import { tirillaFactura, tirillaFacturaProveedor, tirillaReciboAbono } from './tirilla';

/** Datos del negocio del encabezado. */
const negocio = {
  nombre: 'SALSAMENTARIA EL BUEN CIUDADANO',
  nit: '70694229-1',
  regimen: 'No responsable de IVA',
  direccion: 'CRA 31 # 120-54',
  telefono: '3001234567',
};

/** Factura a crédito parecida a la tirilla real del negocio (F-01 a F-09). */
const factura: FacturaClienteDetalle = {
  id: 1,
  numero: 84771,
  fecha: '2026-09-30T17:26:36.000-05:00',
  condicion: 'credito',
  plazoDias: 8,
  vence: '2026-10-08',
  total: 79_250,
  ahorro: 12_000,
  formaPagoNombre: null,
  recibido: null,
  cambio: null,
  cajasEmpaque: null,
  saldo: 79_250,
  estado: 'activa',
  version: 1,
  correccion: null,
  cliente: {
    codigo: 10065,
    nombre: 'JUAN <JJ> FERTILIA',
    tipoIdentificacion: 'CC',
    numeroIdentificacion: '212121354',
    direccion: 'CARR 25 #122-04',
    barrio: 'LA PRADERA',
    ciudad: '',
    celular: '3042620852',
  },
  lineas: [
    {
      productoCodigo: 1,
      productoNombre: 'MORTADELA',
      unidad: 'UND',
      escala: 'mayor',
      cantidad: 4000,
      precioEscala: 14_500,
      precio: 14_500,
      alterado: false,
      total: 58_000,
      costo: 12_000,
    },
    {
      productoCodigo: 2,
      productoNombre: 'QUESO COSTEÑO',
      unidad: 'KG',
      escala: 'menor',
      cantidad: 1250,
      precioEscala: 17_000,
      precio: 17_000,
      alterado: false,
      total: 21_250,
      costo: 14_000,
    },
  ],
};

describe('tirillaFactura', () => {
  it('imprime la factura a crédito con el formato de la tirilla actual', () => {
    const html = tirillaFactura({ negocio, factura, reimpresion: false });
    expect(html).toContain("default-src 'none'; style-src 'unsafe-inline'");
    expect(html).toContain('size: 80mm auto');
    expect(html).toContain('SALSAMENTARIA EL BUEN CIUDADANO');
    expect(html).toContain('NO RESPONSABLE DE IVA');
    expect(html).toContain('FACTURA DE VENTA');
    expect(html).toContain('84771');
    expect(html).toContain('Fecha Generación: 30/09/2026 05:26:36 PM');
    expect(html).toContain('Fecha Expedición: 30/09/2026 05:26:36 PM');
    expect(html).toContain('CREDITO, 8 DIAS');
    expect(html).toContain('08/10/2026');
    expect(html).toContain('CLIENTE: 10065-JUAN &lt;JJ&gt; FERTILIA');
    expect(html).toContain('NIT: 212121354');
    expect(html).toContain('BARRIO: LA PRADERA');
    expect(html).not.toContain('CIUDAD:');
    expect(html).toContain('x UNIDAD');
    expect(html).toContain('x KILO');
    expect(html).toContain('4.000');
    expect(html).toContain('1.250');
    expect(html).toContain('58,000');
    expect(html).toContain('LINEAS: 2');
    expect(html).toContain('SON: SETENTA Y NUEVE MIL DOSCIENTOS CINCUENTA PESOS M/L');
    expect(html).toContain('SALDO CREDITO</span><span>79,250');
    expect(html).toContain('SU AHORRO FUE DE: $12,000');
    expect(html).toContain('GRACIAS POR SU COMPRA');
    expect(html).toContain('No.Cajas Empaque: ______');
    expect(html).not.toContain('NDEF');
    expect(html).not.toContain('REIMPRESION');
    expect(html).not.toContain('<script');
  });

  it('imprime el contado con forma de pago, cambio y sin ahorro', () => {
    const html = tirillaFactura({
      negocio,
      factura: {
        ...factura,
        condicion: 'contado',
        plazoDias: 0,
        vence: '2026-09-30',
        ahorro: 0,
        formaPagoNombre: 'Efectivo',
        recibido: 100_000,
        cambio: 20_750,
        cajasEmpaque: 2,
        saldo: 0,
      },
      reimpresion: false,
    });
    expect(html).toContain('CONTADO, EFECTIVO');
    expect(html).not.toContain('CREDITO,');
    expect(html).toContain('SALDO CREDITO</span><span>0');
    expect(html).toContain('CAMBIO</span><span>20,750');
    expect(html).not.toContain('SU AHORRO');
    expect(html).toContain('No.Cajas Empaque: 2');
  });

  it('marca la reimpresión y la anulación', () => {
    const html = tirillaFactura({
      negocio,
      factura: { ...factura, estado: 'anulada' },
      reimpresion: true,
    });
    expect(html).toContain('REIMPRESION');
    expect(html).toContain('ANULADA');
  });

  it('imprime la factura corregida con la leyenda, la versión y el recuadro (D-122)', () => {
    const html = tirillaFactura({
      negocio,
      factura: {
        ...factura,
        total: 48_250,
        saldo: 0,
        version: 2,
        correccion: {
          fecha: '2026-10-04T15:20:15.000-05:00',
          totalAnterior: 79_250,
          abonado: 70_000,
          saldoFavor: 21_750,
          reintegro: null,
        },
      },
      reimpresion: false,
    });
    expect(html).toContain('CORREGIDA');
    expect(html).toContain('Versión 2 · 04/10/2026 03:20:15 PM');
    expect(html).toContain('Fecha Generación: 30/09/2026 05:26:36 PM');
    expect(html).toContain('<span>Total anterior</span><span>79,250</span>');
    expect(html).toContain('<span>Diferencia</span><span>-31,000</span>');
    expect(html).toContain('<span>Abonado</span><span>70,000</span>');
    expect(html).toContain('<span>SALDO A FAVOR</span><span>21,750</span>');
    expect(html).not.toContain('REIMPRESION');
  });

  it('en una venta de contado corregida muestra lo devuelto', () => {
    const html = tirillaFactura({
      negocio,
      factura: {
        ...factura,
        condicion: 'contado',
        formaPagoNombre: 'Efectivo',
        total: 48_250,
        saldo: 0,
        version: 2,
        correccion: {
          fecha: '2026-10-04T15:20:15.000-05:00',
          totalAnterior: 79_250,
          abonado: 0,
          saldoFavor: 0,
          reintegro: { sentido: 'entrega', valor: 31_000 },
        },
      },
      reimpresion: false,
    });
    expect(html).toContain('<span>DEVUELTO</span><span>31,000</span>');
    expect(html).not.toContain('Abonado');
  });
});

describe('tirillaReciboAbono', () => {
  /** Abono de cliente a un saldo inicial y a una venta. */
  const abono: AbonoDetalle = {
    id: 4,
    tipo: 'cliente',
    numero: 12,
    fecha: '2026-10-02',
    formaPagoNombre: 'Transferencia',
    valor: 150_000,
    observacion: 'Pago <nequi>',
    origen: 'manual',
    estado: 'activo',
    anuladoEn: null,
    motivoAnulacion: null,
    aplicaciones: [
      {
        facturaId: 1,
        valor: 120_000,
        facturaNumero: 84650,
        referencia: '',
        saldoInicial: true,
        saldoActual: 0,
      },
      {
        facturaId: 2,
        valor: 30_000,
        facturaNumero: 84772,
        referencia: '',
        saldoInicial: false,
        saldoActual: 51_000,
      },
    ],
    terceroCodigo: 10001,
    terceroNombre: 'JUAN JJ FERTILIA',
    terceroIdentificacion: 'CC 897627275',
    registradoEn: '2026-10-02T09:15:20.000-05:00',
  };
  const impresoEn = '2026-10-02T09:15:25.000-05:00';

  it('imprime el recibo de 80 mm con facturas, saldos, total en letras y deuda', () => {
    const html = tirillaReciboAbono({
      negocio,
      abono,
      deudaActual: 51_000,
      reimpresion: false,
      impresoEn,
    });
    expect(html).toContain('size: 80mm auto');
    expect(html).toContain('RECIBO DE ABONO');
    expect(html).toContain('<div class="numero">12</div>');
    expect(html).toContain('Fecha: 02/10/2026');
    expect(html).toContain('CLIENTE: 10001-JUAN JJ FERTILIA');
    expect(html).toContain('CC 897627275');
    expect(html).toContain('FORMA DE PAGO: TRANSFERENCIA');
    expect(html).toContain('84650<div class="detalle">SALDO INICIAL</div>');
    expect(html).toContain('120,000');
    expect(html).toContain('51,000');
    expect(html).toContain('SON: CIENTO CINCUENTA MIL PESOS M/L');
    expect(html).toContain('<span>TOTAL ABONO</span><span>150,000</span>');
    expect(html).toContain('<span>SALDO PENDIENTE</span><span>51,000</span>');
    expect(html).toContain('OBS: Pago &lt;nequi&gt;');
    expect(html).not.toContain('REIMPRESION');
    expect(html).not.toContain('<script');
  });

  it('marca la reimpresión y la anulación', () => {
    const html = tirillaReciboAbono({
      negocio,
      abono: { ...abono, estado: 'anulado', anuladoEn: '2026-10-03T08:00:00-05:00' },
      deudaActual: 201_000,
      reimpresion: true,
      impresoEn,
    });
    expect(html).toContain('REIMPRESION');
    expect(html).toContain('ANULADO');
  });

  it('imprime el abono a proveedor con la factura del proveedor y sin el agradecimiento', () => {
    const html = tirillaReciboAbono({
      negocio,
      abono: {
        ...abono,
        tipo: 'proveedor',
        terceroCodigo: 3,
        terceroNombre: 'AGRINA S.A.S.',
        terceroIdentificacion: 'NIT 900123456',
        aplicaciones: [
          {
            facturaId: 7,
            valor: 150_000,
            facturaNumero: 15,
            referencia: 'FE-881',
            saldoInicial: false,
            saldoActual: 40_000,
          },
        ],
      },
      deudaActual: 40_000,
      reimpresion: true,
      impresoEn,
    });
    expect(html).toContain('ABONO A PROVEEDOR');
    expect(html).toContain('PROVEEDOR: 3-AGRINA S.A.S.');
    expect(html).toContain('<th>Compra</th>');
    expect(html).toContain('15<div class="detalle">FE-881</div>');
    expect(html).toContain('<span>SALDO PENDIENTE</span><span>40,000</span>');
    expect(html).toContain('REIMPRESION');
    expect(html).not.toContain('GRACIAS POR SU PAGO');
  });
});

describe('tirillaFacturaProveedor', () => {
  /** Compra a crédito de 2 líneas con flete del proveedor y 2 % de descuento. */
  const compra: FacturaProveedorParaCorregir = {
    id: 7,
    numero: 15,
    plazoDias: 30,
    vence: '2026-10-31',
    bodegaId: 1,
    bodegaNombre: 'Principal',
    version: 1,
    estado: 'activa',
    anuladaEn: null,
    motivoAnulacion: null,
    tercero: { codigo: 3, nombre: 'AGRINA <S.A.S.>', identificacion: 'NIT 900123456' },
    cartera: { total: 205_000, aplicado: 50_000, devuelto: 0, trasladado: 0, saldo: 155_000 },
    saldoFavor: 0,
    abonos: [],
    versiones: [
      { version: 1, fecha: '2026-10-01T10:00:00.000-05:00', total: 205_000, motivo: null },
    ],
    devoluciones: [],
    yaDevuelto: [],
    fecha: '2026-10-01',
    numeroProveedor: 'FE-881',
    origen: 'compra',
    subtotal: 200_000,
    flete: 9_000,
    fleteProveedor: true,
    descuento: { modo: 'porcentaje', valor: 200 },
    descuentoPesos: 4_000,
    descuentoEnCosto: true,
    abonoContado: null,
    lineas: [
      {
        renglon: 1,
        producto: {
          codigo: 231,
          nombre: 'PAPA FRANCESA',
          unidad: 'UND',
          costo: 12_000,
          precios: { mayor: 16_000, menor: 17_500, minimo: 14_000 },
          proveedorCodigo: 3,
        },
        cantidad: 10_000,
        costoUnitario: 12_000,
        total: 120_000,
        flete: 5_400,
        descuento: 2_400,
        costoNuevo: 12_300,
      },
      {
        renglon: 2,
        producto: {
          codigo: 232,
          nombre: 'QUESO',
          unidad: 'KG',
          costo: 16_000,
          precios: { mayor: 20_000, menor: 22_000, minimo: 18_000 },
          proveedorCodigo: 3,
        },
        cantidad: 5_000,
        costoUnitario: 16_000,
        total: 80_000,
        flete: 3_600,
        descuento: 1_600,
        costoNuevo: 16_400,
      },
    ],
    costos: [],
  };
  const impresoEn = '2026-10-04T11:00:00.000-05:00';

  it('imprime la compra a crédito con flete, descuento, pagado y saldo', () => {
    const html = tirillaFacturaProveedor({ negocio, compra, reimpresion: true, impresoEn });
    expect(html).toContain('size: 80mm auto');
    expect(html).toContain('FACTURA DE PROVEEDOR');
    expect(html).toContain('<div class="numero">FE-881</div>');
    expect(html).toContain('Compra No.: 15');
    expect(html).toContain('Fecha: 01/10/2026');
    expect(html).toContain('Bodega: Principal');
    expect(html).toContain('CREDITO, 30 DIAS');
    expect(html).toContain('31/10/2026');
    expect(html).toContain('PROVEEDOR: 3-AGRINA &lt;S.A.S.&gt;');
    expect(html).toContain('x UNIDAD');
    expect(html).toContain('x KILO');
    expect(html).toContain('LINEAS: 2');
    expect(html).toContain('<span>SUBTOTAL</span><span>200,000</span>');
    expect(html).toContain('<span>FLETE</span><span>9,000</span>');
    expect(html).toContain('<span>DESCUENTO</span><span>-4,000</span>');
    expect(html).toContain('SON: DOSCIENTOS CINCO MIL PESOS M/L');
    expect(html).toContain('<span>PAGADO</span><span>50,000</span>');
    expect(html).toContain('<span>SALDO</span><span>155,000</span>');
    expect(html).not.toContain('DEVUELTO');
    expect(html).toContain('REIMPRESION');
    expect(html).not.toContain('CORREGIDA');
    expect(html).not.toContain('ANULADA');
    expect(html).not.toContain('<script');
  });

  it('marca la compra de contado anulada con saldo cero', () => {
    const html = tirillaFacturaProveedor({
      negocio,
      compra: {
        ...compra,
        estado: 'anulada',
        anuladaEn: '2026-10-02T08:00:00.000-05:00',
        abonoContado: { id: 9, numero: 20 },
      },
      reimpresion: true,
      impresoEn,
    });
    expect(html).toContain('PAGADA DE CONTADO');
    expect(html).toContain('ANULADA');
    expect(html).toContain('<span>SALDO</span><span>0</span>');
  });

  it('imprime la compra corregida con la versión y el recuadro de corrección', () => {
    const html = tirillaFacturaProveedor({
      negocio,
      compra: {
        ...compra,
        version: 2,
        cartera: { total: 145_000, aplicado: 150_000, devuelto: 0, trasladado: 5_000, saldo: 0 },
        versiones: [
          ...compra.versiones,
          { version: 2, fecha: '2026-10-03T16:45:00.000-05:00', total: 145_000, motivo: 'Precio' },
        ],
      },
      reimpresion: true,
      impresoEn,
    });
    expect(html).toContain('CORREGIDA');
    expect(html).toContain('Versión 2 · 03/10/2026 04:45:00 PM');
    expect(html).toContain('<span>Total anterior</span><span>205,000</span>');
    expect(html).toContain('<span>Diferencia</span><span>-60,000</span>');
    expect(html).toContain('<span>SALDO A FAVOR</span><span>5,000</span>');
  });
});
