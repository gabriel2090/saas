import type {
  DevolucionResumen,
  DevueltoDeRenglon,
  TipoDevolucion,
} from '../../shared/correcciones';
import type { BaseDeDatos } from '../conexion';
import type { ContextoTransaccion } from '../transaccion';

/**
 * Columna de la factura de cada tipo de devolución.
 *
 * @param tipo - Venta o compra.
 * @returns Nombre de la columna en `devoluciones`.
 */
function columnaFactura(tipo: TipoDevolucion): string {
  return tipo === 'venta' ? 'factura_cliente_id' : 'factura_proveedor_id';
}

/**
 * Línea de devolución ya calculada, lista para guardar.
 */
export interface LineaDevolucionARegistrar {
  /** Renglón de la factura. */
  facturaRenglon: number;
  /** Producto. */
  productoCodigo: number;
  /** Milésimas devueltas. */
  cantidad: number;
  /** Precio vendido o costo unitario facturado. */
  valorUnitario: number;
  /** Total de la línea. */
  total: number;
  /** Costo con que se mueve el kardex. */
  costoUnitario: number;
}

/**
 * Devolución ya validada y calculada, lista para guardar.
 */
export interface DevolucionARegistrar {
  /** Venta o compra. */
  tipo: TipoDevolucion;
  /** Número (consecutivo de su tipo). */
  numero: number;
  /** Id de la factura. */
  facturaId: number;
  /** Número de la factura (para el historial). */
  facturaNumero: number;
  /** Versión vigente de la factura. */
  facturaVersion: number;
  /** Día local, `AAAA-MM-DD`. */
  dia: string;
  /** Bodega. */
  bodegaId: number;
  /** Total. */
  total: number;
  /** Motivo limpio. */
  motivo: string;
  /** Líneas con cantidad mayor que cero. */
  lineas: LineaDevolucionARegistrar[];
}

/**
 * Inserta una devolución con sus líneas y la anota en el historial. El
 * kardex y la cartera los registra el servicio en la misma transacción.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param devolucion - Devolución calculada.
 * @returns Id de la devolución.
 */
