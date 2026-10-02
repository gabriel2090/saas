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
 * Mínimo de los maestros: por debajo de 680 px de ancho pasan a modo angosto
 * (la ficha debajo de la lista, D-109), que necesita más alto.
 */
const MINIMO_MAESTRO: TamanoVentana = { ancho: 440, alto: 420 };

/**
 * Tamaño mínimo de las ventanas que no tienen uno propio (D-111).
 */
export const MINIMO_GENERAL: TamanoVentana = { ancho: 480, alto: 320 };

/**
 * Tamaño mínimo de cada proceso (ventana completa, con su barra de título),
 * medido sobre el contenido de cada pantalla (`DISENO.md` §11.2, D-111).
 */
const MINIMOS: Partial<Record<IdProceso, TamanoVentana>> = {
  facturar: { ancho: 760, alto: 480 },
  'factura-proveedor': { ancho: 720, alto: 460 },
  'abono-cliente': { ancho: 560, alto: 440 },
  'abono-proveedor': { ancho: 560, alto: 440 },
  'ajustes-inventario': { ancho: 560, alto: 420 },
  productos: MINIMO_MAESTRO,
  clientes: MINIMO_MAESTRO,
  proveedores: MINIMO_MAESTRO,
  bodegas: { ancho: 440, alto: 300 },
  'formas-pago': { ancho: 440, alto: 300 },
  importador: { ancho: 560, alto: 400 },
  'datos-negocio': { ancho: 420, alto: 360 },
  'cambiar-contrasena': { ancho: 420, alto: 300 },
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

/**
 * Devuelve el tamaño mínimo de la ventana de un proceso (D-111).
 *
 * @param id - Proceso.
 * @returns Tamaño mínimo.
 */
export function minimoDeProceso(id: IdProceso): TamanoVentana {
  return MINIMOS[id] ?? MINIMO_GENERAL;
}
