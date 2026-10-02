import type { ValorJson } from '../../domain/auditoria';
import type {
  AbonoResumen,
  AplicacionAbono,
  AplicacionAbonoDetalle,
  EstadoAbono,
} from '../../shared/abonos';
import type { BaseDeDatos } from '../conexion';
import type { ContextoTransaccion } from '../transaccion';
import { saldosFacturasProveedor } from './compras.repo';

/**
 * Abono a proveedor ya validado, listo para guardar.
 */
export interface AbonoProveedorARegistrar {
  /** Número (consecutivo). */
  numero: number;
  /** Proveedor. */
  proveedorCodigo: number;
  /** Fecha, `AAAA-MM-DD`. */
  fecha: string;
  /** Forma de pago. */
  formaPagoId: number;
  /** Valor. */
  valor: number;
  /** Observación limpia. */
  observacion: string;
  /** `contado` si lo crea una compra «Pagada de contado» (D-48). */
  origen: 'manual' | 'contado';
  /** Reparto validado (solo valores mayores que cero). */
  aplicaciones: AplicacionAbono[];
}

/**
 * Abono a proveedor con los datos que necesita el recibo.
 */
export interface AbonoProveedorDetalle extends AbonoResumen {
  /** Código del proveedor. */
  proveedorCodigo: number;
  /** Nombre del proveedor. */
  proveedorNombre: string;
  /** Tipo y número de identificación del proveedor, p. ej. `NIT 900123456-7`. */
  proveedorIdentificacion: string;
  /** Fecha ISO en que se registró. */
  registradoEn: string;
}

/**
 * Fila de la consulta de abonos.
 */
interface FilaAbono {
  /** Id. */
  id: number;
  /** Número. */
  numero: number;
  /** Fecha. */
  fecha: string;
  /** Forma de pago. */
  formaPagoNombre: string;
  /** Valor. */
  valor: number;
  /** Observación. */
  observacion: string;
  /** Origen. */
  origen: 'manual' | 'contado';
  /** Estado. */
  estado: EstadoAbono;
  /** Fecha de anulación. */
  anuladoEn: string | null;
  /** Motivo de anulación. */
  motivoAnulacion: string | null;
  /** Proveedor. */
  proveedorCodigo: number;
  /** Nombre del proveedor. */
  proveedorNombre: string;
  /** Tipo de identificación. */
  tipoIdentificacion: string;
  /** Número de identificación. */
  numeroIdentificacion: string;
  /** Fecha de registro. */
  registradoEn: string;
}

/**
 * Consulta base de los abonos a proveedor.
 */
const CONSULTA_ABONOS = `
  SELECT a.id, a.numero, a.fecha, fp.nombre AS formaPagoNombre, a.valor, a.observacion, a.origen,
         a.estado, a.anulado_en AS anuladoEn, a.motivo_anulacion AS motivoAnulacion,
         a.proveedor_codigo AS proveedorCodigo, p.nombre AS proveedorNombre,
         p.tipo_identificacion AS tipoIdentificacion, p.numero_identificacion AS numeroIdentificacion,
         a.registrado_en AS registradoEn
  FROM abonos a
  JOIN formas_pago fp ON fp.id = a.forma_pago_id
  JOIN proveedores p ON p.codigo = a.proveedor_codigo
  WHERE a.tipo = 'proveedor'`;

/**
 * Lee las aplicaciones de un abono con los datos de cada compra.
 *
 * @param db - Conexión abierta.
 * @param abonoId - Abono.
 * @param saldos - Saldo actual de las facturas del proveedor.
 * @returns Aplicaciones en el orden de las compras.
 */
function aplicacionesDe(
  db: BaseDeDatos,
  abonoId: number,
  saldos: ReadonlyMap<number, number>,
): AplicacionAbonoDetalle[] {
  const filas = db
    .prepare(
      `SELECT ap.factura_proveedor_id AS facturaId, ap.valor, f.numero AS compraNumero,
              f.numero_proveedor AS numeroProveedor
       FROM abonos_aplicaciones ap JOIN facturas_proveedor f ON f.id = ap.factura_proveedor_id
       WHERE ap.abono_id = ? ORDER BY f.fecha, f.numero`,
    )
    .all(abonoId) as Omit<AplicacionAbonoDetalle, 'saldoActual'>[];
  return filas.map((f) => ({ ...f, saldoActual: saldos.get(f.facturaId) ?? 0 }));
}

/**
 * Convierte una fila en el detalle del abono.
 *
 * @param db - Conexión abierta.
 * @param fila - Fila leída.
 * @param saldos - Saldo actual de las facturas del proveedor.
 * @returns El abono.
 */
