import type { ValorJson } from '../../domain/auditoria';
import type {
  AbonoResumen,
  AplicacionAbono,
  AplicacionAbonoDetalle,
  EstadoAbono,
  TipoAbono,
} from '../../shared/abonos';
import type { BaseDeDatos } from '../conexion';
import type { ContextoTransaccion } from '../transaccion';
import { saldosFacturasProveedor } from './compras.repo';
import { saldosFacturasCliente } from './ventas.repo';

/**
 * Abono ya validado, listo para guardar.
 */
export interface AbonoARegistrar {
  /** Cliente o proveedor. */
  tipo: TipoAbono;
  /** Número (consecutivo de su tipo). */
  numero: number;
  /** Código del cliente o del proveedor. */
  terceroCodigo: number;
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
 * Abono con los datos que necesita el recibo.
 */
export interface AbonoDetalle extends AbonoResumen {
  /** Código del cliente o del proveedor. */
  terceroCodigo: number;
  /** Nombre del cliente o del proveedor. */
  terceroNombre: string;
  /** Tipo y número de identificación, p. ej. `NIT 900123456-7`. */
  terceroIdentificacion: string;
  /** Fecha ISO en que se registró. */
  registradoEn: string;
}

/**
 * Fila de la consulta de abonos.
 */
interface FilaAbono {
  /** Id. */
  id: number;
  /** Tipo. */
  tipo: TipoAbono;
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
  /** Cliente o proveedor. */
  terceroCodigo: number;
  /** Nombre del tercero. */
  terceroNombre: string;
  /** Tipo de identificación. */
  tipoIdentificacion: string;
  /** Número de identificación. */
  numeroIdentificacion: string;
  /** Fecha de registro. */
  registradoEn: string;
}

/**
 * Consulta base de los abonos (de cliente y de proveedor). El tercero sale
 * de la tabla de su tipo.
 */
const CONSULTA_ABONOS = `
  SELECT a.id, a.tipo, a.numero, a.fecha, fp.nombre AS formaPagoNombre, a.valor, a.observacion,
         a.origen, a.estado, a.anulado_en AS anuladoEn, a.motivo_anulacion AS motivoAnulacion,
         COALESCE(a.proveedor_codigo, a.cliente_codigo) AS terceroCodigo,
         COALESCE(p.nombre, c.nombre) AS terceroNombre,
         COALESCE(p.tipo_identificacion, c.tipo_identificacion) AS tipoIdentificacion,
         COALESCE(p.numero_identificacion, c.numero_identificacion) AS numeroIdentificacion,
         a.registrado_en AS registradoEn
  FROM abonos a
  JOIN formas_pago fp ON fp.id = a.forma_pago_id
  LEFT JOIN proveedores p ON p.codigo = a.proveedor_codigo
  LEFT JOIN clientes c ON c.codigo = a.cliente_codigo`;

/**
 * Saldo actual de las facturas de un tercero.
 *
 * @param db - Conexión abierta.
 * @param tipo - Cliente o proveedor.
 * @param terceroCodigo - Código del tercero.
 * @returns Id de la factura → saldo.
 */
export function saldosFacturas(
  db: BaseDeDatos,
  tipo: TipoAbono,
  terceroCodigo: number,
): Map<number, number> {
  return tipo === 'cliente'
    ? saldosFacturasCliente(db, terceroCodigo)
    : saldosFacturasProveedor(db, terceroCodigo);
}

/**
 * Fila de la consulta de aplicaciones.
 */
type FilaAplicacion = Omit<AplicacionAbonoDetalle, 'saldoActual' | 'saldoInicial'> & {
  saldoInicial: number;
};

/**
 * Lee las aplicaciones de un abono con los datos de cada factura.
 *
 * @param db - Conexión abierta.
 * @param abono - Id y tipo del abono.
 * @param saldos - Saldo actual de las facturas del tercero.
 * @returns Aplicaciones en el orden de las facturas.
 */
function aplicacionesDe(
  db: BaseDeDatos,
  abono: { id: number; tipo: TipoAbono },
  saldos: ReadonlyMap<number, number>,
): AplicacionAbonoDetalle[] {
  const sql =
    abono.tipo === 'cliente'
      ? `SELECT ap.factura_cliente_id AS facturaId, ap.valor, f.numero AS facturaNumero,
                '' AS referencia, f.origen = 'saldo_inicial' AS saldoInicial
         FROM abonos_aplicaciones ap JOIN facturas_cliente f ON f.id = ap.factura_cliente_id
         WHERE ap.abono_id = ? ORDER BY f.dia, f.numero`
      : `SELECT ap.factura_proveedor_id AS facturaId, ap.valor, f.numero AS facturaNumero,
                f.numero_proveedor AS referencia, f.origen = 'saldo_inicial' AS saldoInicial
         FROM abonos_aplicaciones ap JOIN facturas_proveedor f ON f.id = ap.factura_proveedor_id
         WHERE ap.abono_id = ? ORDER BY f.fecha, f.numero`;
  const filas = db.prepare(sql).all(abono.id) as FilaAplicacion[];
  return filas.map((f) => ({
    ...f,
    saldoInicial: f.saldoInicial === 1,
    saldoActual: saldos.get(f.facturaId) ?? 0,
  }));
}

/**
 * Convierte una fila en el detalle del abono.
 *
 * @param db - Conexión abierta.
 * @param fila - Fila leída.
 * @param saldos - Saldo actual de las facturas del tercero.
 * @returns El abono.
 */
function aDetalle(
  db: BaseDeDatos,
  fila: FilaAbono,
  saldos: ReadonlyMap<number, number>,
): AbonoDetalle {
  const { tipoIdentificacion, numeroIdentificacion, ...resto } = fila;
  return {
    ...resto,
    terceroIdentificacion: `${tipoIdentificacion} ${numeroIdentificacion}`,
    aplicaciones: aplicacionesDe(db, fila, saldos),
  };
}

/**
 * Entidad del historial de cada tipo de abono.
 *
 * @param tipo - Cliente o proveedor.
 * @returns `abono_cliente` o `abono_proveedor`.
 */
function entidadAbono(tipo: TipoAbono): string {
  return tipo === 'cliente' ? 'abono_cliente' : 'abono_proveedor';
}

/**
 * Inserta un abono con su reparto y registra la creación en el historial.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param abono - Abono validado.
 * @returns Id del abono.
 */
export function insertarAbono(ctx: ContextoTransaccion, abono: AbonoARegistrar): number {
  const cliente = abono.tipo === 'cliente';
  const resultado = ctx.db
    .prepare(
      `INSERT INTO abonos (tipo, numero, proveedor_codigo, cliente_codigo, fecha, forma_pago_id,
                           valor, observacion, origen, registrado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      abono.tipo,
      abono.numero,
      cliente ? null : abono.terceroCodigo,
      cliente ? abono.terceroCodigo : null,
      abono.fecha,
      abono.formaPagoId,
      abono.valor,
      abono.observacion,
      abono.origen,
      ctx.fecha,
    );
  const id = Number(resultado.lastInsertRowid);
  const insertar = ctx.db.prepare(
    cliente
      ? 'INSERT INTO abonos_aplicaciones (abono_id, factura_cliente_id, valor) VALUES (?, ?, ?)'
      : 'INSERT INTO abonos_aplicaciones (abono_id, factura_proveedor_id, valor) VALUES (?, ?, ?)',
  );
  for (const a of abono.aplicaciones) {
    insertar.run(id, a.facturaId, a.valor);
  }
  const despues: ValorJson = {
    numero: abono.numero,
    [cliente ? 'clienteCodigo' : 'proveedorCodigo']: abono.terceroCodigo,
    fecha: abono.fecha,
    formaPagoId: abono.formaPagoId,
    valor: abono.valor,
    observacion: abono.observacion,
    origen: abono.origen,
    aplicaciones: abono.aplicaciones.map((a) => ({ facturaId: a.facturaId, valor: a.valor })),
  };
  ctx.registrarCambio({
    entidad: entidadAbono(abono.tipo),
    entidadId: abono.numero,
    accion: 'crear',
    antes: null,
    despues,
  });
  return id;
}

/**
 * Obtiene un abono con su reparto.
 *
 * @param db - Conexión abierta.
 * @param id - Id del abono.
 * @returns El abono, o `null` si no existe.
 */
export function obtenerAbono(db: BaseDeDatos, id: number): AbonoDetalle | null {
  const fila = db.prepare(`${CONSULTA_ABONOS} WHERE a.id = ?`).get(id) as FilaAbono | undefined;
  if (!fila) {
    return null;
  }
  return aDetalle(db, fila, saldosFacturas(db, fila.tipo, fila.terceroCodigo));
}

/**
 * Lista los abonos de un cliente o proveedor, del más reciente al más antiguo.
 *
 * @param db - Conexión abierta.
 * @param tipo - Cliente o proveedor.
 * @param terceroCodigo - Código del tercero.
 * @returns Abonos (activos y anulados).
 */
export function listarAbonos(
  db: BaseDeDatos,
  tipo: TipoAbono,
  terceroCodigo: number,
): AbonoResumen[] {
  const saldos = saldosFacturas(db, tipo, terceroCodigo);
  const columna = tipo === 'cliente' ? 'a.cliente_codigo' : 'a.proveedor_codigo';
  const filas = db
    .prepare(`${CONSULTA_ABONOS} WHERE a.tipo = ? AND ${columna} = ? ORDER BY a.numero DESC`)
    .all(tipo, terceroCodigo) as FilaAbono[];
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
export function anularAbono(ctx: ContextoTransaccion, abono: AbonoResumen, motivo: string): void {
  ctx.db
    .prepare(
      `UPDATE abonos SET estado = 'anulado', anulado_en = ?, motivo_anulacion = ? WHERE id = ?`,
    )
    .run(ctx.fecha, motivo === '' ? null : motivo, abono.id);
  ctx.registrarCambio({
    entidad: entidadAbono(abono.tipo),
    entidadId: abono.numero,
    accion: 'anular',
    antes: { estado: 'activo' },
    despues: {
      estado: 'anulado',
      aplicaciones: abono.aplicaciones.map((a) => ({
        [abono.tipo === 'cliente' ? 'facturaNumero' : 'compraNumero']: a.facturaNumero,
        valor: a.valor,
        saldoAntes: a.saldoActual,
        saldoDespues: a.saldoActual + a.valor,
      })),
    },
    motivo,
  });
}
