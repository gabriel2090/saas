import type { ValorJson } from '../../domain/auditoria';
import { claveNumeroProveedor } from '../../domain/compras';
import type {
  AbonoDeFactura,
  CarteraDeFactura,
  CostoDeProductoEnCompra,
  FacturaClienteParaCorregir,
  FacturaProveedorParaCorregir,
  LineaCompraDeFactura,
  LineaVentaDeFactura,
  TipoTercero,
  VersionDeFactura,
} from '../../shared/correcciones';
import type { UnidadMedida } from '../../shared/formato/cantidades';
import type { EscalaPrecio } from '../../shared/maestros';
import type { CondicionPago } from '../../shared/ventas';
import type { BaseDeDatos } from '../conexion';
import type { ContextoTransaccion } from '../transaccion';
import { sqlAplicado, sqlDevuelto, sqlTrasladado } from './cartera.sql';
import { devueltoPorRenglon, listarDevolucionesDeFactura } from './devoluciones.repo';
import { saldoFavorDe } from './saldosFavor.repo';

/**
 * Tablas de cada tipo de factura.
 */
const TABLAS = {
  cliente: {
    facturas: 'facturas_cliente',
    lineas: 'facturas_cliente_lineas',
    versiones: 'facturas_cliente_versiones',
    columna: 'factura_cliente_id',
    entidad: 'factura_cliente',
  },
  proveedor: {
    facturas: 'facturas_proveedor',
    lineas: 'facturas_proveedor_lineas',
    versiones: 'facturas_proveedor_versiones',
    columna: 'factura_proveedor_id',
    entidad: 'factura_proveedor',
  },
} as const;

/**
 * Cartera de una factura sin el saldo calculado.
 */
export type CarteraLeida = Omit<CarteraDeFactura, 'saldo'>;

/**
 * Lee la cartera de una factura (D-127): total, aplicado, devuelto y trasladado.
 *
 * @param db - Conexión abierta (o la de la transacción).
 * @param tipo - Cliente o proveedor.
 * @param facturaId - Id de la factura.
 * @returns La cartera.
 * @throws {Error} Si la factura no existe.
 */
export function leerCartera(db: BaseDeDatos, tipo: TipoTercero, facturaId: number): CarteraLeida {
  const fila = db
    .prepare(
      `SELECT f.total, ${sqlAplicado(tipo, 'f')} AS aplicado, ${sqlDevuelto(tipo, 'f')} AS devuelto,
              ${sqlTrasladado(tipo, 'f')} AS trasladado
       FROM ${TABLAS[tipo].facturas} f WHERE f.id = ?`,
    )
    .get(facturaId) as CarteraLeida | undefined;
  if (!fila) {
    throw new Error(`No existe la factura ${facturaId}.`);
  }
  return fila;
}

/**
 * Abonos aplicados a una factura (activos y anulados).
 *
 * @param db - Conexión abierta.
 * @param tipo - Cliente o proveedor.
 * @param facturaId - Id de la factura.
 * @returns Abonos en orden de número.
 */
export function abonosDeFactura(
  db: BaseDeDatos,
  tipo: TipoTercero,
  facturaId: number,
): AbonoDeFactura[] {
  return db
    .prepare(
      `SELECT a.id, a.numero, a.fecha, fp.nombre AS formaPagoNombre, ap.valor, a.estado, a.origen
       FROM abonos_aplicaciones ap
       JOIN abonos a ON a.id = ap.abono_id
       JOIN formas_pago fp ON fp.id = a.forma_pago_id
       WHERE ap.${TABLAS[tipo].columna} = ? ORDER BY a.numero`,
    )
    .all(facturaId) as AbonoDeFactura[];
}

/**
 * Versiones de una factura, de la original a la vigente.
 *
 * @param db - Conexión abierta.
 * @param tipo - Cliente o proveedor.
 * @param facturaId - Id de la factura.
 * @returns Versiones.
 */
