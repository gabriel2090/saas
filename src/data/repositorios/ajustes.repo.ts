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
 * Lista los ajustes más recientes.
 *
 * @param db - Conexión abierta.
 * @param limite - Cantidad máxima.
 * @returns Ajustes del más reciente al más antiguo.
 */
export function listarAjustes(db: BaseDeDatos, limite: number): AjusteResumen[] {
  return db
    .prepare(
      `SELECT a.id, a.numero, a.fecha, a.producto_codigo AS productoCodigo,
              p.nombre AS productoNombre, p.unidad, b.nombre AS bodegaNombre, a.tipo, a.cantidad,
              a.stock_anterior AS stockAnterior, a.cantidad_contada AS cantidadContada, a.motivo
       FROM ajustes_inventario a
       JOIN productos p ON p.codigo = a.producto_codigo
       JOIN bodegas b ON b.id = a.bodega_id
       ORDER BY a.numero DESC LIMIT ?`,
    )
    .all(limite) as AjusteResumen[];
}
