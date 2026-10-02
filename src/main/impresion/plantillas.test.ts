import { describe, expect, it } from 'vitest';
import type { AbonoProveedorDetalle } from '../../data/repositorios/abonos.repo';
import { escaparHtml, reciboAbonoProveedor } from './plantillas';

/** Datos del negocio del encabezado. */
const negocio = {
  nombre: 'SALSAMENTARIA EL BUEN CIUDADANO',
  nit: '70694229-1',
  regimen: 'No responsable de IVA',
  direccion: 'Calle 1 # 2-3',
  telefono: '3001234567',
};

/** Abono repartido entre dos compras, con texto que hay que escapar. */
const abono: AbonoProveedorDetalle = {
  id: 1,
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
    { facturaId: 3, valor: 300_000, compraNumero: 3, numeroProveedor: 'FV-100', saldoActual: 0 },
    {
      facturaId: 5,
      valor: 200_000,
      compraNumero: 5,
      numeroProveedor: 'FV-120',
      saldoActual: 40_000,
    },
  ],
  proveedorCodigo: 12,
  proveedorNombre: 'DISTRIBUIDORA LA COSTA',
  proveedorIdentificacion: 'NIT 900123456-7',
  registradoEn: '2026-10-02T09:15:00-05:00',
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

describe('reciboAbonoProveedor', () => {
  it('arma el recibo carta con encabezado, reparto y total', () => {
    const html = reciboAbonoProveedor({ negocio, abono, reimpresion: false, impresoEn });
    expect(html).toContain("default-src 'none'; style-src 'unsafe-inline'");
    expect(html).toContain('size: letter');
    expect(html).toContain('SALSAMENTARIA EL BUEN CIUDADANO');
    expect(html).toContain('NIT: 70694229-1');
    expect(html).toContain('RECIBO DE ABONO A PROVEEDOR No. 8');
    expect(html).toContain('02/10/2026');
    expect(html).toContain('12 - DISTRIBUIDORA LA COSTA');
    expect(html).toContain('FV-100');
    expect(html).toContain('300,000');
    expect(html).toContain('$ 500,000');
    expect(html).toContain('3:40 p. m.');
    expect(html).not.toContain('REIMPRESION');
    expect(html).not.toContain('ANULADO');
    expect(html).not.toContain('<script');
  });

  it('escapa los textos escritos por el usuario', () => {
    const html = reciboAbonoProveedor({ negocio, abono, reimpresion: false, impresoEn });
    expect(html).toContain('Pago &lt;parcial&gt; &amp; saldo');
    expect(html).not.toContain('<parcial>');
  });

  it('marca la reimpresión y la anulación con su motivo', () => {
    const html = reciboAbonoProveedor({
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
    const html = reciboAbonoProveedor({
      negocio: { nombre: '', nit: '', regimen: '', direccion: '', telefono: '' },
      abono,
      reimpresion: false,
      impresoEn,
    });
    expect(html).toContain('NOMBRE DEL NEGOCIO SIN CONFIGURAR');
    expect(html).not.toContain('NIT:');
  });
});