function versionesDeFactura(
  db: BaseDeDatos,
  tipo: TipoTercero,
  facturaId: number,
): VersionDeFactura[] {
  return db
    .prepare(
      `SELECT version, fecha, json_extract(contenido, '$.total') AS total, motivo
       FROM ${TABLAS[tipo].versiones} WHERE factura_id = ? ORDER BY version`,
    )
    .all(facturaId) as VersionDeFactura[];
}

/**
 * Busca una factura de cliente por su número.
 *
 * @param db - Conexión abierta.
 * @param numero - Número de la factura.
 * @returns Id, o `null` si no existe.
 */
export function idVentaPorNumero(db: BaseDeDatos, numero: number): number | null {
  const fila = db.prepare('SELECT id FROM facturas_cliente WHERE numero = ?').get(numero) as
    { id: number } | undefined;
  return fila?.id ?? null;
}

/**
 * Fila del encabezado de una factura de cliente.
 */
interface FilaVenta {
  /** Id. */
  id: number;
  /** Número. */
  numero: number;
  /** Fecha ISO. */
  fecha: string;
  /** Origen. */
  origen: 'venta' | 'saldo_inicial';
  /** Condición. */
  condicion: CondicionPago;
  /** Plazo. */
  plazoDias: number;
  /** Vencimiento. */
  vence: string;
  /** Bodega. */
  bodegaId: number;
  /** Nombre de la bodega. */
  bodegaNombre: string;
  /** Versión. */
  version: number;
  /** Estado. */
  estado: 'activa' | 'anulada';
  /** Anulada en. */
  anuladaEn: string | null;
  /** Motivo de anulación. */
  motivoAnulacion: string | null;
  /** Forma de pago. */
  formaPagoId: number | null;
  /** Nombre de la forma de pago. */
  formaPagoNombre: string | null;
  /** Total. */
  total: number;
  /** Ahorro. */
  ahorro: number;
  /** Cliente. */
  terceroCodigo: number;
  /** Nombre del cliente. */
  terceroNombre: string;
  /** Identificación del cliente. */
  terceroIdentificacion: string;
}

/**
 * Fila de una línea de venta.
 */
interface FilaLineaVenta {
  /** Renglón. */
  renglon: number;
  /** Producto. */
  codigo: number;
  /** Nombre. */
  nombre: string;
  /** Unidad. */
  unidad: UnidadMedida;
  /** Escala. */
  escala: EscalaPrecio;
  /** Cantidad. */
  cantidad: number;
  /** Precio de la escala. */
  precioEscala: number;
  /** Precio vendido. */
  precio: number;
  /** Costo. */
  costo: number;
  /** Total. */
  total: number;
}

/**
 * Calcula el saldo de la cartera; las facturas de contado y las anuladas no
 * tienen saldo.
 *
 * @param cartera - Cartera leída.
 * @param conSaldo - Si la factura tiene cartera (crédito o compra) y está activa.
 * @returns Cartera con el saldo.
 */
function conSaldo(cartera: CarteraLeida, conSaldo: boolean): CarteraDeFactura {
  return {
    ...cartera,
    saldo: conSaldo ? cartera.total - cartera.aplicado - cartera.devuelto + cartera.trasladado : 0,
  };
}

/**
 * Obtiene una factura de cliente con su versión vigente, su cartera, sus
 * abonos, versiones y devoluciones, para la ventana de corrección y la de
 * devolución.
 *
 * @param db - Conexión abierta.
 * @param id - Id de la factura.
 * @returns La factura, o `null` si no existe.
 */
