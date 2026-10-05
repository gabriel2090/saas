import type { AccionHistorial, ValorJson } from '../../domain/auditoria';
import type { NombresHistorial, RegistroHistorialLeido } from '../../domain/historial';
import type { MovimientoKardex, OrigenMovimiento } from '../../domain/kardex';
import type { UnidadMedida } from '../../shared/formato/cantidades';
import type { DocumentoVisible } from '../../shared/kardex';
import type { BaseDeDatos } from '../conexion';

/**
 * Producto del kardex: datos del encabezado.
 */
export interface ProductoKardex {
  /** Código. */
  codigo: number;
  /** Nombre. */
  nombre: string;
  /** Unidad. */
  unidad: UnidadMedida;
  /** Costo actual. */
  costo: number;
}

/**
 * Producto del kardex por su código.
 *
 * @param db - Conexión abierta.
 * @param codigo - Código.
 * @returns El producto, o `undefined` si no existe.
 */
export function productoKardex(db: BaseDeDatos, codigo: number): ProductoKardex | undefined {
  return db
    .prepare('SELECT codigo, nombre, unidad, costo FROM productos WHERE codigo = ?')
    .get(codigo) as ProductoKardex | undefined;
}

/**
 * Saldo de un producto antes de un día: suma del kardex con fecha anterior.
 * Las fechas ISO empiezan por el día local, así que comparar el texto con
 * `AAAA-MM-DD` deja fuera todo ese día.
 *
 * @param db - Conexión abierta.
 * @param productoCodigo - Producto.
 * @param bodegaId - Bodega, o `null` para todas.
 * @param dia - Primer día del periodo, `AAAA-MM-DD`.
 * @returns Milésimas.
 */
export function saldoKardexAntes(
  db: BaseDeDatos,
  productoCodigo: number,
  bodegaId: number | null,
  dia: string,
): number {
  const fila = db
    .prepare(
      `SELECT COALESCE(SUM(cantidad), 0) AS saldo FROM movimientos_inventario
       WHERE producto_codigo = @producto AND (@bodega IS NULL OR bodega_id = @bodega) AND fecha < @dia`,
    )
    .get({ producto: productoCodigo, bodega: bodegaId, dia }) as { saldo: number };
  return fila.saldo;
}

/**
 * Fila cruda de {@link movimientosKardex}.
 */
interface FilaMovimiento {
  id: number;
  fecha: string;
  tipo: string;
  cantidad: number;
  costoUnitario: number;
  documentoTipo: string | null;
  documentoId: string | null;
  bodega: string;
  fcId: number | null;
  fcNumero: number | null;
  fcVersion: number | null;
  cliente: string | null;
  fpId: number | null;
  fpNumero: number | null;
  fpReferencia: string | null;
  fpVersion: number | null;
  proveedor: string | null;
  devNumero: number | null;
  devTipo: 'venta' | 'compra' | null;
  devFcId: number | null;
  devFcNumero: number | null;
  devFpId: number | null;
  devFpNumero: number | null;
  devTercero: string | null;
  ajNumero: number | null;
  ajTipo: string | null;
}

/**
 * Convierte la fila cruda en el documento de origen y lo que abre Ctrl+D.
 *
 * @param f - Fila.
 * @returns Origen, tercero y documento visible.
 */
