import type { IdProceso } from '../../shared/procesos';
import type { TamanoVentana } from './gestor';

/**
 * Tamaño con que abren las ventanas de maestros (lista + ficha), según la
 * maqueta aprobada (docs/maquetas/productos.html).
 */
const TAMANO_MAESTRO: TamanoVentana = { ancho: 1040, alto: 640 };

/**
 * Tamaño inicial de cada proceso. Los que no aparecen se ajustan a su contenido.
 */
const TAMANOS_INICIALES: Partial<Record<IdProceso, TamanoVentana>> = {
  productos: TAMANO_MAESTRO,
  clientes: TAMANO_MAESTRO,
  proveedores: TAMANO_MAESTRO,
  bodegas: { ancho: 760, alto: 460 },
  'formas-pago': { ancho: 760, alto: 460 },
  importador: { ancho: 1040, alto: 640 },
  // Documentos: según las maquetas aprobadas (docs/maquetas/factura-proveedor.html y abono-proveedor.html).
  'factura-proveedor': { ancho: 1236, alto: 680 },
  'abono-proveedor': { ancho: 1236, alto: 660 },
  // Igual que el de proveedor: es la misma ventana (D-100).
  'abono-cliente': { ancho: 1236, alto: 660 },
  'ajustes-inventario': { ancho: 1040, alto: 600 },
  // Según la maqueta aprobada (docs/maquetas/facturar.html).
  facturar: { ancho: 1236, alto: 740 },
};

/**
 * Devuelve el tamaño con que abre la ventana de un proceso.
 *
 * @param id - Proceso.
 * @returns Tamaño inicial, o `null` si se ajusta a su contenido.
 */
export function tamanoInicialDeProceso(id: IdProceso): TamanoVentana | null {
  return TAMANOS_INICIALES[id] ?? null;
}