export function obtenerVentaParaCorregir(
  db: BaseDeDatos,
  id: number,
): FacturaClienteParaCorregir | null {
  const fila = db
    .prepare(
      `SELECT f.id, f.numero, f.fecha, f.origen, f.condicion, f.plazo_dias AS plazoDias, f.vence,
              f.bodega_id AS bodegaId, b.nombre AS bodegaNombre, f.version, f.estado,
              f.anulada_en AS anuladaEn, f.motivo_anulacion AS motivoAnulacion,
              f.forma_pago_id AS formaPagoId, fp.nombre AS formaPagoNombre, f.total, f.ahorro,
              c.codigo AS terceroCodigo, c.nombre AS terceroNombre,
              c.tipo_identificacion || ' ' || c.numero_identificacion AS terceroIdentificacion
       FROM facturas_cliente f
       JOIN clientes c ON c.codigo = f.cliente_codigo
       JOIN bodegas b ON b.id = f.bodega_id
       LEFT JOIN formas_pago fp ON fp.id = f.forma_pago_id
       WHERE f.id = ?`,
    )
    .get(id) as FilaVenta | undefined;
  if (!fila) {
    return null;
  }
  const lineas = db
    .prepare(
      `SELECT l.renglon, p.codigo, p.nombre, p.unidad, l.escala, l.cantidad,
              l.precio_escala AS precioEscala, l.precio, l.costo, l.total
       FROM facturas_cliente_lineas l JOIN productos p ON p.codigo = l.producto_codigo
       WHERE l.factura_id = ? AND l.version = ? ORDER BY l.renglon`,
    )
    .all(id, fila.version) as FilaLineaVenta[];
  const { terceroCodigo, terceroNombre, terceroIdentificacion, ...encabezado } = fila;
  return {
    ...encabezado,
    tercero: {
      codigo: terceroCodigo,
      nombre: terceroNombre,
      identificacion: terceroIdentificacion,
    },
    lineas: lineas.map((l): LineaVentaDeFactura => ({
      renglon: l.renglon,
      producto: { codigo: l.codigo, nombre: l.nombre, unidad: l.unidad },
      escala: l.escala,
      cantidad: l.cantidad,
      precioEscala: l.precioEscala,
      precio: l.precio,
      costo: l.costo,
      total: l.total,
    })),
    cartera: conSaldo(
      leerCartera(db, 'cliente', id),
      fila.condicion === 'credito' && fila.estado === 'activa',
    ),
    saldoFavor: saldoFavorDe(db, 'cliente', terceroCodigo),
    abonos: abonosDeFactura(db, 'cliente', id),
    versiones: versionesDeFactura(db, 'cliente', id),
    devoluciones: listarDevolucionesDeFactura(db, 'venta', id),
    yaDevuelto: devueltoPorRenglon(db, 'venta', id, fila.version),
  };
}

/**
 * Busca compras por su número interno o por el número de la factura del
 * proveedor (sin importar mayúsculas ni espacios, D-49).
 *
 * @param db - Conexión abierta.
 * @param texto - Número escrito.
 * @returns Compras que coinciden: id, número interno, número del proveedor y nombre del proveedor.
 */
export function buscarCompras(
  db: BaseDeDatos,
  texto: string,
): { id: number; numero: number; numeroProveedor: string; proveedorNombre: string }[] {
  const limpio = texto.trim();
  if (/^\d+$/.test(limpio)) {
    const porNumero = db
      .prepare(
        `SELECT f.id, f.numero, f.numero_proveedor AS numeroProveedor, p.nombre AS proveedorNombre
         FROM facturas_proveedor f JOIN proveedores p ON p.codigo = f.proveedor_codigo
         WHERE f.numero = ?`,
      )
      .all(Number(limpio)) as {
      id: number;
      numero: number;
      numeroProveedor: string;
      proveedorNombre: string;
    }[];
    if (porNumero.length > 0) {
      return porNumero;
    }
  }
  return db
    .prepare(
      `SELECT f.id, f.numero, f.numero_proveedor AS numeroProveedor, p.nombre AS proveedorNombre
       FROM facturas_proveedor f JOIN proveedores p ON p.codigo = f.proveedor_codigo
       WHERE f.numero_proveedor_clave = ? ORDER BY f.estado = 'anulada', f.numero DESC`,
    )
    .all(claveNumeroProveedor(limpio)) as {
    id: number;
    numero: number;
    numeroProveedor: string;
    proveedorNombre: string;
  }[];
}

