import { describe, expect, it } from 'vitest';
import type { FacturaClienteDetalle } from '../../data/repositorios/ventas.repo';
import { tirillaFactura } from './tirilla';

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
});
