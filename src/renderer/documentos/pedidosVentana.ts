import { useEffect, useRef } from 'react';
import type { IdProceso } from '../../shared/procesos';

/**
 * Acción que recibe el número de factura pedido a una ventana.
 */
type ReceptorPedido = (numero: string) => void;

/**
 * Pedidos que todavía no recibió ninguna ventana (la ventana se está abriendo).
 */
const pendientes = new Map<IdProceso, string>();

/**
 * Ventanas abiertas que esperan pedidos, por proceso.
 */
const receptores = new Map<IdProceso, Set<ReceptorPedido>>();

/**
 * Pide a la ventana de un proceso que cargue una factura (p. ej. «Devolución…»
 * desde la corrección abre la devolución de venta con esa factura). Si la
 * ventana ya está abierta la recibe al instante; si no, la recibe al montarse.
 * Después de pedir, quien llama abre o trae al frente la ventana.
 *
 * @param proceso - Ventana que debe cargar la factura.
 * @param numero - Número de la factura, tal como se escribiría.
 *
 * @example
 * pedirFactura('devolucion-venta', '84790');
 * abrir('devolucion-venta');
 */
export function pedirFactura(proceso: IdProceso, numero: string): void {
  const abiertas = receptores.get(proceso);
  if (abiertas && abiertas.size > 0) {
    for (const receptor of abiertas) receptor(numero);
    return;
  }
  pendientes.set(proceso, numero);
}

/**
 * Recibe los pedidos de factura hechos a la ventana con {@link pedirFactura}.
 *
 * @param proceso - Proceso de la ventana.
 * @param alRecibir - Carga la factura pedida (se usa siempre su versión más reciente).
 */
export function usePedidoFactura(proceso: IdProceso, alRecibir: ReceptorPedido): void {
  const alRecibirRef = useRef(alRecibir);
  useEffect(() => {
    alRecibirRef.current = alRecibir;
  });

  useEffect(() => {
    const receptor: ReceptorPedido = (numero) => alRecibirRef.current(numero);
    const conjunto = receptores.get(proceso) ?? new Set<ReceptorPedido>();
    conjunto.add(receptor);
    receptores.set(proceso, conjunto);
    const pendiente = pendientes.get(proceso);
    if (pendiente !== undefined) {
      pendientes.delete(proceso);
      receptor(pendiente);
    }
    return () => {
      conjunto.delete(receptor);
    };
  }, [proceso]);
}