/**
 * Fila del encabezado de una compra.
 */
interface FilaCompra {
  /** Id. */
  id: number;
  /** Número interno. */
  numero: number;
  /** Número del proveedor. */
  numeroProveedor: string;
  /** Fecha. */
  fecha: string;
  /** Origen. */
  origen: 'compra' | 'saldo_inicial';
  /** Plazo. */
  plazoDias: number;
  /** Vencimiento. */
  vence: string;
  /** Bodega. */
  bodegaId: number;
  /** Nombre de la bodega. */
  bodegaNombre: string;
  /** Versión. */
  version: number;
  /** Estado. */
  estado: 'activa' | 'anulada';
  /** Anulada en. */
  anuladaEn: string | null;
  /** Motivo de anulación. */
  motivoAnulacion: string | null;
  /** Subtotal. */
  subtotal: number;
  /** Flete. */
  flete: number;
  /** 1 si el flete lo cobra el proveedor. */
  fleteProveedor: number;
  /** Descuento en pesos. */
  descuentoPesos: number;
  /** Porcentaje en centésimas o `null`. */
  descuentoPorcentaje: number | null;
  /** 1 si el descuento va al costo. */
  descuentoEnCosto: number;
  /** Total. */
  total: number;
  /** Proveedor. */
  terceroCodigo: number;
  /** Nombre del proveedor. */
  terceroNombre: string;
  /** Identificación. */
  terceroIdentificacion: string;
}

/**
 * Fila de una línea de compra.
 */
interface FilaLineaCompra {
  /** Renglón. */
  renglon: number;
  /** Producto. */
  codigo: number;
  /** Nombre. */
  nombre: string;
  /** Unidad. */
  unidad: UnidadMedida;
  /** Costo actual del producto. */
  costoProducto: number;
  /** Precio mayor. */
  precioMayor: number;
  /** Precio menor. */
  precioMenor: number;
  /** Precio mínimo. */
  precioMinimo: number;
  /** Proveedor del producto. */
  proveedorCodigo: number;
  /** Cantidad. */
  cantidad: number;
  /** Costo unitario facturado. */
  costoUnitario: number;
  /** Total. */
  total: number;
  /** Flete. */
  flete: number;
  /** Descuento. */
  descuento: number;
  /** Costo nuevo. */
  costoNuevo: number;
}

/**
 * Situación del costo de cada producto frente a una compra (D-126): si es su
 * última compra activa (por orden de registro), el costo de la compra
 * activa anterior y la compra posterior que fija el costo.
 *
 * @param db - Conexión abierta (o la de la transacción).
 * @param compraId - Id de la compra.
 * @param productos - Códigos de los productos de la compra.
 * @returns Situación por producto.
 */
export function situacionCostos(
  db: BaseDeDatos,
  compraId: number,
  productos: readonly number[],
): CostoDeProductoEnCompra[] {
  const consulta = db.prepare(
    `SELECT f.id, f.numero, f.fecha, MAX(l.costo_nuevo) AS costoNuevo
     FROM facturas_proveedor f
     JOIN facturas_proveedor_lineas l ON l.factura_id = f.id AND l.version = f.version
     WHERE f.estado = 'activa' AND l.producto_codigo = ?
     GROUP BY f.id ORDER BY f.id`,
  );
  return [...new Set(productos)].map((productoCodigo) => {
    const compras = consulta.all(productoCodigo) as {
      id: number;
      numero: number;
      fecha: string;
      costoNuevo: number;
    }[];
    const anterior = compras.filter((c) => c.id < compraId).at(-1) ?? null;
    const ultima = compras.at(-1) ?? null;
    const esUltima = ultima?.id === compraId;
    return {
      productoCodigo,
      esUltima,
      costoCompraAnterior: anterior?.costoNuevo ?? null,
      compraAnterior: anterior?.numero ?? null,
      compraPosterior:
        !esUltima && ultima && ultima.id > compraId
          ? { numero: ultima.numero, fecha: ultima.fecha }
          : null,
    };
  });
}