function origenDe(f: FilaMovimiento): {
  origen: OrigenMovimiento;
  tercero: string;
  ver: DocumentoVisible | null;
} {
  if (f.fcId !== null && f.fcNumero !== null) {
    return {
      origen: { clase: 'factura-cliente', numero: f.fcNumero, version: f.fcVersion },
      tercero: f.cliente ?? '',
      ver: { tipo: 'factura-cliente', id: f.fcId, numero: f.fcNumero },
    };
  }
  if (f.fpId !== null && f.fpNumero !== null) {
    return {
      origen: {
        clase: 'factura-proveedor',
        numero: f.fpNumero,
        referencia: f.fpReferencia ?? '',
        version: f.fpVersion,
      },
      tercero: f.proveedor ?? '',
      ver: { tipo: 'factura-proveedor', id: f.fpId, numero: f.fpNumero },
    };
  }
  if (f.devNumero !== null && f.devTipo !== null) {
    const venta = f.devTipo === 'venta';
    const facturaId = venta ? f.devFcId : f.devFpId;
    const facturaNumero = (venta ? f.devFcNumero : f.devFpNumero) ?? 0;
    return {
      origen: { clase: 'devolucion', tipo: f.devTipo, numero: f.devNumero, facturaNumero },
      tercero: f.devTercero ?? '',
      // La devolución no se imprime: Ctrl+D abre la factura devuelta.
      ver:
        facturaId === null
          ? null
          : {
              tipo: venta ? 'factura-cliente' : 'factura-proveedor',
              id: facturaId,
              numero: facturaNumero,
            },
    };
  }
  if (f.ajNumero !== null) {
    return { origen: { clase: 'ajuste', numero: f.ajNumero }, tercero: '', ver: null };
  }
  if (f.documentoTipo === 'importacion') {
    return { origen: { clase: 'importacion' }, tercero: '', ver: null };
  }
  if (f.documentoTipo === 'producto') {
    return { origen: { clase: 'producto' }, tercero: '', ver: null };
  }
  return {
    origen: {
      clase: 'otro',
      texto: [f.documentoTipo, f.documentoId].filter((p) => p !== null).join(' '),
    },
    tercero: '',
    ver: null,
  };
}

/**
 * Movimientos de un producto en un periodo, con su documento de origen,
 * tercero y bodega, del más antiguo al más reciente.
 *
 * @param db - Conexión abierta.
 * @param filtros - Producto, bodega (o `null` para todas) y días `AAAA-MM-DD`.
 * @returns Movimientos listos para el kardex.
 */
export function movimientosKardex(
  db: BaseDeDatos,
  filtros: {
    productoCodigo: number;
    bodegaId: number | null;
    desde: string;
    hastaExclusivo: string;
  },
): MovimientoKardex[] {
  const filas = db
    .prepare(
      `SELECT m.id, m.fecha, m.tipo, m.cantidad, m.costo_unitario AS costoUnitario,
              m.documento_tipo AS documentoTipo, m.documento_id AS documentoId, b.nombre AS bodega,
              fc.id AS fcId, fc.numero AS fcNumero, vc.version AS fcVersion, cl.nombre AS cliente,
              fp.id AS fpId, fp.numero AS fpNumero, fp.numero_proveedor AS fpReferencia,
              vp.version AS fpVersion, pr.nombre AS proveedor,
              d.numero AS devNumero, d.tipo AS devTipo,
              dfc.id AS devFcId, dfc.numero AS devFcNumero, dfp.id AS devFpId, dfp.numero AS devFpNumero,
              COALESCE(dcl.nombre, dpr.nombre) AS devTercero,
              a.numero AS ajNumero, a.tipo AS ajTipo
       FROM movimientos_inventario m
       JOIN bodegas b ON b.id = m.bodega_id
       LEFT JOIN facturas_cliente fc
         ON m.documento_tipo = 'factura_cliente' AND fc.numero = CAST(m.documento_id AS INTEGER)
       LEFT JOIN facturas_cliente_versiones vc
         ON m.tipo = 'correccion_venta' AND vc.factura_id = fc.id AND vc.fecha = m.fecha
       LEFT JOIN clientes cl ON cl.codigo = fc.cliente_codigo
       LEFT JOIN facturas_proveedor fp
         ON m.documento_tipo = 'factura_proveedor' AND fp.numero = CAST(m.documento_id AS INTEGER)
       LEFT JOIN facturas_proveedor_versiones vp
         ON m.tipo = 'correccion_compra' AND vp.factura_id = fp.id AND vp.fecha = m.fecha
       LEFT JOIN proveedores pr ON pr.codigo = fp.proveedor_codigo
       LEFT JOIN devoluciones d
         ON m.documento_tipo IN ('devolucion_venta', 'devolucion_compra')
        AND d.tipo = substr(m.documento_tipo, 12) AND d.numero = CAST(m.documento_id AS INTEGER)
       LEFT JOIN facturas_cliente dfc ON dfc.id = d.factura_cliente_id
       LEFT JOIN clientes dcl ON dcl.codigo = dfc.cliente_codigo
       LEFT JOIN facturas_proveedor dfp ON dfp.id = d.factura_proveedor_id
       LEFT JOIN proveedores dpr ON dpr.codigo = dfp.proveedor_codigo
       LEFT JOIN ajustes_inventario a
         ON m.documento_tipo = 'ajuste' AND a.numero = CAST(m.documento_id AS INTEGER)
       WHERE m.producto_codigo = @producto AND (@bodega IS NULL OR m.bodega_id = @bodega)
         AND m.fecha >= @desde AND m.fecha < @hasta
       ORDER BY m.fecha, m.id`,
    )
    .all({
      producto: filtros.productoCodigo,
      bodega: filtros.bodegaId,
      desde: filtros.desde,
      hasta: filtros.hastaExclusivo,
    }) as FilaMovimiento[];
  return filas.map((f) => ({
    id: f.id,
    fecha: f.fecha,
    tipo: f.tipo,
    tipoAjuste: f.ajTipo,
    cantidad: f.cantidad,
    costoUnitario: f.costoUnitario,
    bodega: f.bodega,
    ...origenDe(f),
  }));
}

