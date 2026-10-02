import type { ValorJson } from '../../domain/auditoria';
import type { SaldoInicialValidado } from '../../domain/importacion';
import type { BaseDeDatos } from '../conexion';
import type { ContextoTransaccion } from '../transaccion';

/**
 * Motivo con que quedan en el historial los saldos iniciales importados.
 */
export const MOTIVO_SALDO_INICIAL = 'Saldo inicial importado del sistema anterior';

/**
 * Números de factura de cliente ya usados (también los de facturas anuladas,
 * que conservan su número).
 *
 * @param db - Conexión abierta.
 * @returns Números usados.
 */
export function numerosFacturaCliente(db: BaseDeDatos): Set<number> {
  const filas = db.prepare('SELECT numero FROM facturas_cliente').all() as { numero: number }[];
  return new Set(filas.map((f) => f.numero));
}

/**
 * Facturas de proveedor activas como `código|número normalizado`, para
 * detectar duplicados (D-49).
 *
 * @param db - Conexión abierta.
 * @returns Pares registrados.
 */
export function facturasProveedorActivas(db: BaseDeDatos): Set<string> {
  const filas = db
    .prepare(
      `SELECT proveedor_codigo AS codigo, numero_proveedor_clave AS clave
       FROM facturas_proveedor WHERE estado = 'activa'`,
    )
    .all() as { codigo: number; clave: string }[];
  return new Set(filas.map((f) => `${f.codigo}|${f.clave}`));
}

/**
 * Saldo inicial de cliente listo para guardar.
 */
export interface SaldoInicialCliente {
  /** Número de la factura en el sistema anterior. */
  numero: number;
  /** Datos validados. */
  datos: SaldoInicialValidado;
  /** Fecha ISO local de la medianoche del día de la factura. */
  fechaIso: string;
  /** Bodega principal (la columna es obligatoria; el saldo no mueve inventario). */
  bodegaId: number;
}

/**
 * Inserta un saldo inicial de cliente: una factura a crédito sin líneas ni
 * kardex, con el número del sistema anterior y origen `saldo_inicial` (D-86).
 * Su total es el saldo pendiente. Registra la creación en el historial.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param saldo - Saldo inicial.
 * @returns Id de la factura.
 */
export function insertarSaldoInicialCliente(
  ctx: ContextoTransaccion,
  saldo: SaldoInicialCliente,
): number {
  const { datos } = saldo;
  const resultado = ctx.db
    .prepare(
      `INSERT INTO facturas_cliente
         (numero, cliente_codigo, fecha, dia, condicion, plazo_dias, vence, bodega_id, total, origen)
       VALUES (?, ?, ?, ?, 'credito', ?, ?, ?, ?, 'saldo_inicial')`,
    )
    .run(
      saldo.numero,
      datos.terceroCodigo,
      saldo.fechaIso,
      datos.fecha,
      datos.plazoDias,
      datos.vence,
      saldo.bodegaId,
      datos.saldo,
    );
  const id = Number(resultado.lastInsertRowid);
  const contenido: ValorJson = {
    numero: saldo.numero,
    clienteCodigo: datos.terceroCodigo,
    dia: datos.fecha,
    condicion: 'credito',
    plazoDias: datos.plazoDias,
    vence: datos.vence,
    total: datos.saldo,
    origen: 'saldo_inicial',
    lineas: [],
  };
  ctx.db
    .prepare(
      `INSERT INTO facturas_cliente_versiones (factura_id, version, fecha, contenido, motivo)
       VALUES (?, 1, ?, ?, ?)`,
    )
    .run(id, ctx.fecha, JSON.stringify(contenido), MOTIVO_SALDO_INICIAL);
  ctx.registrarCambio({
    entidad: 'factura_cliente',
    entidadId: saldo.numero,
    accion: 'crear',
    antes: null,
    despues: contenido,
    motivo: MOTIVO_SALDO_INICIAL,
  });
  return id;
}

/**
 * Saldo inicial de proveedor listo para guardar.
 */
export interface SaldoInicialProveedor {
  /** Número interno (consecutivo de compras). */
  numero: number;
  /** Número de la factura del proveedor, limpio. */
  numeroProveedor: string;
  /** Número normalizado (D-49). */
  numeroProveedorClave: string;
  /** Datos validados. */
  datos: SaldoInicialValidado;
  /** Bodega principal (la columna es obligatoria; el saldo no mueve inventario). */
  bodegaId: number;
}

/**
 * Inserta un saldo inicial de proveedor: una factura sin líneas, sin kardex
 * y sin cambios de costo, con origen `saldo_inicial` (D-58, D-86). Su total
 * es el saldo pendiente. Registra la creación en el historial.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param saldo - Saldo inicial.
 * @returns Id de la factura.
 */
export function insertarSaldoInicialProveedor(
  ctx: ContextoTransaccion,
  saldo: SaldoInicialProveedor,
): number {
  const { datos } = saldo;
  const resultado = ctx.db
    .prepare(
      `INSERT INTO facturas_proveedor
         (numero, proveedor_codigo, numero_proveedor, numero_proveedor_clave, fecha, plazo_dias,
          vence, bodega_id, subtotal, total, registrada_en, origen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'saldo_inicial')`,
    )
    .run(
      saldo.numero,
      datos.terceroCodigo,
      saldo.numeroProveedor,
      saldo.numeroProveedorClave,
      datos.fecha,
      datos.plazoDias,
      datos.vence,
      saldo.bodegaId,
      datos.saldo,
      datos.saldo,
      ctx.fecha,
    );
  const id = Number(resultado.lastInsertRowid);
  const contenido: ValorJson = {
    numero: saldo.numero,
    proveedorCodigo: datos.terceroCodigo,
    numeroProveedor: saldo.numeroProveedor,
    fecha: datos.fecha,
    plazoDias: datos.plazoDias,
    vence: datos.vence,
    total: datos.saldo,
    origen: 'saldo_inicial',
    lineas: [],
  };
  ctx.db
    .prepare(
      `INSERT INTO facturas_proveedor_versiones (factura_id, version, fecha, contenido, motivo)
       VALUES (?, 1, ?, ?, ?)`,
    )
    .run(id, ctx.fecha, JSON.stringify(contenido), MOTIVO_SALDO_INICIAL);
  ctx.registrarCambio({
    entidad: 'factura_proveedor',
    entidadId: saldo.numero,
    accion: 'crear',
    antes: null,
    despues: contenido,
    motivo: MOTIVO_SALDO_INICIAL,
  });
  return id;
}