/**
 * Obtiene una factura de proveedor con su versión vigente, su cartera, sus
 * abonos, versiones, devoluciones y la situación del costo de sus productos.
 *
 * @param db - Conexión abierta.
 * @param id - Id de la compra.
 * @returns La compra, o `null` si no existe.
 */
export function obtenerCompraParaCorregir(
  db: BaseDeDatos,
  id: number,
): FacturaProveedorParaCorregir | null {
  const fila = db
    .prepare(
      `SELECT f.id, f.numero, f.numero_proveedor AS numeroProveedor, f.fecha, f.origen,
              f.plazo_dias AS plazoDias, f.vence, f.bodega_id AS bodegaId, b.nombre AS bodegaNombre,
              f.version, f.estado, f.anulada_en AS anuladaEn, f.motivo_anulacion AS motivoAnulacion,
              f.subtotal, f.flete, f.flete_proveedor AS fleteProveedor, f.descuento AS descuentoPesos,
              f.descuento_porcentaje AS descuentoPorcentaje, f.descuento_en_costo AS descuentoEnCosto,
              f.total, p.codigo AS terceroCodigo, p.nombre AS terceroNombre,
              p.tipo_identificacion || ' ' || p.numero_identificacion AS terceroIdentificacion
       FROM facturas_proveedor f
       JOIN proveedores p ON p.codigo = f.proveedor_codigo
       JOIN bodegas b ON b.id = f.bodega_id
       WHERE f.id = ?`,
    )
    .get(id) as FilaCompra | undefined;
  if (!fila) {
    return null;
  }
  const lineas = (
    db
      .prepare(
        `SELECT l.renglon, p.codigo, p.nombre, p.unidad, p.costo AS costoProducto,
                p.precio_mayor AS precioMayor, p.precio_menor AS precioMenor,
                p.precio_minimo AS precioMinimo, p.proveedor_codigo AS proveedorCodigo,
                l.cantidad, l.costo_unitario AS costoUnitario, l.total, l.flete, l.descuento,
                l.costo_nuevo AS costoNuevo
         FROM facturas_proveedor_lineas l JOIN productos p ON p.codigo = l.producto_codigo
         WHERE l.factura_id = ? AND l.version = ? ORDER BY l.renglon`,
      )
      .all(id, fila.version) as FilaLineaCompra[]
  ).map((l): LineaCompraDeFactura => ({
    renglon: l.renglon,
    producto: {
      codigo: l.codigo,
      nombre: l.nombre,
      unidad: l.unidad,
      costo: l.costoProducto,
      precios: { mayor: l.precioMayor, menor: l.precioMenor, minimo: l.precioMinimo },
      proveedorCodigo: l.proveedorCodigo,
    },
    cantidad: l.cantidad,
    costoUnitario: l.costoUnitario,
    total: l.total,
    flete: l.flete,
    descuento: l.descuento,
    costoNuevo: l.costoNuevo,
  }));
  const abonos = abonosDeFactura(db, 'proveedor', id);
  const contado = abonos.find((a) => a.origen === 'contado' && a.estado === 'activo') ?? null;
  const {
    terceroCodigo,
    terceroNombre,
    terceroIdentificacion,
    fleteProveedor,
    descuentoPorcentaje,
    descuentoEnCosto,
    ...encabezado
  } = fila;
  return {
    ...encabezado,
    fleteProveedor: fleteProveedor === 1,
    descuento:
      descuentoPorcentaje === null
        ? { modo: 'pesos', valor: fila.descuentoPesos }
        : { modo: 'porcentaje', valor: descuentoPorcentaje },
    descuentoEnCosto: descuentoEnCosto === 1,
    tercero: {
      codigo: terceroCodigo,
      nombre: terceroNombre,
      identificacion: terceroIdentificacion,
    },
    abonoContado: contado ? { id: contado.id, numero: contado.numero } : null,
    lineas,
    costos:
      fila.estado === 'activa'
        ? situacionCostos(
            db,
            id,
            lineas.map((l) => l.producto.codigo),
          )
        : [],
    cartera: conSaldo(leerCartera(db, 'proveedor', id), fila.estado === 'activa'),
    saldoFavor: saldoFavorDe(db, 'proveedor', terceroCodigo),
    abonos,
    versiones: versionesDeFactura(db, 'proveedor', id),
    devoluciones: listarDevolucionesDeFactura(db, 'compra', id),
    yaDevuelto: devueltoPorRenglon(db, 'compra', id, fila.version),
  };
}

