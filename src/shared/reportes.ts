import type { UnidadMedida } from './formato/cantidades';
import type { PeticionHistorial } from './historial';
import type { PeticionKardex } from './kardex';

/**
 * Cartera de clientes (cuentas por cobrar) o de proveedores (cuentas por pagar).
 */
export type TipoCartera = 'cliente' | 'proveedor';

/**
 * Tipos de cartera aceptados, para validar peticiones.
 */
export const TIPOS_CARTERA: readonly TipoCartera[] = ['cliente', 'proveedor'];

/**
 * Filtros del reporte de cuentas por cobrar o por pagar (D-148).
 */
export interface PeticionCartera {
  /** Clientes o proveedores. */
  tipo: TipoCartera;
  /** Un solo tercero, o `null` para todos. */
  terceroCodigo: number | null;
  /** Solo los documentos vencidos. */
  soloVencidas: boolean;
  /** Incluir a los terceros que no deben nada pero tienen saldo a favor. */
  incluirSoloFavor: boolean;
}

/**
 * Datos del tercero en el encabezado de su grupo.
 */
export interface TerceroReporte {
  /** Código. */
  codigo: number;
  /** Nombre. */
  nombre: string;
  /** Tipo y número de identificación, p. ej. `NIT 901234567`. */
  identificacion: string;
  /** Celular. */
  celular: string;
  /** Tope de crédito (solo clientes), o `null`. */
  tope: number | null;
}

/**
 * Documento con saldo en la cartera: factura de venta a crédito o compra.
 */
export interface DocumentoCartera {
  /** Id interno de la factura. */
  id: number;
  /** Número de la factura de venta, o número interno de la compra. */
  numero: number;
  /** Número de la factura del proveedor (vacío en las de cliente). */
  referencia: string;
  /** Si es un saldo inicial importado (D-86). */
  saldoInicial: boolean;
  /** Fecha del documento, `AAAA-MM-DD`. */
  fecha: string;
  /** Vencimiento, `AAAA-MM-DD`. */
  vence: string;
  /** Total vigente (con correcciones). */
  total: number;
  /** Lo aplicado por abonos activos. */
  abonado: number;
  /** Devoluciones netas (total − abonado − saldo). */
  devuelto: number;
  /** Saldo pendiente (> 0). */
  saldo: number;
  /** Si ya venció (vence antes de hoy). */
  vencida: boolean;
  /** Días vencida si `vencida`; si no, días que faltan (0 = vence hoy). */
  dias: number;
}

/**
 * Documentos de un tercero con su subtotal.
 */
export interface GrupoCartera {
  /** Tercero. */
  tercero: TerceroReporte;
  /** Documentos pendientes, del vencimiento más antiguo al más reciente. */
  documentos: DocumentoCartera[];
  /** Suma de los saldos de sus documentos. */
  saldo: number;
  /** Parte vencida del saldo. */
  vencido: number;
  /** Saldo a favor del tercero. */
  saldoFavor: number;
  /** Saldo menos saldo a favor (negativo si el saldo a favor es mayor). */
  neto: number;
}

/**
 * Totales del reporte de cartera.
 */
export interface ResumenCartera {
  /** Suma de los saldos (por cobrar o por pagar). */
  total: number;
  /** Parte vencida. */
  vencido: number;
  /** Parte por vencer. */
  porVencer: number;
  /** Documentos vencidos. */
  documentosVencidos: number;
  /** Documentos por vencer. */
  documentosPorVencer: number;
  /** Saldos a favor de los terceros mostrados. */
  saldoFavor: number;
  /** Total menos saldos a favor. */
  neto: number;
  /** Terceros mostrados. */
  terceros: number;
}

/**
 * Reporte de cuentas por cobrar o por pagar «a hoy» (D-146, D-148).
 */
export interface ReporteCartera {
  /** Clientes o proveedores. */
  tipo: TipoCartera;
  /** Momento del corte (ISO con zona). */
  corte: string;
  /** Grupos: primero el tercero con el vencimiento más antiguo. */
  grupos: GrupoCartera[];
  /** Totales. */
  resumen: ResumenCartera;
}

/**
 * Filtros del inventario valorizado.
 */
export interface PeticionInventario {
  /** Una bodega, o `null` para todas (una columna por bodega). */
  bodegaId: number | null;
  /** Productos de un proveedor, o `null` para todos. */
  proveedorCodigo: number | null;
  /** Código o parte del nombre del producto (vacío = todos). */
  texto: string;
  /** Mostrar también los productos sin existencia. */
  mostrarSinExistencia: boolean;
  /** Incluir los productos inactivos. */
  incluirInactivos: boolean;
}

/**
 * Bodega que es una columna del inventario.
 */
export interface BodegaReporte {
  /** Id. */
  id: number;
  /** Nombre. */
  nombre: string;
}

/**
 * Fila del inventario valorizado.
 */
export interface FilaInventario {
  /** Código del producto. */
  codigo: number;
  /** Nombre. */
  nombre: string;
  /** Unidad de medida. */
  unidad: UnidadMedida;
  /** Nombre del proveedor. */
  proveedorNombre: string;
  /** Si el producto está activo. */
  activo: boolean;
  /** Existencia en milésimas en cada bodega, en el orden de {@link ReporteInventario.bodegas}. */
  porBodega: number[];
  /** Existencia total en milésimas (suma de las bodegas mostradas). */
  existencia: number;
  /** Costo actual del producto. */
  costo: number;
  /** Valor de las existencias positivas (D-147). */
  valor: number;
  /** Valor de las existencias negativas (≤ 0; no suma al total). */
  valorNegativo: number;
}

/**
 * Totales del inventario valorizado.
 */
export interface ResumenInventario {
  /** Productos con alguna existencia positiva. */
  productosConExistencia: number;
  /** Valor de las existencias positivas de cada bodega, en el orden de las columnas. */
  valorPorBodega: number[];
  /** Valor total: solo existencias positivas (D-147). */
  valorTotal: number;
  /** Productos con alguna existencia negativa. */
  productosNegativos: number;
  /** Valor de las existencias negativas (≤ 0). */
  valorNegativo: number;
}

/**
 * Inventario valorizado a costo «a hoy» (D-146, D-147).
 */
export interface ReporteInventario {
  /** Momento del corte (ISO con zona). */
  corte: string;
  /** Bodegas mostradas como columnas. */
  bodegas: BodegaReporte[];
  /** Filas, por código de producto. */
  filas: FilaInventario[];
  /** Totales. */
  resumen: ResumenInventario;
}

/**
 * Reporte que se imprime, se guarda en PDF o se exporta a Excel. El proceso
 * principal lo vuelve a calcular con los filtros: la pantalla solo dice cuál.
 */
export type PeticionReporte =
  | { reporte: 'inventario'; filtros: PeticionInventario }
  | { reporte: 'cartera'; filtros: PeticionCartera }
  | { reporte: 'kardex'; filtros: PeticionKardex }
  | { reporte: 'historial'; filtros: PeticionHistorial };

/**
 * Reportes aceptados, para validar peticiones.
 */
export const REPORTES: readonly PeticionReporte['reporte'][] = [
  'inventario',
  'cartera',
  'kardex',
  'historial',
];

/**
 * Reportes que se exportan a Excel (el kardex y el historial solo se
 * imprimen o se guardan en PDF, como en sus maquetas).
 */
export const REPORTES_CON_EXCEL: readonly PeticionReporte['reporte'][] = ['inventario', 'cartera'];
