import type {
  AbonoCuenta,
  DevolucionCuenta,
  EntradaEstadoCuenta,
  FacturaCuenta,
  MovimientoFavorCuenta,
  ReintegroCuenta,
  VersionCuenta,
} from '../../domain/estado-cuenta';
import type { UnidadMedida } from '../../shared/formato/cantidades';
import type { TipoCartera } from '../../shared/reportes';
import type { BaseDeDatos } from '../conexion';

/**
 * Documentos de la cuenta de un tercero (todo lo que el estado de cuenta recorre).
 */
export type DocumentosCuenta = Omit<EntradaEstadoCuenta, 'tipo' | 'desde' | 'hasta'>;

/**
 * Nombres de tablas y columnas de cada cartera.
 */
const TABLAS = {
  cliente: {
    versiones: 'facturas_cliente_versiones',
    tercero: 'cliente_codigo',
    factura: 'factura_cliente_id',
  },
  proveedor: {
    versiones: 'facturas_proveedor_versiones',
    tercero: 'proveedor_codigo',
    factura: 'factura_proveedor_id',
  },
} as const;

/**
 * Consulta de las facturas de la cuenta. En clientes solo cuentan las de
 * crédito: las de contado no generan cartera. El total inicial es el de la
 * versión 1 (las correcciones se recorren aparte).
 */
const CONSULTA_FACTURAS: Record<TipoCartera, string> = {
  cliente: `
    SELECT f.id, f.numero, '' AS referencia, f.origen = 'saldo_inicial' AS saldoInicial,
           0 AS contado, f.dia, f.fecha AS momento, f.plazo_dias AS plazoDias, f.vence,
           COALESCE(json_extract(v.contenido, '$.total'), f.total) AS totalInicial,
           f.anulada_en AS anuladaEn, COALESCE(f.motivo_anulacion, '') AS motivoAnulacion
    FROM facturas_cliente f
    LEFT JOIN facturas_cliente_versiones v ON v.factura_id = f.id AND v.version = 1
    WHERE f.cliente_codigo = ? AND f.condicion = 'credito'`,
  proveedor: `
    SELECT f.id, f.numero, f.numero_proveedor AS referencia,
           f.origen = 'saldo_inicial' AS saldoInicial, f.pagada_contado AS contado,
           f.fecha AS dia, f.registrada_en AS momento, f.plazo_dias AS plazoDias, f.vence,
           COALESCE(json_extract(v.contenido, '$.total'), f.total) AS totalInicial,
           f.anulada_en AS anuladaEn, COALESCE(f.motivo_anulacion, '') AS motivoAnulacion
    FROM facturas_proveedor f
    LEFT JOIN facturas_proveedor_versiones v ON v.factura_id = f.id AND v.version = 1
    WHERE f.proveedor_codigo = ?`,
};

/**
 * Lee todo lo que movió la cuenta de un cliente o de un proveedor: sus
 * facturas a crédito (o compras) con sus correcciones, abonos con su
 * reparto, devoluciones, reintegros de saldo a favor y su libro de saldo a
 * favor, activos y anulados. El estado de cuenta los recorre en el dominio.
 *
 * @param db - Conexión abierta.
 * @param tipo - Cliente o proveedor.
 * @param codigo - Código del tercero.
 * @returns Documentos de la cuenta.
 */