/**
 * Contenido JSON de la versión vigente de una factura (para el historial).
 *
 * @param db - Conexión abierta.
 * @param tipo - Cliente o proveedor.
 * @param facturaId - Id de la factura.
 * @param version - Versión.
 * @returns Contenido guardado de esa versión.
 */
function contenidoDeVersion(
  db: BaseDeDatos,
  tipo: TipoTercero,
  facturaId: number,
  version: number,
): ValorJson {
  const fila = db
    .prepare(`SELECT contenido FROM ${TABLAS[tipo].versiones} WHERE factura_id = ? AND version = ?`)
    .get(facturaId, version) as { contenido: string } | undefined;
  return fila ? (JSON.parse(fila.contenido) as ValorJson) : null;
}

/**
 * Cambia la versión vigente de una factura solo si sigue siendo la que se
 * corrigió y está activa: protege contra guardar dos veces la misma
 * corrección o sobre otra que se guardó entre tanto.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param tipo - Cliente o proveedor.
 * @param facturaId - Id de la factura.
 * @param versionAnterior - Versión que se corrigió.
 * @param asignaciones - Columnas a cambiar además de la versión (SQL y valores).
 * @returns `true` si cambió; `false` si la factura ya no estaba en esa versión.
 */
function avanzarVersion(
  ctx: ContextoTransaccion,
  tipo: TipoTercero,
  facturaId: number,
  versionAnterior: number,
  asignaciones: { sql: string; valores: (number | null)[] },
): boolean {
  const resultado = ctx.db
    .prepare(
      `UPDATE ${TABLAS[tipo].facturas} SET version = version + 1, ${asignaciones.sql}
       WHERE id = ? AND version = ? AND estado = 'activa'`,
    )
    .run(...asignaciones.valores, facturaId, versionAnterior);
  return resultado.changes === 1;
}

/**
 * Inserta la fila de la versión nueva con su contenido y motivo, y anota la
 * corrección en el historial (versión anterior y nueva, D-133).
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param tipo - Cliente o proveedor.
 * @param factura - Id, número y versión nueva.
 * @param contenido - Contenido de la versión nueva.
 * @param motivo - Motivo (puede ser vacío).
 * @returns Id de la fila de la versión nueva.
 */
