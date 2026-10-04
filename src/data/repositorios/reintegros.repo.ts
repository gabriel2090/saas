import type {
  OrigenReintegro,
  ReintegroResumen,
  SentidoReintegro,
  TipoTercero,
} from '../../shared/correcciones';
import type { BaseDeDatos } from '../conexion';
import type { ContextoTransaccion } from '../transaccion';

/**
 * Documento de una venta de contado al que queda atado un reintegro
 * (D-128). El id es la versión de la factura en una corrección, la
 * devolución en una devolución o su anulación, y la factura en una anulación.
 */
export type DocumentoReintegro =
  'correccion_venta' | 'devolucion' | 'anulacion_devolucion' | 'anulacion_venta';

/**
 * Reintegro ya validado, listo para guardar.
 */
export interface ReintegroARegistrar {
  /** Número (consecutivo). */
  numero: number;
  /** Cliente o proveedor. */
  tipo: TipoTercero;
  /** Código del tercero. */
  terceroCodigo: number;
  /** Entrega o recibe. */
  sentido: SentidoReintegro;
  /** Documento de la venta de contado, o `null` si paga un saldo a favor. */
  documento: { tipo: DocumentoReintegro; id: number } | null;
  /** Día local, `AAAA-MM-DD`. */
  dia: string;
  /** Forma de pago. */
  formaPagoId: number;
  /** Valor (positivo). */
  valor: number;
  /** Observación limpia. */
  observacion: string;
}

/**
 * Registra un reintegro y lo anota en el historial.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param reintegro - Reintegro validado.
 * @returns Id del reintegro.
 */
export function insertarReintegro(
  ctx: ContextoTransaccion,
  reintegro: ReintegroARegistrar,
): number {
  const cliente = reintegro.tipo === 'cliente';
  const origen: OrigenReintegro = reintegro.documento ? 'documento' : 'saldo_favor';
  const resultado = ctx.db
    .prepare(
      `INSERT INTO reintegros
         (numero, tipo, cliente_codigo, proveedor_codigo, sentido, origen, documento_tipo,
          documento_id, fecha, dia, forma_pago_id, valor, observacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      reintegro.numero,
      reintegro.tipo,
      cliente ? reintegro.terceroCodigo : null,
      cliente ? null : reintegro.terceroCodigo,
      reintegro.sentido,
      origen,
      reintegro.documento?.tipo ?? null,
      reintegro.documento?.id ?? null,
      ctx.fecha,
      reintegro.dia,
      reintegro.formaPagoId,
      reintegro.valor,
      reintegro.observacion,
    );
  ctx.registrarCambio({
    entidad: 'reintegro',
    entidadId: reintegro.numero,
    accion: 'crear',
    antes: null,
    despues: {
      tipo: reintegro.tipo,
      terceroCodigo: reintegro.terceroCodigo,
      sentido: reintegro.sentido,
      origen,
      documento: reintegro.documento ? { ...reintegro.documento } : null,
      formaPagoId: reintegro.formaPagoId,
      valor: reintegro.valor,
      observacion: reintegro.observacion,
    },
  });
  return Number(resultado.lastInsertRowid);
}

/**
 * Consulta base de los reintegros, con la descripción del documento que los
 * originó (solo los de una venta de contado).
 */
const CONSULTA_REINTEGROS = `
  SELECT r.id, r.numero, r.tipo, r.sentido, r.origen,
         CASE r.documento_tipo
           WHEN 'correccion_venta' THEN (
             SELECT 'Corrección de la factura ' || f.numero || ' (versión ' || v.version || ')'
             FROM facturas_cliente_versiones v JOIN facturas_cliente f ON f.id = v.factura_id
             WHERE v.id = r.documento_id)
           WHEN 'anulacion_venta' THEN (
             SELECT 'Anulación de la factura ' || f.numero FROM facturas_cliente f
             WHERE f.id = r.documento_id)
           WHEN 'devolucion' THEN (
             SELECT 'Devolución de venta ' || d.numero FROM devoluciones d WHERE d.id = r.documento_id)
           WHEN 'anulacion_devolucion' THEN (
             SELECT 'Anulación de la devolución de venta ' || d.numero FROM devoluciones d
             WHERE d.id = r.documento_id)
         END AS documento,
         r.fecha, fp.nombre AS formaPagoNombre, r.valor, r.observacion, r.estado,
         r.anulado_en AS anuladoEn, r.motivo_anulacion AS motivoAnulacion,
         COALESCE(r.cliente_codigo, r.proveedor_codigo) AS terceroCodigo
  FROM reintegros r
  JOIN formas_pago fp ON fp.id = r.forma_pago_id`;

/**
 * Reintegro con el código de su tercero.
 */
export type ReintegroDetalle = ReintegroResumen & { terceroCodigo: number };

/**
 * Obtiene un reintegro.
 *
 * @param db - Conexión abierta.
 * @param id - Id del reintegro.
 * @returns El reintegro, o `null` si no existe.
 */
export function obtenerReintegro(db: BaseDeDatos, id: number): ReintegroDetalle | null {
  return (
    (db.prepare(`${CONSULTA_REINTEGROS} WHERE r.id = ?`).get(id) as ReintegroDetalle | undefined) ??
    null
  );
}

/**
 * Lista los reintegros de un tercero, del más reciente al más antiguo.
 *
 * @param db - Conexión abierta.
 * @param tipo - Cliente o proveedor.
 * @param terceroCodigo - Código del tercero.
 * @returns Reintegros (activos y anulados).
 */
export function listarReintegros(
  db: BaseDeDatos,
  tipo: TipoTercero,
  terceroCodigo: number,
): ReintegroDetalle[] {
  const columna = tipo === 'cliente' ? 'r.cliente_codigo' : 'r.proveedor_codigo';
  return db
    .prepare(`${CONSULTA_REINTEGROS} WHERE ${columna} = ? ORDER BY r.numero DESC`)
    .all(terceroCodigo) as ReintegroDetalle[];
}

/**
 * Anula un reintegro de saldo a favor y lo anota en el historial con su motivo.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param reintegro - Reintegro activo de origen saldo a favor.
 * @param motivo - Motivo (puede ser vacío).
 * @returns `true` si se anuló; `false` si ya estaba anulado.
 */
export function anularReintegro(
  ctx: ContextoTransaccion,
  reintegro: ReintegroDetalle,
  motivo: string,
): boolean {
  const resultado = ctx.db
    .prepare(
      `UPDATE reintegros SET estado = 'anulado', anulado_en = ?, motivo_anulacion = ?
       WHERE id = ? AND estado = 'activo'`,
    )
    .run(ctx.fecha, motivo === '' ? null : motivo, reintegro.id);
  if (resultado.changes !== 1) {
    return false;
  }
  ctx.registrarCambio({
    entidad: 'reintegro',
    entidadId: reintegro.numero,
    accion: 'anular',
    antes: { estado: 'activo' },
    despues: { estado: 'anulado', valor: reintegro.valor },
    motivo,
  });
  return true;
}