export function insertarDevolucion(
  ctx: ContextoTransaccion,
  devolucion: DevolucionARegistrar,
): number {
  const venta = devolucion.tipo === 'venta';
  const resultado = ctx.db
    .prepare(
      `INSERT INTO devoluciones
         (tipo, numero, factura_cliente_id, factura_proveedor_id, factura_version, fecha, dia,
          bodega_id, total, motivo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      devolucion.tipo,
      devolucion.numero,
      venta ? devolucion.facturaId : null,
      venta ? null : devolucion.facturaId,
      devolucion.facturaVersion,
      ctx.fecha,
      devolucion.dia,
      devolucion.bodegaId,
      devolucion.total,
      devolucion.motivo,
    );
  const id = Number(resultado.lastInsertRowid);
  const insertar = ctx.db.prepare(
    `INSERT INTO devoluciones_lineas
       (devolucion_id, renglon, factura_renglon, producto_codigo, cantidad, valor_unitario, total,
        costo_unitario)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  devolucion.lineas.forEach((l, i) => {
    insertar.run(
      id,
      i + 1,
      l.facturaRenglon,
      l.productoCodigo,
      l.cantidad,
      l.valorUnitario,
      l.total,
      l.costoUnitario,
    );
  });
  ctx.registrarCambio({
    entidad: venta ? 'devolucion_venta' : 'devolucion_compra',
    entidadId: devolucion.numero,
    accion: 'crear',
    antes: null,
    despues: {
      [venta ? 'facturaNumero' : 'compraNumero']: devolucion.facturaNumero,
      facturaVersion: devolucion.facturaVersion,
      bodegaId: devolucion.bodegaId,
      total: devolucion.total,
      lineas: devolucion.lineas.map((l) => ({ ...l })),
    },
    motivo: devolucion.motivo,
  });
  return id;
}

/**
 * Lista las devoluciones de una factura, de la más reciente a la más antigua.
 *
 * @param db - Conexión abierta.
 * @param tipo - Venta o compra.
 * @param facturaId - Id de la factura.
 * @returns Devoluciones (activas y anuladas).
 */
export function listarDevolucionesDeFactura(
  db: BaseDeDatos,
  tipo: TipoDevolucion,
  facturaId: number,
): DevolucionResumen[] {
  return db
    .prepare(
      `SELECT d.id, d.tipo, d.numero, d.fecha, b.nombre AS bodegaNombre, d.total, d.motivo, d.estado
       FROM devoluciones d JOIN bodegas b ON b.id = d.bodega_id
       WHERE d.${columnaFactura(tipo)} = ? ORDER BY d.numero DESC`,
    )
    .all(facturaId) as DevolucionResumen[];
}

/**
 * Lo ya devuelto de cada renglón de una versión de la factura por
 * devoluciones activas.
 *
 * @param db - Conexión abierta.
 * @param tipo - Venta o compra.
 * @param facturaId - Id de la factura.
 * @param version - Versión vigente.
 * @returns Renglón y milésimas devueltas.
 */
export function devueltoPorRenglon(
  db: BaseDeDatos,
  tipo: TipoDevolucion,
  facturaId: number,
  version: number,
): DevueltoDeRenglon[] {
  return db
    .prepare(
      `SELECT dl.factura_renglon AS renglon, SUM(dl.cantidad) AS cantidad
       FROM devoluciones_lineas dl JOIN devoluciones d ON d.id = dl.devolucion_id
       WHERE d.${columnaFactura(tipo)} = ? AND d.factura_version = ? AND d.estado = 'activa'
       GROUP BY dl.factura_renglon ORDER BY dl.factura_renglon`,
    )
    .all(facturaId, version) as DevueltoDeRenglon[];
}

/**
 * Cantidad de devoluciones (activas y anuladas) de una factura.
 *
 * @param db - Conexión abierta.
 * @param tipo - Venta o compra.
 * @param facturaId - Id de la factura.
 * @returns Cantidad.
 */
export function contarDevoluciones(
  db: BaseDeDatos,
  tipo: TipoDevolucion,
  facturaId: number,
): number {
  const fila = db
    .prepare(`SELECT COUNT(*) AS cantidad FROM devoluciones WHERE ${columnaFactura(tipo)} = ?`)
    .get(facturaId) as { cantidad: number };
  return fila.cantidad;
}

/**
 * Línea de una devolución guardada.
 */
export interface LineaDevolucionGuardada {
  /** Producto. */
  productoCodigo: number;
  /** Milésimas devueltas. */
  cantidad: number;
  /** Costo con que se movió el kardex. */
  costoUnitario: number;
}

/**
 * Devolución guardada con lo necesario para anularla.
 */
export interface DevolucionDetalle extends DevolucionResumen {
  /** Id de la factura. */
  facturaId: number;
  /** Bodega. */
  bodegaId: number;
  /** Líneas. */
  lineas: LineaDevolucionGuardada[];
}

/**
 * Obtiene una devolución con sus líneas.
 *
 * @param db - Conexión abierta.
 * @param id - Id de la devolución.
 * @returns La devolución, o `null` si no existe.
 */
export function obtenerDevolucion(db: BaseDeDatos, id: number): DevolucionDetalle | null {
  const fila = db
    .prepare(
      `SELECT d.id, d.tipo, d.numero, d.fecha, b.nombre AS bodegaNombre, d.total, d.motivo, d.estado,
              COALESCE(d.factura_cliente_id, d.factura_proveedor_id) AS facturaId,
              d.bodega_id AS bodegaId
       FROM devoluciones d JOIN bodegas b ON b.id = d.bodega_id WHERE d.id = ?`,
    )
    .get(id) as Omit<DevolucionDetalle, 'lineas'> | undefined;
  if (!fila) {
    return null;
  }
  const lineas = db
    .prepare(
      `SELECT producto_codigo AS productoCodigo, cantidad, costo_unitario AS costoUnitario
       FROM devoluciones_lineas WHERE devolucion_id = ? ORDER BY renglon`,
    )
    .all(id) as LineaDevolucionGuardada[];
  return { ...fila, lineas };
}

/**
 * Anula una devolución y lo anota en el historial con su motivo. El kardex
 * y la cartera los revierte el servicio en la misma transacción.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param devolucion - Devolución activa.
 * @param motivo - Motivo (puede ser vacío).
 * @returns `true` si se anuló; `false` si ya estaba anulada.
 */
export function anularDevolucion(
  ctx: ContextoTransaccion,
  devolucion: DevolucionResumen,
  motivo: string,
): boolean {
  const resultado = ctx.db
    .prepare(
      `UPDATE devoluciones SET estado = 'anulada', anulada_en = ?, motivo_anulacion = ?
       WHERE id = ? AND estado = 'activa'`,
    )
    .run(ctx.fecha, motivo === '' ? null : motivo, devolucion.id);
  if (resultado.changes !== 1) {
    return false;
  }
  ctx.registrarCambio({
    entidad: devolucion.tipo === 'venta' ? 'devolucion_venta' : 'devolucion_compra',
    entidadId: devolucion.numero,
    accion: 'anular',
    antes: { estado: 'activa' },
    despues: { estado: 'anulada', total: devolucion.total },
    motivo,
  });
  return true;
}