/**
 * Fila cruda del historial.
 */
interface FilaHistorialCruda {
  id: number;
  fecha: string;
  entidad: string;
  entidadId: string;
  accion: AccionHistorial;
  antes: string | null;
  despues: string | null;
  motivo: string | null;
}

/**
 * Lee el JSON guardado; si no se puede leer, lo deja como texto para no
 * ocultar el registro.
 *
 * @param json - Texto JSON o `null`.
 * @returns Valor leído.
 */
function leerJson(json: string | null): ValorJson | null {
  if (json === null) return null;
  try {
    return JSON.parse(json) as ValorJson;
  } catch {
    return json;
  }
}

/**
 * Convierte la fila cruda en el registro con el contenido leído.
 *
 * @param f - Fila.
 * @returns Registro.
 */
function aRegistro(f: FilaHistorialCruda): RegistroHistorialLeido {
  return { ...f, antes: leerJson(f.antes), despues: leerJson(f.despues) };
}

/** Columnas del historial con alias. */
const COLUMNAS_HISTORIAL =
  'id, fecha, entidad, entidad_id AS entidadId, accion, antes, despues, motivo';

/**
 * Registros del historial de un periodo, del más reciente al más antiguo.
 *
 * @param db - Conexión abierta.
 * @param filtros - Días (`hastaExclusivo` es el día siguiente al último), entidades y acción.
 * @returns Registros con el contenido leído.
 */
export function historialDelPeriodo(
  db: BaseDeDatos,
  filtros: {
    desde: string;
    hastaExclusivo: string;
    entidades: readonly string[] | null;
    accion: AccionHistorial | null;
  },
): RegistroHistorialLeido[] {
  const condiciones = ['fecha >= ?', 'fecha < ?'];
  const parametros: (string | number)[] = [filtros.desde, filtros.hastaExclusivo];
  if (filtros.entidades !== null) {
    condiciones.push(`entidad IN (${filtros.entidades.map(() => '?').join(', ')})`);
    parametros.push(...filtros.entidades);
  }
  if (filtros.accion !== null) {
    condiciones.push('accion = ?');
    parametros.push(filtros.accion);
  }
  const filas = db
    .prepare(
      `SELECT ${COLUMNAS_HISTORIAL} FROM historial_cambios
       WHERE ${condiciones.join(' AND ')} ORDER BY id DESC`,
    )
    .all(...parametros) as FilaHistorialCruda[];
  return filas.map(aRegistro);
}

