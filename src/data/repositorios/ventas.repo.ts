import { resumenDeuda } from '../../domain/abonos';
import type { ValorJson } from '../../domain/auditoria';
import type { FacturaPendiente } from '../../shared/abonos';
import type { ResumenDeuda } from '../../shared/compras';
import type { UnidadMedida } from '../../shared/formato/cantidades';
import type { EscalaPrecio } from '../../shared/maestros';
import type {
  BorradorGuardado,
  CondicionPago,
  CreditoCliente,
  FacturaVencida,
} from '../../shared/ventas';
import type { BaseDeDatos } from '../conexion';
import type { ContextoTransaccion } from '../transaccion';

/**
 * Línea de venta ya calculada, lista para guardar.
 */
export interface LineaVentaARegistrar {
  /** Producto. */
  productoCodigo: number;
  /** Escala elegida. */
  escala: EscalaPrecio;
  /** Cantidad en milésimas. */
  cantidad: number;
  /** Precio vigente de la escala. */
  precioEscala: number;
  /** Precio vendido. */
  precio: number;
  /** Si se alteró con F7. */
  alterado: boolean;
  /** Total de la línea. */
  total: number;
  /** Costo del producto al vender. */
  costo: number;
}

/**
 * Factura de cliente ya validada y calculada, lista para guardar.
 */
export interface FacturaARegistrar {
  /** Número (consecutivo). */
  numero: number;
  /** Cliente. */
  clienteCodigo: number;
  /** Día local de la factura, `AAAA-MM-DD`. */
  dia: string;
  /** Contado o crédito. */
  condicion: CondicionPago;
  /** Plazo en días (0 en contado). */
  plazoDias: number;
  /** Vencimiento. */
  vence: string;
  /** Bodega. */
  bodegaId: number;
  /** Total. */
  total: number;
  /** «Su ahorro fue de». */
  ahorro: number;
  /** Forma de pago (contado) o `null`. */
  formaPagoId: number | null;
  /** Lo recibido (contado con cambio) o `null`. */
  recibido: number | null;
  /** Cambio (contado con cambio) o `null`. */
  cambio: number | null;
  /** Cajas de empaque o `null`. */
  cajasEmpaque: number | null;
  /** Líneas. */
  lineas: LineaVentaARegistrar[];
}

/**
 * Línea de una factura guardada, con los datos del producto para imprimirla.
 */
export interface LineaFacturaDetalle extends LineaVentaARegistrar {
  /** Nombre del producto. */
  productoNombre: string;
  /** Unidad del producto. */
  unidad: UnidadMedida;
}

/**
 * Factura de cliente con los datos que necesita la tirilla.
 */
export interface FacturaClienteDetalle {
  /** Id interno. */
  id: number;
  /** Número. */
  numero: number;
  /** Fecha ISO en que se guardó. */
  fecha: string;
  /** Contado o crédito. */
  condicion: CondicionPago;
  /** Plazo en días. */
  plazoDias: number;
  /** Vencimiento, `AAAA-MM-DD`. */
  vence: string;
  /** Total. */
  total: number;
  /** Ahorro. */
  ahorro: number;
  /** Forma de pago (contado) o `null`. */
  formaPagoNombre: string | null;
  /** Lo recibido o `null`. */
  recibido: number | null;
  /** Cambio o `null`. */
  cambio: number | null;
  /** Cajas de empaque o `null`. */
  cajasEmpaque: number | null;
  /** Saldo actual de la factura (0 en contado, D-92). */
  saldo: number;
  /** Estado. */
  estado: 'activa' | 'anulada';
  /** Cliente con los datos que se imprimen (F-09). */
  cliente: {
    codigo: number;
    nombre: string;
    tipoIdentificacion: string;
    numeroIdentificacion: string;
    direccion: string;
    barrio: string;
    ciudad: string;
    celular: string;
  };
  /** Líneas en orden. */
  lineas: LineaFacturaDetalle[];
}

/**
 * Contenido JSON de la factura para el historial y la tabla de versiones.
 *
 * @param factura - Factura.
 * @returns Objeto JSON.
 */
function aJson(factura: FacturaARegistrar): ValorJson {
  return {
    numero: factura.numero,
    clienteCodigo: factura.clienteCodigo,
    dia: factura.dia,
    condicion: factura.condicion,
    plazoDias: factura.plazoDias,
    vence: factura.vence,
    bodegaId: factura.bodegaId,
    total: factura.total,
    ahorro: factura.ahorro,
    formaPagoId: factura.formaPagoId,
    recibido: factura.recibido,
    cambio: factura.cambio,
    cajasEmpaque: factura.cajasEmpaque,
    lineas: factura.lineas.map((l) => ({ ...l })),
  };
}

