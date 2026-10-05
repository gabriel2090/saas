import type {
  DocumentoPendiente,
  ExistenciaBodega,
  ProductoInventario,
} from '../../domain/reportes';
import type { BodegaReporte, TerceroReporte, TipoCartera } from '../../shared/reportes';
import type { BaseDeDatos } from '../conexion';
import { sqlAplicado, sqlSaldo } from './cartera.sql';

/**
 * Consulta de los documentos con saldo de cada cartera (D-127). En clientes
 * solo cuentan las facturas a crédito: las de contado no generan cartera.
 */
const CONSULTAS_PENDIENTES: Record<TipoCartera, string> = {
  cliente: `
    SELECT f.id, f.cliente_codigo AS terceroCodigo, f.numero, '' AS referencia,
           f.origen = 'saldo_inicial' AS saldoInicial, f.dia AS fecha, f.vence, f.total,
           ${sqlAplicado('cliente', 'f')} AS abonado, ${sqlSaldo('cliente', 'f')} AS saldo
    FROM facturas_cliente f
    WHERE f.estado = 'activa' AND f.condicion = 'credito'`,
  proveedor: `
    SELECT f.id, f.proveedor_codigo AS terceroCodigo, f.numero, f.numero_proveedor AS referencia,
           f.origen = 'saldo_inicial' AS saldoInicial, f.fecha, f.vence, f.total,
           ${sqlAplicado('proveedor', 'f')} AS abonado, ${sqlSaldo('proveedor', 'f')} AS saldo
    FROM facturas_proveedor f
    WHERE f.estado = 'activa'`,
};

/**
 * Fila de {@link CONSULTAS_PENDIENTES}: SQLite devuelve el indicador como 0 o 1.
 */
type FilaPendiente = Omit<DocumentoPendiente, 'saldoInicial'> & { saldoInicial: number };

/**
 * Documentos con saldo mayor que cero de toda la cartera de clientes o de proveedores.
 *
 * @param db - Conexión abierta.
 * @param tipo - Cliente o proveedor.
 * @returns Documentos pendientes.
 */
export function documentosPendientes(db: BaseDeDatos, tipo: TipoCartera): DocumentoPendiente[] {
  const filas = db
    .prepare(`SELECT * FROM (${CONSULTAS_PENDIENTES[tipo]}) WHERE saldo > 0`)
    .all() as FilaPendiente[];
  return filas.map((f) => ({ ...f, saldoInicial: f.saldoInicial === 1 }));
}

/**
 * Saldo a favor de cada tercero que lo tiene (suma de su libro mayor que cero).
 *
 * @param db - Conexión abierta.
 * @param tipo - Cliente o proveedor.
 * @returns Código del tercero → saldo a favor.
 */
export function saldosFavorPorTercero(db: BaseDeDatos, tipo: TipoCartera): Map<number, number> {
  const columna = tipo === 'cliente' ? 'cliente_codigo' : 'proveedor_codigo';
  const filas = db
    .prepare(
      `SELECT ${columna} AS codigo, SUM(valor) AS valor FROM saldos_favor
       WHERE tipo = ? GROUP BY ${columna} HAVING SUM(valor) > 0`,
    )
    .all(tipo) as { codigo: number; valor: number }[];
  return new Map(filas.map((f) => [f.codigo, f.valor]));
}

/**
 * Terceros para los encabezados de los grupos (activos e inactivos: un
 * inactivo puede seguir debiendo).
 *
 * @param db - Conexión abierta.
 * @param tipo - Cliente o proveedor.
 * @returns Terceros.
 */
export function tercerosDeCartera(db: BaseDeDatos, tipo: TipoCartera): TerceroReporte[] {
  const consulta =
    tipo === 'cliente'
      ? `SELECT codigo, nombre, tipo_identificacion AS tipoId, numero_identificacion AS numeroId,
                celular, tope_credito AS tope FROM clientes`
      : `SELECT codigo, nombre, tipo_identificacion AS tipoId, numero_identificacion AS numeroId,
                celular, NULL AS tope FROM proveedores`;
  const filas = db.prepare(consulta).all() as {
    codigo: number;
    nombre: string;
    tipoId: string;
    numeroId: string;
    celular: string;
    tope: number | null;
  }[];
  return filas.map((f) => ({
    codigo: f.codigo,
    nombre: f.nombre,
    identificacion: `${f.tipoId} ${f.numeroId}`,
    celular: f.celular,
    tope: f.tope,
  }));
}

/**
 * Existencia de cada par producto-bodega distinta de cero (suma del kardex).
 *
 * @param db - Conexión abierta.
 * @returns Existencias.
 */
export function existenciasPorPar(db: BaseDeDatos): ExistenciaBodega[] {
  return db
    .prepare(
      `SELECT producto_codigo AS productoCodigo, bodega_id AS bodegaId, SUM(cantidad) AS cantidad
       FROM movimientos_inventario GROUP BY producto_codigo, bodega_id HAVING SUM(cantidad) <> 0`,
    )
    .all() as ExistenciaBodega[];
}

/**
 * Productos con el nombre de su proveedor, para el inventario valorizado.
 *
 * @param db - Conexión abierta.
 * @returns Productos (activos e inactivos).
 */
export function productosDeInventario(db: BaseDeDatos): ProductoInventario[] {
  const filas = db
    .prepare(
      `SELECT p.codigo, p.nombre, p.unidad, p.proveedor_codigo AS proveedorCodigo,
              pr.nombre AS proveedorNombre, p.costo, p.activo
       FROM productos p JOIN proveedores pr ON pr.codigo = p.proveedor_codigo
       ORDER BY p.codigo`,
    )
    .all() as (Omit<ProductoInventario, 'activo'> & { activo: number })[];
  return filas.map((f) => ({ ...f, activo: f.activo === 1 }));
}

/**
 * Bodegas que son columnas del inventario: las activas y las inactivas que
 * aún tienen existencias. Primero la principal.
 *
 * @param db - Conexión abierta.
 * @returns Bodegas.
 */
export function bodegasDeInventario(db: BaseDeDatos): BodegaReporte[] {
  return db
    .prepare(
      `SELECT b.id, b.nombre FROM bodegas b
       WHERE b.activo = 1 OR EXISTS (
         SELECT 1 FROM movimientos_inventario m WHERE m.bodega_id = b.id
         GROUP BY m.producto_codigo HAVING SUM(m.cantidad) <> 0)
       ORDER BY b.es_principal DESC, b.id`,
    )
    .all() as BodegaReporte[];
}
