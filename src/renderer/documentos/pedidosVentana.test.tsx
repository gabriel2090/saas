/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { pedirFactura, usePedidoFactura } from './pedidosVentana';

afterEach(cleanup);

describe('pedidos de factura entre ventanas', () => {
  it('la ventana que se abre después recibe el pedido al montarse, una sola vez', () => {
    pedirFactura('devolucion-venta', '84790');
    const recibidos: string[] = [];
    const { unmount } = renderHook(() =>
      usePedidoFactura('devolucion-venta', (n) => recibidos.push(n)),
    );
    expect(recibidos).toEqual(['84790']);
    unmount();
    renderHook(() => usePedidoFactura('devolucion-venta', (n) => recibidos.push(n)));
    expect(recibidos).toEqual(['84790']);
  });

  it('la ventana ya abierta recibe el pedido al instante', () => {
    const recibidos: string[] = [];
    renderHook(() => usePedidoFactura('devolucion-compra', (n) => recibidos.push(n)));
    act(() => pedirFactura('devolucion-compra', '37'));
    expect(recibidos).toEqual(['37']);
  });

  it('no entrega pedidos de otra ventana', () => {
    const recibidos: string[] = [];
    renderHook(() => usePedidoFactura('correccion-cliente', (n) => recibidos.push(n)));
    act(() => pedirFactura('correccion-proveedor', '5'));
    expect(recibidos).toEqual([]);
  });
});
