import type { AjusteResumen, TipoAjuste } from '../../shared/ajustes';
import type { BaseDeDatos } from '../conexion';
import type { ContextoTransaccion } from '../transaccion';
import { insertarMovimiento } from './kardex.repo';

/**
 * Ajuste de inventario ya validado, listo para guardar.
 */
export interface AjusteARegistrar {
  /** Número (consecutivo). */
  numero: number;
  /** Producto. */
  productoCodigo: number;
  /** Bodega. */
  bodegaId: number;
  /** Tipo. */
  tipo: TipoAjuste;
  /** Lo que mueve el kardex, con signo. */
  cantidad: number;
  /** Stock antes del ajuste. */
  stockAnterior: number;
  /** Cantidad contada (conteo físico) o `null`. */
  cantidadContada: number | null;
  /** Costo del producto. */
  costoUnitario: number;
  /** Motivo. */
  motivo: string;
}

/**
 * Registra un ajuste de inventario y su movimiento de kardex, y lo anota en
 * el historial con su motivo.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param ajuste - Ajuste validado.
 * @returns Id del ajuste.
 */
export function insertarAjuste(ctx: ContextoTransaccion, ajuste: AjusteARegistrar): number {
  const resultado = ctx.db
    .prepare(
      `INSERT INTO ajustes_inventario
         (numero, fecha, producto_codigo, bodega_id, tipo, cantidad, stock_anterior,
          cantidad_contada, costo_unitario, motivo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      ajuste.numero,
      ctx.fecha,
      ajuste.productoCodigo,
      ajuste.bodegaId,
      ajuste.tipo,
      ajuste.cantidad,
      ajuste.stockAnterior,
      ajuste.cantidadContada,
      ajuste.costoUnitario,
      ajuste.motivo,
    );
  const id = Number(resultado.lastInsertRowid);
  insertarMovimiento(ctx, {
    productoCodigo: ajuste.productoCodigo,
    bodegaId: ajuste.bodegaId,
    tipo: 'ajuste',
    cantidad: ajuste.cantidad,
    costoUnitario: ajuste.costoUnitario,
    documento: { tipo: 'ajuste', id: String(ajuste.numero) },
  });
  ctx.registrarCambio({
    entidad: 'ajuste_inventario',
    entidadId: ajuste.numero,
    accion: 'crear',
    antes: null,
    despues: {
      productoCodigo: ajuste.productoCodigo,
      bodegaId: ajuste.bodegaId,
      tipo: ajuste.tipo,
      cantidad: ajuste.cantidad,
      stockAnterior: ajuste.stockAnterior,
      cantidadContada: ajuste.cantidadContada,
    },
    motivo: ajuste.motivo,
  });
  return id;
}

/**
 * Consulta base de los ajustes.
 */
const CONSULTA_AJUSTES = `
  SELECT a.id, a.numero, a.fecha, a.producto_codigo AS productoCodigo,
         p.nombre AS productoNombre, p.unidad, b.nombre AS bodegaNombre, a.tipo, a.cantidad,
         a.stock_anterior AS stockAnterior, a.cantidad_contada AS cantidadContada, a.motivo,
         a.estado, a.anulado_en AS anuladoEn, a.motivo_anulacion AS motivoAnulacion
  FROM ajustes_inventario a
  JOIN productos p ON p.codigo = a.producto_codigo
  JOIN bodegas b ON b.id = a.bodega_id`;

/**
 * Lista los ajustes más recientes.
 *
 * @param db - Conexión abierta.
 * @param limite - Cantidad máxima.
 * @returns Ajustes del más reciente al más antiguo.
 */
export function listarAjustes(db: BaseDeDatos, limite: number): AjusteResumen[] {
  return db
    .prepare(`${CONSULTA_AJUSTES} ORDER BY a.numero DESC LIMIT ?`)
    .all(limite) as AjusteResumen[];
}

/**
 * Ajuste con lo necesario para anularlo.
 */
export interface AjusteDetalle extends AjusteResumen {
  /** Bodega. */
  bodegaId: number;
  /** Costo con que se movió el kardex. */
  costoUnitario: number;
}

/**
 * Obtiene un ajuste.
 *
 * @param db - Conexión abierta.
 * @param id - Id del ajuste.
 * @returns El ajuste, o `null` si no existe.
 */
export function obtenerAjuste(db: BaseDeDatos, id: number): AjusteDetalle | null {
  const fila = db
    .prepare(
      `SELECT x.*, a.bodega_id AS bodegaId, a.costo_unitario AS costoUnitario
       FROM (${CONSULTA_AJUSTES} WHERE a.id = ?) x JOIN ajustes_inventario a ON a.id = x.id`,
    )
    .get(id) as AjusteDetalle | undefined;
  return fila ?? null;
}

/**
 * Anula un ajuste (D-73, D-133): registra el movimiento contrario en el
 * kardex y anota la anulación en el historial con su motivo.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param ajuste - Ajuste activo.
 * @param cantidad - Milésimas con signo del movimiento `anulacion_ajuste`.
 * @param motivo - Motivo (puede ser vacío).
 * @returns `true` si se anuló; `false` si ya estaba anulado.
 */
export function anularAjuste(
  ctx: ContextoTransaccion,
  ajuste: AjusteDetalle,
  cantidad: number,
  motivo: string,
): boolean {
  const resultado = ctx.db
    .prepare(
      `UPDATE ajustes_inventario SET estado = 'anulado', anulado_en = ?, motivo_anulacion = ?
       WHERE id = ? AND estado = 'activo'`,
    )
    .run(ctx.fecha, motivo === '' ? null : motivo, ajuste.id);
  if (resultado.changes !== 1) {
    return false;
  }
  insertarMovimiento(ctx, {
    productoCodigo: ajuste.productoCodigo,
    bodegaId: ajuste.bodegaId,
    tipo: 'anulacion_ajuste',
    cantidad,
    costoUnitario: ajuste.costoUnitario,
    documento: { tipo: 'ajuste', id: String(ajuste.numero) },
  });
  ctx.registrarCambio({
    entidad: 'ajuste_inventario',
    entidadId: ajuste.numero,
    accion: 'anular',
    antes: { estado: 'activo' },
    despues: { estado: 'anulado', movimiento: cantidad },
    motivo,
  });
  return true;
}
