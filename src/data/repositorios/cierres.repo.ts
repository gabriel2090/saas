import { diaDeIso, sumarDias } from '../../domain/calendario';
import type { AbonoCaja, FormaPagoCaja, ReintegroCaja, VentaCaja } from '../../domain/cierre-caja';
import {
  CONCEPTOS_CIERRE,
  type CierreAnterior,
  type CierreResumen,
  type ConceptoCierre,
  type ConteoDenominacion,
  type FormaCierre,
} from '../../shared/cierreCaja';
import type { BaseDeDatos } from '../conexion';
import type { ContextoTransaccion } from '../transaccion';

/**
 * Formas de pago del maestro para el cierre.
 *
 * @param db - Conexión abierta.
 * @returns Todas las formas, con su estado.
 */
export function formasPagoCaja(db: BaseDeDatos): FormaPagoCaja[] {
  const filas = db
    .prepare(
      `SELECT id, nombre, calcula_cambio AS calculaCambio, activo, es_sistema AS esSistema
       FROM formas_pago ORDER BY id`,
    )
    .all() as {
    id: number;
    nombre: string;
    calculaCambio: number;
    activo: number;
    esSistema: number;
  }[];
  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    calculaCambio: f.calculaCambio === 1,
    activo: f.activo === 1,
    esSistema: f.esSistema === 1,
  }));
}

/**
 * Documentos candidatos a un tramo.
 */
export interface CandidatosTramo {
  /** Ventas de contado. */
  ventas: VentaCaja[];
  /** Abonos. */
  abonos: AbonoCaja[];
  /** Reintegros. */
  reintegros: ReintegroCaja[];
}

/**
 * Trae los documentos que pueden caer en un tramo: los registrados o
 * anulados entre el día anterior al inicio y el día siguiente al fin. Es un
 * filtro grueso por texto (los momentos son ISO con desfase); el dominio
 * compara los momentos exactos.
 *
 * @param db - Conexión abierta.
 * @param desde - Inicio del tramo, o `null` (desde el principio).
 * @param hasta - Fin del tramo.
 * @returns Ventas de contado, abonos y reintegros candidatos.
 */
export function candidatosTramo(
  db: BaseDeDatos,
  desde: string | null,
  hasta: string,
): CandidatosTramo {
  const inicio = desde === null ? '' : sumarDias(diaDeIso(desde), -1);
  const fin = sumarDias(diaDeIso(hasta), 2);

  const ventas = (
    db
      .prepare(
        `SELECT f.id, f.numero, c.nombre AS tercero, f.forma_pago_id AS formaPagoId,
                f.fecha AS momento,
                COALESCE(json_extract(v.contenido, '$.total'), f.total) AS total,
                f.anulada_en AS anuladaEn
         FROM facturas_cliente f
         JOIN clientes c ON c.codigo = f.cliente_codigo
         LEFT JOIN facturas_cliente_versiones v ON v.factura_id = f.id AND v.version = 1
         WHERE f.condicion = 'contado' AND f.fecha >= ? AND f.fecha < ?`,
      )
      .all(inicio, fin) as VentaCaja[]
  ).map((v) => ({ ...v, total: Number(v.total) }));

  const abonos = (
    db
      .prepare(
        `SELECT a.id, a.tipo, a.numero, COALESCE(c.nombre, p.nombre, '') AS tercero,
                a.forma_pago_id AS formaPagoId, a.fecha AS dia, a.registrado_en AS registradoEn,
                a.anulado_en AS anuladoEn, a.valor, a.origen = 'contado' AS deCompraContado
         FROM abonos a
         LEFT JOIN clientes c ON c.codigo = a.cliente_codigo
         LEFT JOIN proveedores p ON p.codigo = a.proveedor_codigo
         WHERE (a.registrado_en >= ? AND a.registrado_en < ?)
            OR (a.anulado_en >= ? AND a.anulado_en < ?)`,
      )
      .all(inicio, fin, inicio, fin) as (Omit<AbonoCaja, 'deCompraContado'> & {
      deCompraContado: number;
    })[]
  ).map((a) => ({ ...a, deCompraContado: a.deCompraContado === 1 }));

  const reintegros = (
    db
      .prepare(
        `WITH r AS (
           SELECT r.*,
                  CASE r.documento_tipo
                    WHEN 'anulacion_venta' THEN r.documento_id
                    WHEN 'correccion_venta' THEN
                      (SELECT factura_id FROM facturas_cliente_versiones WHERE id = r.documento_id)
                    WHEN 'devolucion' THEN
                      (SELECT factura_cliente_id FROM devoluciones WHERE id = r.documento_id)
                    WHEN 'anulacion_devolucion' THEN
                      (SELECT factura_cliente_id FROM devoluciones WHERE id = r.documento_id)
                  END AS venta_id
           FROM reintegros r
           WHERE (r.fecha >= ? AND r.fecha < ?) OR (r.anulado_en >= ? AND r.anulado_en < ?)
         )
         SELECT r.id, r.numero, COALESCE(c.nombre, p.nombre, '') AS tercero, r.sentido, r.origen,
                r.documento_tipo AS documentoTipo, f.id AS ventaId, f.numero AS ventaNumero,
                f.fecha AS ventaMomento, r.forma_pago_id AS formaPagoId, r.fecha AS momento,
                r.anulado_en AS anuladoEn, r.valor
         FROM r
         LEFT JOIN clientes c ON c.codigo = r.cliente_codigo
         LEFT JOIN proveedores p ON p.codigo = r.proveedor_codigo
         LEFT JOIN facturas_cliente f ON f.id = r.venta_id`,
      )
      .all(inicio, fin, inicio, fin) as (Omit<ReintegroCaja, 'venta'> & {
      ventaId: number | null;
      ventaNumero: number | null;
      ventaMomento: string | null;
    })[]
  ).map(({ ventaId, ventaNumero, ventaMomento, ...r }) => ({
    ...r,
    venta:
      ventaId !== null && ventaNumero !== null && ventaMomento !== null
        ? { id: ventaId, numero: ventaNumero, momento: ventaMomento }
        : null,
  }));

  return { ventas, abonos, reintegros };
}