export function documentosCuenta(
  db: BaseDeDatos,
  tipo: TipoCartera,
  codigo: number,
): DocumentosCuenta {
  const t = TABLAS[tipo];
  const facturas = (
    db.prepare(CONSULTA_FACTURAS[tipo]).all(codigo) as (Omit<
      FacturaCuenta,
      'saldoInicial' | 'contado'
    > & { saldoInicial: number; contado: number })[]
  ).map((f) => ({ ...f, saldoInicial: f.saldoInicial === 1, contado: f.contado === 1 }));

  const filtroFacturas =
    tipo === 'cliente'
      ? `SELECT id FROM facturas_cliente WHERE cliente_codigo = ? AND condicion = 'credito'`
      : 'SELECT id FROM facturas_proveedor WHERE proveedor_codigo = ?';

  const versiones = db
    .prepare(
      `SELECT v.id, v.factura_id AS facturaId, v.version, v.fecha AS momento,
              json_extract(a.contenido, '$.total') AS totalAnterior,
              json_extract(v.contenido, '$.total') AS totalNuevo
       FROM ${t.versiones} v
       JOIN ${t.versiones} a ON a.factura_id = v.factura_id AND a.version = v.version - 1
       WHERE v.version > 1 AND v.factura_id IN (${filtroFacturas})`,
    )
    .all(codigo) as VersionCuenta[];

  const filasAbonos = db
    .prepare(
      `SELECT a.id, a.numero, a.fecha AS dia, a.registrado_en AS momento, fp.nombre AS formaPago,
              fp.es_sistema AS conSaldoFavor, a.origen = 'contado' AS contado,
              a.anulado_en AS anuladoEn, COALESCE(a.motivo_anulacion, '') AS motivoAnulacion
       FROM abonos a JOIN formas_pago fp ON fp.id = a.forma_pago_id
       WHERE a.tipo = ? AND a.${t.tercero} = ?`,
    )
    .all(tipo, codigo) as (Omit<AbonoCuenta, 'aplicaciones' | 'conSaldoFavor' | 'contado'> & {
    conSaldoFavor: number;
    contado: number;
  })[];
  const aplicaciones = db
    .prepare(
      `SELECT ap.abono_id AS abonoId, ap.${t.factura} AS facturaId, ap.valor
       FROM abonos_aplicaciones ap JOIN abonos a ON a.id = ap.abono_id
       WHERE a.tipo = ? AND a.${t.tercero} = ? ORDER BY ap.id`,
    )
    .all(tipo, codigo) as { abonoId: number; facturaId: number; valor: number }[];
  const abonos = filasAbonos.map((a): AbonoCuenta => ({
    ...a,
    conSaldoFavor: a.conSaldoFavor === 1,
    contado: a.contado === 1,
    aplicaciones: aplicaciones
      .filter((ap) => ap.abonoId === a.id)
      .map((ap) => ({ facturaId: ap.facturaId, valor: ap.valor })),
  }));

  const filasDevoluciones = db
    .prepare(
      `SELECT d.id, d.numero, d.${t.factura} AS facturaId, d.dia, d.fecha AS momento, d.total,
              d.anulada_en AS anuladaEn, COALESCE(d.motivo_anulacion, '') AS motivoAnulacion
       FROM devoluciones d WHERE d.${t.factura} IN (${filtroFacturas})`,
    )
    .all(codigo) as Omit<DevolucionCuenta, 'lineas'>[];
  const lineas = db
    .prepare(
      `SELECT l.devolucion_id AS devolucionId, l.cantidad, p.unidad, p.nombre
       FROM devoluciones_lineas l
       JOIN devoluciones d ON d.id = l.devolucion_id
       JOIN productos p ON p.codigo = l.producto_codigo
       WHERE d.${t.factura} IN (${filtroFacturas}) ORDER BY l.devolucion_id, l.renglon`,
    )
    .all(codigo) as {
    devolucionId: number;
    cantidad: number;
    unidad: UnidadMedida;
    nombre: string;
  }[];
  const devoluciones = filasDevoluciones.map((d): DevolucionCuenta => ({
    ...d,
    lineas: lineas
      .filter((l) => l.devolucionId === d.id)
      .map((l) => ({ cantidad: l.cantidad, unidad: l.unidad, nombre: l.nombre })),
  }));

  const reintegros = db
    .prepare(
      `SELECT r.id, r.numero, r.dia, r.fecha AS momento, r.sentido, fp.nombre AS formaPago,
              r.valor, r.anulado_en AS anuladoEn, COALESCE(r.motivo_anulacion, '') AS motivoAnulacion
       FROM reintegros r JOIN formas_pago fp ON fp.id = r.forma_pago_id
       WHERE r.tipo = ? AND r.${t.tercero} = ? AND r.origen = 'saldo_favor'`,
    )
    .all(tipo, codigo) as ReintegroCuenta[];

  const favor = db
    .prepare(
      `SELECT documento_tipo AS documentoTipo, documento_id AS documentoId, fecha AS momento,
              valor, ${t.factura} AS facturaId
       FROM saldos_favor WHERE tipo = ? AND ${t.tercero} = ? ORDER BY id`,
    )
    .all(tipo, codigo) as MovimientoFavorCuenta[];

  return { facturas, versiones, abonos, devoluciones, reintegros, favor };
}