/**
 * Inserta una factura de cliente con sus líneas y su versión 1, y registra
 * la creación en el historial. El kardex lo registra el servicio en la
 * misma transacción; la cartera se deriva de la factura (saldo = total −
 * abonos activos).
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param factura - Factura calculada.
 * @returns Id de la factura.
 */
export function insertarFactura(ctx: ContextoTransaccion, factura: FacturaARegistrar): number {
  const resultado = ctx.db
    .prepare(
      `INSERT INTO facturas_cliente
         (numero, cliente_codigo, fecha, dia, condicion, plazo_dias, vence, bodega_id, total, ahorro,
          forma_pago_id, recibido, cambio, cajas_empaque)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      factura.numero,
      factura.clienteCodigo,
      ctx.fecha,
      factura.dia,
      factura.condicion,
      factura.plazoDias,
      factura.vence,
      factura.bodegaId,
      factura.total,
      factura.ahorro,
      factura.formaPagoId,
      factura.recibido,
      factura.cambio,
      factura.cajasEmpaque,
    );
  const id = Number(resultado.lastInsertRowid);
  const insertarLinea = ctx.db.prepare(
    `INSERT INTO facturas_cliente_lineas
       (factura_id, renglon, producto_codigo, escala, cantidad, precio_escala, precio, alterado, total, costo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  factura.lineas.forEach((l, i) => {
    insertarLinea.run(
      id,
      i + 1,
      l.productoCodigo,
      l.escala,
      l.cantidad,
      l.precioEscala,
      l.precio,
      l.alterado ? 1 : 0,
      l.total,
      l.costo,
    );
  });
  const contenido = aJson(factura);
  ctx.db
    .prepare(
      'INSERT INTO facturas_cliente_versiones (factura_id, version, fecha, contenido) VALUES (?, 1, ?, ?)',
    )
    .run(id, ctx.fecha, JSON.stringify(contenido));
  ctx.registrarCambio({
    entidad: 'factura_cliente',
    entidadId: factura.numero,
    accion: 'crear',
    antes: null,
    despues: contenido,
  });
  return id;
}

/**
 * Número más alto de factura de cliente ya usado (también las anuladas, que
 * conservan su número).
 *
 * @param db - Conexión abierta.
 * @returns El número, o `null` si aún no hay facturas.
 */
export function ultimoNumeroFactura(db: BaseDeDatos): number | null {
  const fila = db.prepare('SELECT MAX(numero) AS numero FROM facturas_cliente').get() as {
    numero: number | null;
  };
  return fila.numero;
}

/**
 * Consulta de las facturas a crédito activas con su saldo (total menos lo
 * aplicado por abonos activos). Las de contado no generan cartera.
 */
const CONSULTA_SALDOS = `
  SELECT f.id, f.numero, f.dia, f.vence, f.total, f.origen = 'saldo_inicial' AS saldoInicial,
         f.total - COALESCE((
           SELECT SUM(ap.valor) FROM abonos_aplicaciones ap
           JOIN abonos a ON a.id = ap.abono_id
           WHERE ap.factura_cliente_id = f.id AND a.estado = 'activo'
         ), 0) AS saldo
  FROM facturas_cliente f
  WHERE f.cliente_codigo = ? AND f.estado = 'activa' AND f.condicion = 'credito'`;

/**
 * Factura a crédito con saldo.
 */
interface FilaSaldo {
  /** Id. */
  id: number;
  /** Número. */
  numero: number;
  /** Día de la factura. */
  dia: string;
  /** Vencimiento. */
  vence: string;
  /** Total. */
  total: number;
  /** 1 si es un saldo inicial importado. */
  saldoInicial: number;
  /** Saldo pendiente. */
  saldo: number;
}

/**
 * Facturas a crédito del cliente con saldo pendiente, de la más antigua a la
 * más reciente (día y luego número), que es el orden en que se reparte un
 * abono (D-51).
 *
 * @param db - Conexión abierta.
 * @param clienteCodigo - Cliente.
 * @returns Facturas con saldo mayor que cero.
 */
export function facturasPendientesCliente(
  db: BaseDeDatos,
  clienteCodigo: number,
): FacturaPendiente[] {
  const filas = db
    .prepare(`SELECT * FROM (${CONSULTA_SALDOS}) WHERE saldo > 0 ORDER BY dia, numero`)
    .all(clienteCodigo) as FilaSaldo[];
  return filas.map((f) => ({
    id: f.id,
    numero: f.numero,
    referencia: '',
    saldoInicial: f.saldoInicial === 1,
    fecha: f.dia,
    vence: f.vence,
    total: f.total,
    saldo: f.saldo,
  }));
}

/**
 * Saldo actual de cada factura a crédito activa del cliente (también las pagadas).
 *
 * @param db - Conexión abierta.
 * @param clienteCodigo - Cliente.
 * @returns Id de la factura → saldo.
 */
export function saldosFacturasCliente(db: BaseDeDatos, clienteCodigo: number): Map<number, number> {
  const filas = db.prepare(CONSULTA_SALDOS).all(clienteCodigo) as FilaSaldo[];
  return new Map(filas.map((f) => [f.id, f.saldo]));
}

/**
 * Deuda actual del cliente, total y vencida (§5.2).
 *
 * @param db - Conexión abierta.
 * @param clienteCodigo - Cliente.
 * @param hoy - Día de hoy, `AAAA-MM-DD`.
 * @returns Deuda.
 */
export function deudaCliente(db: BaseDeDatos, clienteCodigo: number, hoy: string): ResumenDeuda {
  return resumenDeuda(facturasPendientesCliente(db, clienteCodigo), hoy);
}

/**
 * Situación de crédito de un cliente: tope, deuda total y vencida, la
 * factura vencida más antigua (§5.2, S-03) y el plazo de su última factura
 * a crédito no anulada (D-94).
 *
 * @param db - Conexión abierta.
 * @param clienteCodigo - Cliente.
 * @param tope - Tope de crédito del cliente, o `null`.
 * @param hoy - Día de hoy, `AAAA-MM-DD`.
 * @returns Crédito del cliente.
 */
export function creditoCliente(
  db: BaseDeDatos,
  clienteCodigo: number,
  tope: number | null,
  hoy: string,
): CreditoCliente {
  const pendientes = db
    .prepare(`SELECT * FROM (${CONSULTA_SALDOS}) WHERE saldo > 0 ORDER BY vence, numero`)
    .all(clienteCodigo) as FilaSaldo[];
  const vencida = pendientes.find((f) => f.vence < hoy);
  const vencidaMasAntigua: FacturaVencida | null = vencida
    ? { numero: vencida.numero, vence: vencida.vence }
    : null;
  const ultima = db
    .prepare(
      `SELECT plazo_dias AS plazo FROM facturas_cliente
       WHERE cliente_codigo = ? AND condicion = 'credito' AND estado = 'activa'
       ORDER BY numero DESC LIMIT 1`,
    )
    .get(clienteCodigo) as { plazo: number } | undefined;
  return {
    tope,
    deuda: resumenDeuda(pendientes, hoy),
    vencidaMasAntigua,
    ultimoPlazo: ultima?.plazo ?? null,
  };
}

/**
 * Fila de la consulta del detalle de una factura.
 */
interface FilaFactura {
  /** Id. */
  id: number;
  /** Número. */
  numero: number;
  /** Fecha ISO. */
  fecha: string;
  /** Condición. */
  condicion: CondicionPago;
  /** Plazo. */
  plazoDias: number;
  /** Vencimiento. */
  vence: string;
  /** Total. */
  total: number;
  /** Ahorro. */
  ahorro: number;
  /** Forma de pago. */
  formaPagoNombre: string | null;
  /** Recibido. */
  recibido: number | null;
  /** Cambio. */
  cambio: number | null;
  /** Cajas. */
  cajasEmpaque: number | null;
  /** Estado. */
  estado: 'activa' | 'anulada';
  /** Aplicado por abonos activos. */
  aplicado: number;
  /** Código del cliente. */
  clienteCodigo: number;
  /** Nombre del cliente. */
  clienteNombre: string;
  /** Tipo de identificación. */
  tipoIdentificacion: string;
  /** Número de identificación. */
  numeroIdentificacion: string;
  /** Dirección. */
  direccion: string;
  /** Barrio. */
  barrio: string;
  /** Ciudad. */
  ciudad: string;
  /** Celular. */
  celular: string;
}

/**
 * Obtiene una factura de cliente con sus líneas vigentes y los datos del
 * cliente, para imprimirla.
 *
 * @param db - Conexión abierta.
 * @param id - Id de la factura.
 * @returns La factura, o `null` si no existe.
 */
export function obtenerFacturaCliente(db: BaseDeDatos, id: number): FacturaClienteDetalle | null {
  const fila = db
    .prepare(
      `SELECT f.id, f.numero, f.fecha, f.condicion, f.plazo_dias AS plazoDias, f.vence, f.total,
              f.ahorro, fp.nombre AS formaPagoNombre, f.recibido, f.cambio,
              f.cajas_empaque AS cajasEmpaque, f.estado,
              COALESCE((
                SELECT SUM(ap.valor) FROM abonos_aplicaciones ap
                JOIN abonos a ON a.id = ap.abono_id
                WHERE ap.factura_cliente_id = f.id AND a.estado = 'activo'
              ), 0) AS aplicado,
              c.codigo AS clienteCodigo, c.nombre AS clienteNombre,
              c.tipo_identificacion AS tipoIdentificacion,
              c.numero_identificacion AS numeroIdentificacion, c.direccion, c.barrio, c.ciudad,
              c.celular
       FROM facturas_cliente f
       JOIN clientes c ON c.codigo = f.cliente_codigo
       LEFT JOIN formas_pago fp ON fp.id = f.forma_pago_id
       WHERE f.id = ?`,
    )
    .get(id) as FilaFactura | undefined;
  if (!fila) {
    return null;
  }
  const lineas = db
    .prepare(
      `SELECT l.producto_codigo AS productoCodigo, p.nombre AS productoNombre, p.unidad, l.escala,
              l.cantidad, l.precio_escala AS precioEscala, l.precio, l.alterado, l.total, l.costo
       FROM facturas_cliente_lineas l
       JOIN facturas_cliente f ON f.id = l.factura_id AND f.version = l.version
       JOIN productos p ON p.codigo = l.producto_codigo
       WHERE l.factura_id = ? ORDER BY l.renglon`,
    )
    .all(id) as (Omit<LineaFacturaDetalle, 'alterado'> & { alterado: number })[];
  return {
    id: fila.id,
    numero: fila.numero,
    fecha: fila.fecha,
    condicion: fila.condicion,
    plazoDias: fila.plazoDias,
    vence: fila.vence,
    total: fila.total,
    ahorro: fila.ahorro,
    formaPagoNombre: fila.formaPagoNombre,
    recibido: fila.recibido,
    cambio: fila.cambio,
    cajasEmpaque: fila.cajasEmpaque,
    saldo: fila.condicion === 'credito' ? fila.total - fila.aplicado : 0,
    estado: fila.estado,
    cliente: {
      codigo: fila.clienteCodigo,
      nombre: fila.clienteNombre,
      tipoIdentificacion: fila.tipoIdentificacion,
      numeroIdentificacion: fila.numeroIdentificacion,
      direccion: fila.direccion,
      barrio: fila.barrio,
      ciudad: fila.ciudad,
      celular: fila.celular,
    },
    lineas: lineas.map((l) => ({ ...l, alterado: l.alterado === 1 })),
  };
}

/**
 * Lista los borradores guardados de la ventana de facturar (D-89).
 *
 * @param db - Conexión abierta.
 * @returns Borradores por ranura.
 */
export function listarBorradores(db: BaseDeDatos): BorradorGuardado[] {
  return db
    .prepare(
      'SELECT ranura, contenido, actualizado_en AS actualizadoEn FROM borradores_factura ORDER BY ranura',
    )
    .all() as BorradorGuardado[];
}

/**
 * Autoguarda un borrador. No pasa por el ejecutor de transacciones a
 * propósito: un borrador no es un documento, no va al historial y guardarlo
 * en cada pausa al escribir no debe disparar respaldos (D-89). La sentencia
 * es atómica por sí sola.
 *
 * @param db - Conexión abierta.
 * @param ranura - Ranura de 1 a 6.
 * @param contenido - Formulario en JSON (ya verificado).
 * @param fecha - Fecha ISO del guardado.
 */
export function guardarBorrador(
  db: BaseDeDatos,
  ranura: number,
  contenido: string,
  fecha: string,
): void {
  db.prepare(
    `INSERT INTO borradores_factura (ranura, contenido, actualizado_en) VALUES (?, ?, ?)
     ON CONFLICT (ranura) DO UPDATE SET contenido = excluded.contenido, actualizado_en = excluded.actualizado_en`,
  ).run(ranura, contenido, fecha);
}

/**
 * Descarta un borrador (al limpiarlo o al guardar su factura).
 *
 * @param db - Conexión abierta (o la de la transacción de la factura).
 * @param ranura - Ranura de 1 a 6.
 */
export function borrarBorrador(db: BaseDeDatos, ranura: number): void {
  db.prepare('DELETE FROM borradores_factura WHERE ranura = ?').run(ranura);
}