/**
 * Lista los cierres guardados, del más reciente al más antiguo.
 *
 * @param db - Conexión abierta.
 * @returns Cierres.
 */
export function listarCierres(db: BaseDeDatos): CierreResumen[] {
  return db
    .prepare('SELECT numero, hasta, estado FROM cierres_caja ORDER BY numero DESC')
    .all() as CierreResumen[];
}

/**
 * Último cierre vigente: el punto de partida del cierre nuevo (D-150).
 *
 * @param db - Conexión abierta.
 * @returns El cierre, o `null` si no hay ninguno vigente.
 */
export function cierreAnteriorVigente(db: BaseDeDatos): CierreAnterior | null {
  const fila = db
    .prepare(
      `SELECT numero, hasta, base_queda AS baseQueda FROM cierres_caja
       WHERE estado = 'activo' ORDER BY numero DESC LIMIT 1`,
    )
    .get() as CierreAnterior | undefined;
  return fila ?? null;
}

/**
 * Columnas de cada concepto en `cierres_caja_formas`.
 */
const COLUMNA_CONCEPTO: Readonly<Record<ConceptoCierre, string>> = {
  ventas: 'ventas',
  abonosClientes: 'abonos_clientes',
  reintegrosRecibe: 'reintegros_recibe',
  abonosProveedores: 'abonos_proveedores',
  reintegrosEntrega: 'reintegros_entrega',
  anulacionesAnteriores: 'anulaciones_anteriores',
};

/**
 * Totales y arqueo de una forma de pago guardada.
 */
export interface FormaCierreGuardada {
  /** Columna. */
  forma: FormaCierre;
  /** Valor de cada concepto. */
  conceptos: Record<ConceptoCierre, number>;
  /** Base inicial en esta forma. */
  baseInicial: number;
  /** Esperado. */
  esperado: number;
  /** Contado. */
  contado: number;
  /** Diferencia. */
  diferencia: number;
}

/**
 * Cierre tal como está guardado.
 */
export interface CierreLeido {
  /** Id interno. */
  id: number;
  /** Número. */
  numero: number;
  /** Inicio del tramo, o `null`. */
  desde: string | null;
  /** Fin del tramo. */
  hasta: string;
  /** Cierre anterior vigente al guardarlo, o `null`. */
  anteriorNumero: number | null;
  /** Base inicial. */
  baseInicial: number;
  /** Base que quedó. */
  baseQueda: number;
  /** Observación. */
  observacion: string;
  /** Documentos por concepto. */
  cantidades: Record<ConceptoCierre, number>;
  /** Conteo de billetes y monedas, o `null`. */
  conteo: ConteoDenominacion[] | null;
  /** Estado. */
  estado: 'activo' | 'anulado';
  /** Momento de la anulación, o `null`. */
  anuladoEn: string | null;
  /** Motivo de la anulación, o `null`. */
  motivoAnulacion: string | null;
  /** Totales por forma, en el orden de las columnas. */
  formas: FormaCierreGuardada[];
}

/**
 * Obtiene un cierre guardado con sus totales por forma.
 *
 * @param db - Conexión abierta.
 * @param numero - Número del cierre.
 * @returns El cierre, o `null` si no existe.
 */
export function obtenerCierre(db: BaseDeDatos, numero: number): CierreLeido | null {
  const fila = db
    .prepare(
      `SELECT id, numero, desde, hasta, anterior_numero AS anteriorNumero,
              base_inicial AS baseInicial, base_queda AS baseQueda, observacion, cantidades,
              conteo, estado, anulado_en AS anuladoEn, motivo_anulacion AS motivoAnulacion
       FROM cierres_caja WHERE numero = ?`,
    )
    .get(numero) as
    | (Omit<CierreLeido, 'cantidades' | 'conteo' | 'formas'> & {
        cantidades: string;
        conteo: string | null;
      })
    | undefined;
  if (!fila) return null;
  const formas = (
    db
      .prepare(`SELECT * FROM cierres_caja_formas WHERE cierre_id = ? ORDER BY orden`)
      .all(fila.id) as Record<string, number | string>[]
  ).map((f) => ({
    forma: {
      id: Number(f.forma_pago_id),
      nombre: String(f.forma_nombre),
      seCuenta: f.se_cuenta === 1,
      recibeBase: f.recibe_base === 1,
    },
    conceptos: Object.fromEntries(
      CONCEPTOS_CIERRE.map((c) => [c, Number(f[COLUMNA_CONCEPTO[c]])]),
    ) as Record<ConceptoCierre, number>,
    baseInicial: Number(f.base_inicial),
    esperado: Number(f.esperado),
    contado: Number(f.contado),
    diferencia: Number(f.diferencia),
  }));
  return {
    ...fila,
    cantidades: JSON.parse(fila.cantidades) as Record<ConceptoCierre, number>,
    conteo: fila.conteo === null ? null : (JSON.parse(fila.conteo) as ConteoDenominacion[]),
    formas,
  };
}