function registrarVersion(
  ctx: ContextoTransaccion,
  tipo: TipoTercero,
  factura: { id: number; numero: number; version: number },
  contenido: ValorJson,
  motivo: string,
): number {
  const antes = contenidoDeVersion(ctx.db, tipo, factura.id, factura.version - 1);
  const resultado = ctx.db
    .prepare(
      `INSERT INTO ${TABLAS[tipo].versiones} (factura_id, version, fecha, contenido, motivo)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      factura.id,
      factura.version,
      ctx.fecha,
      JSON.stringify(contenido),
      motivo === '' ? null : motivo,
    );
  ctx.registrarCambio({
    entidad: TABLAS[tipo].entidad,
    entidadId: factura.numero,
    accion: 'editar',
    antes,
    despues: contenido,
    motivo,
  });
  return Number(resultado.lastInsertRowid);
}

/**
 * Línea de la versión nueva de una factura de cliente.
 */
export interface LineaVentaVersion {
  /** Producto. */
  productoCodigo: number;
  /** Escala. */
  escala: EscalaPrecio;
  /** Cantidad. */
  cantidad: number;
  /** Precio de la escala. */
  precioEscala: number;
  /** Precio vendido. */
  precio: number;
  /** Si difiere del de la escala. */
  alterado: boolean;
  /** Total. */
  total: number;
  /** Costo al vender. */
  costo: number;
}

/**
 * Versión nueva de una factura de cliente.
 */
export interface VersionVentaARegistrar {
  /** Id de la factura. */
  facturaId: number;
  /** Número de la factura. */
  numero: number;
  /** Versión que se corrigió. */
  versionAnterior: number;
  /** Total nuevo. */
  total: number;
  /** Ahorro nuevo. */
  ahorro: number;
  /** Líneas nuevas, en orden. */
  lineas: LineaVentaVersion[];
  /** Motivo limpio. */
  motivo: string;
}

/**
 * Guarda la versión nueva de una factura de cliente: cambia el total, el
 * ahorro y la versión vigente, deja «Recibido» y «Cambio» vacíos (D-129),
 * inserta las líneas nuevas y la fila de la versión, y anota el cambio en
 * el historial.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param version - Versión nueva calculada.
 * @returns Id de la fila de la versión nueva, o `null` si la factura ya no estaba en la versión corregida.
 */
export function insertarVersionVenta(
  ctx: ContextoTransaccion,
  version: VersionVentaARegistrar,
): number | null {
  const avanzo = avanzarVersion(ctx, 'cliente', version.facturaId, version.versionAnterior, {
    sql: 'total = ?, ahorro = ?, recibido = NULL, cambio = NULL',
    valores: [version.total, version.ahorro],
  });
  if (!avanzo) {
    return null;
  }
  const nueva = version.versionAnterior + 1;
  const insertar = ctx.db.prepare(
    `INSERT INTO facturas_cliente_lineas
       (factura_id, version, renglon, producto_codigo, escala, cantidad, precio_escala, precio,
        alterado, total, costo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  version.lineas.forEach((l, i) => {
    insertar.run(
      version.facturaId,
      nueva,
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
  const anterior = contenidoDeVersion(
    ctx.db,
    'cliente',
    version.facturaId,
    version.versionAnterior,
  );
  const contenido: ValorJson = {
    ...(typeof anterior === 'object' && anterior !== null && !Array.isArray(anterior)
      ? anterior
      : {}),
    version: nueva,
    total: version.total,
    ahorro: version.ahorro,
    recibido: null,
    cambio: null,
    lineas: version.lineas.map((l) => ({ ...l })),
  };
  return registrarVersion(
    ctx,
    'cliente',
    { id: version.facturaId, numero: version.numero, version: nueva },
    contenido,
    version.motivo,
  );
}

/**
 * Línea de la versión nueva de una factura de proveedor.
 */
export interface LineaCompraVersion {
  /** Producto. */
  productoCodigo: number;
  /** Cantidad. */
  cantidad: number;
  /** Costo unitario facturado. */
  costoUnitario: number;
  /** Total. */
  total: number;
  /** Parte del flete. */
  flete: number;
  /** Parte del descuento. */
  descuento: number;
  /** Costo nuevo de la línea. */
  costoNuevo: number;
  /** Costo del producto antes de la corrección. */
  costoAnterior: number;
}

/**
 * Versión nueva de una factura de proveedor.
 */
export interface VersionCompraARegistrar {
  /** Id de la compra. */
  facturaId: number;
  /** Número interno. */
  numero: number;
  /** Versión que se corrigió. */
  versionAnterior: number;
  /** Subtotal nuevo. */
  subtotal: number;
  /** Flete nuevo. */
  flete: number;
  /** Descuento nuevo en pesos. */
  descuento: number;
  /** Porcentaje en centésimas, o `null` si es en pesos. */
  descuentoPorcentaje: number | null;
  /** Total nuevo. */
  total: number;
  /** Líneas nuevas, en orden. */
  lineas: LineaCompraVersion[];
  /** Motivo limpio. */
  motivo: string;
}

/**
 * Guarda la versión nueva de una factura de proveedor: cambia subtotal,
 * flete, descuento, total y versión vigente, inserta las líneas nuevas y la
 * fila de la versión, y anota el cambio en el historial.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param version - Versión nueva calculada.
 * @returns Id de la fila de la versión nueva, o `null` si la compra ya no estaba en la versión corregida.
 */
export function insertarVersionCompra(
  ctx: ContextoTransaccion,
  version: VersionCompraARegistrar,
): number | null {
  const avanzo = avanzarVersion(ctx, 'proveedor', version.facturaId, version.versionAnterior, {
    sql: 'subtotal = ?, flete = ?, descuento = ?, descuento_porcentaje = ?, total = ?',
    valores: [
      version.subtotal,
      version.flete,
      version.descuento,
      version.descuentoPorcentaje,
      version.total,
    ],
  });
  if (!avanzo) {
    return null;
  }
  const nueva = version.versionAnterior + 1;
  const insertar = ctx.db.prepare(
    `INSERT INTO facturas_proveedor_lineas
       (factura_id, version, renglon, producto_codigo, cantidad, costo_unitario, total, flete,
        descuento, costo_nuevo, costo_anterior)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  version.lineas.forEach((l, i) => {
    insertar.run(
      version.facturaId,
      nueva,
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
  const anterior = contenidoDeVersion(
    ctx.db,
    'proveedor',
    version.facturaId,
    version.versionAnterior,
  );
  const contenido: ValorJson = {
    ...(typeof anterior === 'object' && anterior !== null && !Array.isArray(anterior)
      ? anterior
      : {}),
    version: nueva,
    subtotal: version.subtotal,
    flete: version.flete,
    descuento: version.descuento,
    descuentoPorcentaje: version.descuentoPorcentaje,
    total: version.total,
    lineas: version.lineas.map((l) => ({ ...l })),
  };
  return registrarVersion(
    ctx,
    'proveedor',
    { id: version.facturaId, numero: version.numero, version: nueva },
    contenido,
    version.motivo,
  );
}

/**
 * Anula una factura (de cliente o de proveedor) solo si sigue activa y en la
 * versión que se vio, y anota la anulación en el historial con su motivo.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param tipo - Cliente o proveedor.
 * @param factura - Id, número y versión vista.
 * @param detalle - Lo que hizo la anulación (para el historial).
 * @param motivo - Motivo (puede ser vacío).
 * @returns `true` si se anuló; `false` si ya estaba anulada o cambió de versión.
 */
export function anularFactura(
  ctx: ContextoTransaccion,
  tipo: TipoTercero,
  factura: { id: number; numero: number; version: number },
  detalle: ValorJson,
  motivo: string,
): boolean {
  const resultado = ctx.db
    .prepare(
      `UPDATE ${TABLAS[tipo].facturas}
       SET estado = 'anulada', anulada_en = ?, motivo_anulacion = ?
       WHERE id = ? AND version = ? AND estado = 'activa'`,
    )
    .run(ctx.fecha, motivo === '' ? null : motivo, factura.id, factura.version);
  if (resultado.changes !== 1) {
    return false;
  }
  ctx.registrarCambio({
    entidad: TABLAS[tipo].entidad,
    entidadId: factura.numero,
    accion: 'anular',
    antes: { estado: 'activa' },
    despues: detalle,
    motivo,
  });
  return true;
}
