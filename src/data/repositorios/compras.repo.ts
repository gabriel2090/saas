import { resumenDeuda } from '../../domain/abonos';
import type { ValorJson } from '../../domain/auditoria';
import type { FacturaPendiente } from '../../shared/abonos';
import type { ResumenDeuda } from '../../shared/compras';
import type { BaseDeDatos } from '../conexion';
import type { ContextoTransaccion } from '../transaccion';

/**
 * Línea de compra ya calculada, lista para guardar.
 */
export interface LineaCompraARegistrar {
  /** Producto. */
  productoCodigo: number;
  /** Cantidad en milésimas. */
  cantidad: number;
  /** Costo unitario facturado. */
  costoUnitario: number;
  /** Total de la línea. */
  total: number;
  /** Parte del flete. */
  flete: number;
  /** Parte del descuento (0 si no se reparte). */
  descuento: number;
  /** Costo con que queda el producto. */
  costoNuevo: number;
  /** Costo del producto antes de la compra. */
  costoAnterior: number;
}

/**
 * Factura de proveedor ya validada y calculada, lista para guardar.
 */
export interface CompraARegistrar {
  /** Número interno (consecutivo). */
  numero: number;
  /** Proveedor. */
  proveedorCodigo: number;
  /** Número de la factura del proveedor, limpio. */
  numeroProveedor: string;
  /** Número del proveedor normalizado para detectar duplicados (D-49). */
  numeroProveedorClave: string;
  /** Fecha de la factura. */
  fecha: string;
  /** Plazo en días. */
  plazoDias: number;
  /** Vencimiento. */
  vence: string;
  /** Bodega. */
  bodegaId: number;
  /** Orden de compra. */
  ordenCompra: string;
  /** Subtotal. */
  subtotal: number;
  /** Flete. */
  flete: number;
  /** Si el flete lo cobra el proveedor. */
  fleteProveedor: boolean;
  /** Descuento en pesos. */
  descuento: number;
  /** Porcentaje escrito en centésimas, o `null` si fue en pesos. */
  descuentoPorcentaje: number | null;
  /** Si el descuento se repartió en el costo. */
  descuentoEnCosto: boolean;
  /** Total a pagar. */
  total: number;
  /** Si fue «Pagada de contado». */
  pagadaContado: boolean;
  /** Líneas. */
  lineas: LineaCompraARegistrar[];
}

/**
 * Contenido JSON de la compra para el historial y la tabla de versiones.
 *
 * @param compra - Compra.
 * @returns Objeto JSON.
 */
function aJson(compra: CompraARegistrar): ValorJson {
  return {
    numero: compra.numero,
    proveedorCodigo: compra.proveedorCodigo,
    numeroProveedor: compra.numeroProveedor,
    fecha: compra.fecha,
    plazoDias: compra.plazoDias,
    vence: compra.vence,
    bodegaId: compra.bodegaId,
    ordenCompra: compra.ordenCompra,
    subtotal: compra.subtotal,
    flete: compra.flete,
    fleteProveedor: compra.fleteProveedor,
    descuento: compra.descuento,
    descuentoPorcentaje: compra.descuentoPorcentaje,
    descuentoEnCosto: compra.descuentoEnCosto,
    total: compra.total,
    pagadaContado: compra.pagadaContado,
    lineas: compra.lineas.map((l) => ({ ...l })),
  };
}

/**
 * Inserta una factura de proveedor con sus líneas y su versión 1, y registra
 * la creación en el historial. El kardex, el costo de los productos y el
 * abono de contado los registra el servicio en la misma transacción.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param compra - Compra calculada.
 * @returns Id de la factura.
 */
