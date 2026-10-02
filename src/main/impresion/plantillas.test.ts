import { describe, expect, it } from 'vitest';
import type { AbonoDetalle } from '../../data/repositorios/abonos.repo';
import { escaparHtml, reciboAbono } from './plantillas';

/** Datos del negocio del encabezado. */
const negocio = {
  nombre: 'SALSAMENTARIA EL BUEN CIUDADANO',
  nit: '70694229-1',
  regimen: 'No responsable de IVA',
  direccion: 'Calle 1 # 2-3',
  telefono: '3001234567',
};

/** Abono repartido entre dos compras, con texto que hay que escapar. */
const abono: AbonoDetalle = {
  id: 1,
  tipo: 'proveedor',
  numero: 8,
  fecha: '2026-10-02',
  formaPagoNombre: 'Efectivo',
  valor: 500_000,
  observacion: 'Pago <parcial> & saldo',
  origen: 'manual',
  estado: 'activo',
  anuladoEn: null,
  motivoAnulacion: null,
  aplicaciones: [
    {
      facturaId: 3,
      valor: 300_000,
      facturaNumero: 3,
      referencia: 'FV-100',
      saldoInicial: false,
      saldoActual: 0,
    },
    {
      facturaId: 5,
      valor: 200_000,
      facturaNumero: 5,
      referencia: 'FV-120',
      saldoInicial: true,
      saldoActual: 40_000,
    },
  ],
  terceroCodigo: 12,
  terceroNombre: 'DISTRIBUIDORA LA COSTA',
  terceroIdentificacion: 'NIT 900123456-7',
  registradoEn: '2026-10-02T09:15:00-05:00',
};

/** Abono de cliente a una venta y a un saldo inicial. */
const abonoCliente: AbonoDetalle = {
  ...abono,
  tipo: 'cliente',
  numero: 3,
  observacion: '',
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
  valor: 150_000,
  terceroCodigo: 10001,
  terceroNombre: 'JUAN JJ FERTILIA',
  terceroIdentificacion: 'CC 897627275',
};

/** Momento de la impresión. */
const impresoEn = '2026-10-02T15:40:00-05:00';

describe('escaparHtml', () => {
  it('neutraliza los caracteres especiales de HTML', () => {
    expect(escaparHtml(`<b>"A" & 'B'</b>`)).toBe(
      '&lt;b&gt;&quot;A&quot; &amp; &#39;B&#39;&lt;/b&gt;',
    );
  });
});

describe('reciboAbono', () => {
  it('arma el recibo carta de proveedor con encabezado, reparto y total', () => {
    const html = reciboAbono({ negocio, abono, reimpresion: false, impresoEn });
    expect(html).toContain("default-src 'none'; style-src 'unsafe-inline'");
    expect(html).toContain('size: letter');
    expect(html).toContain('SALSAMENTARIA EL BUEN CIUDADANO');
    expect(html).toContain('NIT: 70694229-1');
    expect(html).toContain('RECIBO DE ABONO A PROVEEDOR No. 8');
    expect(html).toContain('02/10/2026');
    expect(html).toContain('<th>Proveedor</th><td>12 - DISTRIBUIDORA LA COSTA');
    expect(html).toContain('FV-100');
    expect(html).toContain('FV-120 (Saldo inicial)');
    expect(html).toContain('300,000');
    expect(html).toContain('$ 500,000');
    expect(html).toContain('3:40 p. m.');
    expect(html).not.toContain('REIMPRESION');
    expect(html).not.toContain('ANULADO');
    expect(html).not.toContain('<script');
  });

  it('arma el recibo carta de cliente con sus facturas y la marca de saldo inicial', () => {
    const html = reciboAbono({ negocio, abono: abonoCliente, reimpresion: true, impresoEn });
    expect(html).toContain('RECIBO DE ABONO DE CLIENTE No. 3');
    expect(html).toContain('<th>Cliente</th><td>10001 - JUAN JJ FERTILIA');
    expect(html).toContain('<td>84650 (Saldo inicial)</td>');
    expect(html).toContain('<td>84772</td>');
    expect(html).toContain('<td colspan="1">TOTAL DEL ABONO</td>');
    expect(html).toContain('$ 150,000');
    expect(html).toContain('REIMPRESION');
    expect(html).not.toContain('Observación');
  });

  it('escapa los textos escritos por el usuario', () => {
    const html = reciboAbono({ negocio, abono, reimpresion: false, impresoEn });
    expect(html).toContain('Pago &lt;parcial&gt; &amp; saldo');
    expect(html).not.toContain('<parcial>');
  });

  it('marca la reimpresión y la anulación con su motivo', () => {
    const html = reciboAbono({
      negocio,
      abono: {
        ...abono,
        estado: 'anulado',
        anuladoEn: '2026-10-03T08:00:00-05:00',
        motivoAnulacion: 'Cheque devuelto',
      },
      reimpresion: true,
      impresoEn,
    });
    expect(html).toContain('REIMPRESION');
    expect(html).toContain('ANULADO');
    expect(html).toContain('03/10/2026 8:00 a. m. · Cheque devuelto');
  });

  it('avisa cuando el negocio aún no está configurado', () => {
    const html = reciboAbono({
      negocio: { nombre: '', nit: '', regimen: '', direccion: '', telefono: '' },
      abono,
      reimpresion: false,
      impresoEn,
    });
    expect(html).toContain('NOMBRE DEL NEGOCIO SIN CONFIGURAR');
    expect(html).not.toContain('NIT:');
  });
});
