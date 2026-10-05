import { describe, expect, it } from 'vitest';
import {
  armarKardex,
  etiquetaMovimiento,
  marcaAnulacion,
  textoDocumento,
  type MovimientoKardex,
} from './kardex';

/**
 * Movimiento de prueba con lo mínimo.
 *
 * @param id - Id.
 * @param tipo - Tipo.
 * @param unidades - Unidades con signo.
 * @param costo - Costo unitario.
 * @returns Movimiento.
 */
function mov(id: number, tipo: string, unidades: number, costo = 11_500): MovimientoKardex {
  return {
    id,
    fecha: `2026-09-${String(id).padStart(2, '0')}T09:00:00.000-05:00`,
    tipo,
    tipoAjuste: tipo === 'ajuste' ? 'merma' : null,
    cantidad: unidades * 1000,
    costoUnitario: costo,
    origen: { clase: 'otro', texto: `Doc ${id}` },
    tercero: '',
    bodega: 'Principal',
    ver: null,
  };
}

describe('kardex', () => {
  it('lleva el saldo corrido con los movimientos de la maqueta', () => {
    const k = armarKardex({
      saldoAnterior: 0,
      costoActual: 11_800,
      movimientos: [
        mov(1, 'inicial', 20, 11_200),
        mov(2, 'compra', 48),
        mov(4, 'venta', -6),
        mov(14, 'venta', -10),
        mov(18, 'devolucion_venta', 2),
        mov(20, 'ajuste', -1),
        mov(22, 'compra', 30, 11_800),
        mov(26, 'venta', -12, 11_800),
        mov(27, 'correccion_venta', 2, 11_800),
        mov(28, 'venta', -15, 11_800),
        mov(29, 'anulacion_venta', 15, 11_800),
      ],
    });
    expect(k.filas.map((f) => f.saldo / 1000)).toEqual([
      20, 68, 62, 52, 54, 53, 83, 71, 73, 58, 73,
    ]);
    expect(k.entradas).toBe(117_000);
    expect(k.salidas).toBe(44_000);
    expect(k.saldoFinal).toBe(73_000);
    expect(k.valorCostoActual).toBe(861_400);
    expect(k.filas[5]).toMatchObject({ movimiento: 'Ajuste (merma)', entrada: 0, salida: 1_000 });
    expect(k.filas[10]).toMatchObject({ movimiento: 'Anulación de venta', marca: 'ANULADA' });
  });

  it('cuadra: saldo anterior + entradas − salidas = saldo final, también en negativo', () => {
    const k = armarKardex({
      saldoAnterior: 2_500,
      costoActual: 4_500,
      movimientos: [mov(1, 'venta', -3), mov(2, 'venta', -2)],
    });
    expect(k.saldoFinal).toBe(2_500 + k.entradas - k.salidas);
    expect(k.saldoFinal).toBe(-2_500);
    expect(k.valorCostoActual).toBe(-11_250);
  });

  it('sin movimientos en el periodo, el saldo final es el anterior', () => {
    const k = armarKardex({ saldoAnterior: 7_250, costoActual: 1_000, movimientos: [] });
    expect(k).toMatchObject({ filas: [], entradas: 0, salidas: 0, saldoFinal: 7_250 });
    expect(k.valorCostoActual).toBe(7_250);
  });

  it('nombra los movimientos y deja tal cual los que no conoce', () => {
    expect(etiquetaMovimiento('inicial', null)).toBe('Inventario inicial');
    expect(etiquetaMovimiento('ajuste', 'dano')).toBe('Ajuste (daño)');
    expect(etiquetaMovimiento('ajuste', 'conteo')).toBe('Ajuste (conteo físico)');
    expect(etiquetaMovimiento('anulacion_devolucion_compra', null)).toBe(
      'Anulación de devolución de compra',
    );
    expect(etiquetaMovimiento('traslado', null)).toBe('traslado');
    expect(marcaAnulacion('anulacion_ajuste')).toBe('ANULADO');
    expect(marcaAnulacion('anulacion_compra')).toBe('ANULADA');
    expect(marcaAnulacion('venta')).toBe('');
  });

  it('describe el documento de origen como en la maqueta', () => {
    expect(textoDocumento({ clase: 'factura-cliente', numero: 84761, version: null })).toBe(
      'Factura 84761',
    );
    expect(textoDocumento({ clase: 'factura-cliente', numero: 84783, version: 2 })).toBe(
      'Factura 84783 · versión 2',
    );
    expect(
      textoDocumento({ clase: 'factura-proveedor', numero: 31, referencia: 'FE-5521', version: 1 }),
    ).toBe('Compra 31 · FE-5521');
    expect(
      textoDocumento({ clase: 'devolucion', tipo: 'venta', numero: 3, facturaNumero: 84772 }),
    ).toBe('Devolución 3 · fact. 84772');
    expect(
      textoDocumento({ clase: 'devolucion', tipo: 'compra', numero: 1, facturaNumero: 7 }),
    ).toBe('Devolución 1 · compra 7');
    expect(textoDocumento({ clase: 'ajuste', numero: 7 })).toBe('Ajuste 7');
    expect(textoDocumento({ clase: 'importacion' })).toBe('Importación');
  });
});