/**
 * Un registro del historial por su id.
 *
 * @param db - Conexión abierta.
 * @param id - Id del registro.
 * @returns Registro, o `undefined` si no existe.
 */
export function registroHistorial(db: BaseDeDatos, id: number): RegistroHistorialLeido | undefined {
  const fila = db
    .prepare(`SELECT ${COLUMNAS_HISTORIAL} FROM historial_cambios WHERE id = ?`)
    .get(id) as FilaHistorialCruda | undefined;
  return fila ? aRegistro(fila) : undefined;
}

/**
 * Nombres de clientes, proveedores, productos, formas de pago y bodegas
 * para traducir los códigos del historial (activos e inactivos).
 *
 * @param db - Conexión abierta.
 * @returns Funciones de consulta en memoria.
 */
export function nombresHistorial(db: BaseDeDatos): NombresHistorial {
  /**
   * Mapa código → nombre de una tabla.
   *
   * @param sql - Consulta con `codigo` y `nombre`.
   * @returns Mapa.
   */
  const mapa = (sql: string): Map<number, string> =>
    new Map(
      (db.prepare(sql).all() as { codigo: number; nombre: string }[]).map((f) => [
        f.codigo,
        f.nombre,
      ]),
    );
  const clientes = mapa('SELECT codigo, nombre FROM clientes');
  const proveedores = mapa('SELECT codigo, nombre FROM proveedores');
  const formas = mapa('SELECT id AS codigo, nombre FROM formas_pago');
  const bodegas = mapa('SELECT id AS codigo, nombre FROM bodegas');
  const productos = new Map(
    (
      db.prepare('SELECT codigo, nombre, unidad FROM productos').all() as {
        codigo: number;
        nombre: string;
        unidad: UnidadMedida;
      }[]
    ).map((p) => [p.codigo, { nombre: p.nombre, unidad: p.unidad }]),
  );
  return {
    cliente: (codigo) => clientes.get(codigo),
    proveedor: (codigo) => proveedores.get(codigo),
    producto: (codigo) => productos.get(codigo),
    formaPago: (id) => formas.get(id),
    bodega: (id) => bodegas.get(id),
  };
}

/**
 * Id interno del documento imprimible de un registro del historial (las
 * facturas y los abonos se guardan con su número en el historial).
 *
 * @param db - Conexión abierta.
 * @param entidad - Entidad del registro.
 * @param numero - Número del documento.
 * @returns Documento visible, o `null` si la entidad no se imprime o no existe.
 */
export function documentoVisibleDeHistorial(
  db: BaseDeDatos,
  entidad: string,
  numero: number,
): DocumentoVisible | null {
  const consultas: Record<string, { sql: string; tipo: DocumentoVisible['tipo'] }> = {
    factura_cliente: {
      sql: 'SELECT id FROM facturas_cliente WHERE numero = ?',
      tipo: 'factura-cliente',
    },
    factura_proveedor: {
      sql: 'SELECT id FROM facturas_proveedor WHERE numero = ?',
      tipo: 'factura-proveedor',
    },
    abono_cliente: {
      sql: "SELECT id FROM abonos WHERE tipo = 'cliente' AND numero = ?",
      tipo: 'abono-cliente',
    },
    abono_proveedor: {
      sql: "SELECT id FROM abonos WHERE tipo = 'proveedor' AND numero = ?",
      tipo: 'abono-proveedor',
    },
  };
  const consulta = consultas[entidad];
  if (!consulta) return null;
  const fila = db.prepare(consulta.sql).get(numero) as { id: number } | undefined;
  return fila ? { tipo: consulta.tipo, id: fila.id, numero } : null;
}