function aDetalle(
  db: BaseDeDatos,
  fila: FilaAbono,
  saldos: ReadonlyMap<number, number>,
): AbonoProveedorDetalle {
  const { tipoIdentificacion, numeroIdentificacion, ...resto } = fila;
  return {
    ...resto,
    proveedorIdentificacion: `${tipoIdentificacion} ${numeroIdentificacion}`,
    aplicaciones: aplicacionesDe(db, fila.id, saldos),
  };
}

/**
 * Inserta un abono a proveedor con su reparto y registra la creación en el historial.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param abono - Abono validado.
 * @returns Id del abono.
 */
export function insertarAbonoProveedor(
  ctx: ContextoTransaccion,
  abono: AbonoProveedorARegistrar,
): number {
  const resultado = ctx.db
    .prepare(
      `INSERT INTO abonos (tipo, numero, proveedor_codigo, fecha, forma_pago_id, valor, observacion,
                           origen, registrado_en)
       VALUES ('proveedor', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      abono.numero,
      abono.proveedorCodigo,
      abono.fecha,
      abono.formaPagoId,
      abono.valor,
      abono.observacion,
      abono.origen,
      ctx.fecha,
    );
  const id = Number(resultado.lastInsertRowid);
  const insertar = ctx.db.prepare(
    'INSERT INTO abonos_aplicaciones (abono_id, factura_proveedor_id, valor) VALUES (?, ?, ?)',
  );
  for (const a of abono.aplicaciones) {
    insertar.run(id, a.facturaId, a.valor);
  }
  const despues: ValorJson = {
    numero: abono.numero,
    proveedorCodigo: abono.proveedorCodigo,
    fecha: abono.fecha,
    formaPagoId: abono.formaPagoId,
    valor: abono.valor,
    observacion: abono.observacion,
    origen: abono.origen,
    aplicaciones: abono.aplicaciones.map((a) => ({ facturaId: a.facturaId, valor: a.valor })),
  };
  ctx.registrarCambio({
    entidad: 'abono_proveedor',
    entidadId: abono.numero,
    accion: 'crear',
    antes: null,
    despues,
  });
  return id;
}

/**
 * Obtiene un abono a proveedor con su reparto.
 *
 * @param db - Conexión abierta.
 * @param id - Id del abono.
 * @returns El abono, o `null` si no existe.
 */
export function obtenerAbonoProveedor(db: BaseDeDatos, id: number): AbonoProveedorDetalle | null {
  const fila = db.prepare(`${CONSULTA_ABONOS} AND a.id = ?`).get(id) as FilaAbono | undefined;
  if (!fila) {
    return null;
  }
  return aDetalle(db, fila, saldosFacturasProveedor(db, fila.proveedorCodigo));
}

/**
 * Lista los abonos de un proveedor, del más reciente al más antiguo.
 *
 * @param db - Conexión abierta.
 * @param proveedorCodigo - Proveedor.
 * @returns Abonos (activos y anulados).
 */
export function listarAbonosProveedor(db: BaseDeDatos, proveedorCodigo: number): AbonoResumen[] {
  const saldos = saldosFacturasProveedor(db, proveedorCodigo);
  const filas = db
    .prepare(`${CONSULTA_ABONOS} AND a.proveedor_codigo = ? ORDER BY a.numero DESC`)
    .all(proveedorCodigo) as FilaAbono[];
  return filas.map((f) => aDetalle(db, f, saldos));
}

/**
 * Anula un abono (el saldo vuelve a las facturas, porque se deriva de los
 * abonos activos) y registra la anulación en el historial con su motivo.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param abono - Abono activo.
 * @param motivo - Motivo (puede ser vacío).
 */
export function anularAbonoProveedor(
  ctx: ContextoTransaccion,
  abono: AbonoResumen,
  motivo: string,
): void {
  ctx.db
    .prepare(
      `UPDATE abonos SET estado = 'anulado', anulado_en = ?, motivo_anulacion = ? WHERE id = ?`,
    )
    .run(ctx.fecha, motivo === '' ? null : motivo, abono.id);
  ctx.registrarCambio({
    entidad: 'abono_proveedor',
    entidadId: abono.numero,
    accion: 'anular',
    antes: { estado: 'activo' },
    despues: {
      estado: 'anulado',
      aplicaciones: abono.aplicaciones.map((a) => ({
        compraNumero: a.compraNumero,
        valor: a.valor,
        saldoAntes: a.saldoActual,
        saldoDespues: a.saldoActual + a.valor,
      })),
    },
    motivo,
  });
}