/**
 * Cierre validado, listo para guardar.
 */
export interface CierreARegistrar {
  /** Número (consecutivo). */
  numero: number;
  /** Inicio del tramo, o `null`. */
  desde: string | null;
  /** Cierre anterior vigente, o `null`. */
  anteriorNumero: number | null;
  /** Base inicial. */
  baseInicial: number;
  /** Base que queda. */
  baseQueda: number;
  /** Observación. */
  observacion: string;
  /** Documentos por concepto. */
  cantidades: Record<ConceptoCierre, number>;
  /** Conteo, o `null`. */
  conteo: ConteoDenominacion[] | null;
  /** Totales por forma, en el orden de las columnas. */
  formas: FormaCierreGuardada[];
}

/**
 * Registra un cierre de caja (su `hasta` es el momento de la transacción) con
 * sus totales por forma, y lo anota en el historial.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param cierre - Cierre validado.
 * @returns Id del cierre.
 */
export function insertarCierre(ctx: ContextoTransaccion, cierre: CierreARegistrar): number {
  const resultado = ctx.db
    .prepare(
      `INSERT INTO cierres_caja
         (numero, desde, hasta, dia, anterior_numero, base_inicial, base_queda, observacion,
          cantidades, conteo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      cierre.numero,
      cierre.desde,
      ctx.fecha,
      diaDeIso(ctx.fecha),
      cierre.anteriorNumero,
      cierre.baseInicial,
      cierre.baseQueda,
      cierre.observacion,
      JSON.stringify(cierre.cantidades),
      cierre.conteo === null ? null : JSON.stringify(cierre.conteo),
    );
  const id = Number(resultado.lastInsertRowid);
  const insertarForma = ctx.db.prepare(
    `INSERT INTO cierres_caja_formas
       (cierre_id, orden, forma_pago_id, forma_nombre, se_cuenta, recibe_base, ventas,
        abonos_clientes, reintegros_recibe, abonos_proveedores, reintegros_entrega,
        anulaciones_anteriores, base_inicial, esperado, contado, diferencia)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  cierre.formas.forEach((f, i) => {
    insertarForma.run(
      id,
      i + 1,
      f.forma.id,
      f.forma.nombre,
      f.forma.seCuenta ? 1 : 0,
      f.forma.recibeBase ? 1 : 0,
      f.conceptos.ventas,
      f.conceptos.abonosClientes,
      f.conceptos.reintegrosRecibe,
      f.conceptos.abonosProveedores,
      f.conceptos.reintegrosEntrega,
      f.conceptos.anulacionesAnteriores,
      f.baseInicial,
      f.esperado,
      f.contado,
      f.diferencia,
    );
  });
  const suma = (campo: 'esperado' | 'contado' | 'diferencia'): number =>
    cierre.formas.reduce((s, f) => s + f[campo], 0);
  ctx.registrarCambio({
    entidad: 'cierre_caja',
    entidadId: cierre.numero,
    accion: 'crear',
    antes: null,
    despues: {
      desde: cierre.desde,
      hasta: ctx.fecha,
      baseInicial: cierre.baseInicial,
      baseQueda: cierre.baseQueda,
      esperado: suma('esperado'),
      contado: suma('contado'),
      diferencia: suma('diferencia'),
      observacion: cierre.observacion,
    },
    motivo: null,
  });
  return id;
}

/**
 * Anula un cierre y lo anota en el historial con su motivo.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param numero - Número del cierre (activo y último vigente).
 * @param motivo - Motivo (puede ser vacío).
 * @returns `true` si se anuló; `false` si ya estaba anulado.
 */
export function anularCierre(ctx: ContextoTransaccion, numero: number, motivo: string): boolean {
  const resultado = ctx.db
    .prepare(
      `UPDATE cierres_caja SET estado = 'anulado', anulado_en = ?, motivo_anulacion = ?
       WHERE numero = ? AND estado = 'activo'`,
    )
    .run(ctx.fecha, motivo === '' ? null : motivo, numero);
  if (resultado.changes !== 1) return false;
  ctx.registrarCambio({
    entidad: 'cierre_caja',
    entidadId: numero,
    accion: 'anular',
    antes: { estado: 'activo' },
    despues: { estado: 'anulado' },
    motivo,
  });
  return true;
}