export function insertarCompra(ctx: ContextoTransaccion, compra: CompraARegistrar): number {
  const resultado = ctx.db
    .prepare(
      `INSERT INTO facturas_proveedor
         (numero, proveedor_codigo, numero_proveedor, numero_proveedor_clave, fecha, plazo_dias,
          vence, bodega_id, orden_compra, subtotal, flete, flete_proveedor, descuento,
          descuento_porcentaje, descuento_en_costo, total, pagada_contado, registrada_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      compra.numero,
      compra.proveedorCodigo,
      compra.numeroProveedor,
      compra.numeroProveedorClave,
      compra.fecha,
      compra.plazoDias,
      compra.vence,
      compra.bodegaId,
      compra.ordenCompra,
      compra.subtotal,
      compra.flete,
      compra.fleteProveedor ? 1 : 0,
      compra.descuento,
      compra.descuentoPorcentaje,
      compra.descuentoEnCosto ? 1 : 0,
      compra.total,
      compra.pagadaContado ? 1 : 0,
      ctx.fecha,
    );
  const id = Number(resultado.lastInsertRowid);
  const insertarLinea = ctx.db.prepare(
    `INSERT INTO facturas_proveedor_lineas
       (factura_id, renglon, producto_codigo, cantidad, costo_unitario, total, flete, descuento,
        costo_nuevo, costo_anterior)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  compra.lineas.forEach((l, i) => {
    insertarLinea.run(
      id,
      i + 1,
      l.productoCodigo,
      l.cantidad,
      l.costoUnitario,
      l.total,
      l.flete,
      l.descuento,
      l.costoNuevo,
      l.costoAnterior,
    );
  });
  const contenido = aJson(compra);
  ctx.db
    .prepare(
      'INSERT INTO facturas_proveedor_versiones (factura_id, version, fecha, contenido) VALUES (?, 1, ?, ?)',
    )
    .run(id, ctx.fecha, JSON.stringify(contenido));
  ctx.registrarCambio({
    entidad: 'factura_proveedor',
    entidadId: compra.numero,
    accion: 'crear',
    antes: null,
    despues: contenido,
  });
  return id;
}

/**
 * Indica si el proveedor ya tiene una factura activa con ese número (D-49).
 *
 * @param db - Conexión abierta.
 * @param proveedorCodigo - Proveedor.
 * @param clave - Número normalizado con `claveNumeroProveedor`.
 * @returns El número interno de la compra que lo usa, o `null`.
 */
export function compraConNumeroProveedor(
  db: BaseDeDatos,
  proveedorCodigo: number,
  clave: string,
): number | null {
  const fila = db
    .prepare(
      `SELECT numero FROM facturas_proveedor
       WHERE proveedor_codigo = ? AND numero_proveedor_clave = ? AND estado = 'activa'`,
    )
    .get(proveedorCodigo, clave) as { numero: number } | undefined;
  return fila?.numero ?? null;
}

/**
 * Plazo de la última compra no anulada del proveedor (D-67).
 *
 * @param db - Conexión abierta.
 * @param proveedorCodigo - Proveedor.
 * @returns Plazo en días, o 0 si no tiene compras.
 */
export function ultimoPlazoProveedor(db: BaseDeDatos, proveedorCodigo: number): number {
  const fila = db
    .prepare(
      `SELECT plazo_dias AS plazo FROM facturas_proveedor
       WHERE proveedor_codigo = ? AND estado = 'activa'
       ORDER BY numero DESC LIMIT 1`,
    )
    .get(proveedorCodigo) as { plazo: number } | undefined;
  return fila?.plazo ?? 0;
}

/**
 * Consulta de las facturas activas de un proveedor con su saldo (total menos
 * lo aplicado por abonos activos). El saldo no se guarda: siempre se deriva.
 */
const CONSULTA_SALDOS = `
  SELECT f.id, f.numero, f.numero_proveedor AS numeroProveedor, f.fecha, f.vence, f.total,
         f.total - COALESCE((
           SELECT SUM(ap.valor) FROM abonos_aplicaciones ap
           JOIN abonos a ON a.id = ap.abono_id
           WHERE ap.factura_proveedor_id = f.id AND a.estado = 'activo'
         ), 0) AS saldo
  FROM facturas_proveedor f
  WHERE f.proveedor_codigo = ? AND f.estado = 'activa'`;

/**
 * Facturas del proveedor con saldo pendiente, de la más antigua a la más
 * reciente (fecha de la factura y luego número interno), que es el orden
 * en que se reparte un abono (D-51).
 *
 * @param db - Conexión abierta.
 * @param proveedorCodigo - Proveedor.
 * @returns Facturas con saldo mayor que cero.
 */
export function facturasPendientesProveedor(
  db: BaseDeDatos,
  proveedorCodigo: number,
): FacturaPendiente[] {
  return db
    .prepare(`SELECT * FROM (${CONSULTA_SALDOS}) WHERE saldo > 0 ORDER BY fecha, numero`)
    .all(proveedorCodigo) as FacturaPendiente[];
}

/**
 * Saldo actual de cada factura activa del proveedor (también las pagadas).
 *
 * @param db - Conexión abierta.
 * @param proveedorCodigo - Proveedor.
 * @returns Id de la factura → saldo.
 */
export function saldosFacturasProveedor(
  db: BaseDeDatos,
  proveedorCodigo: number,
): Map<number, number> {
  const filas = db.prepare(CONSULTA_SALDOS).all(proveedorCodigo) as FacturaPendiente[];
  return new Map(filas.map((f) => [f.id, f.saldo]));
}

/**
 * Deuda actual del proveedor, total y vencida (§5.3).
 *
 * @param db - Conexión abierta.
 * @param proveedorCodigo - Proveedor.
 * @param hoy - Día de hoy, `AAAA-MM-DD`.
 * @returns Deuda.
 */
export function deudaProveedor(
  db: BaseDeDatos,
  proveedorCodigo: number,
  hoy: string,
): ResumenDeuda {
  return resumenDeuda(facturasPendientesProveedor(db, proveedorCodigo), hoy);
}
