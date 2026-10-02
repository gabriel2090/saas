import type { ValorJson } from '../../domain/auditoria';
import type { UnidadMedida } from '../../shared/formato/cantidades';
import type { DatosProducto, ProductoDetalle, ProductoResumen } from '../../shared/maestros';
import type { BaseDeDatos } from '../conexion';
import type { ContextoTransaccion } from '../transaccion';
import { stockPorBodega, tieneMovimientos } from './kardex.repo';

/**
 * Fila de la consulta de productos.
 */
interface FilaProducto {
  /** Código. */
  codigo: number;
  /** Nombre. */
  nombre: string;
  /** Código del proveedor. */
  proveedorCodigo: number;
  /** Nombre del proveedor. */
  proveedorNombre: string;
  /** Unidad. */
  unidad: UnidadMedida;
  /** Costo. */
  costo: number;
  /** Precio mayor. */
  precioMayor: number;
  /** Precio menor. */
  precioMenor: number;
  /** Precio mínimo. */
  precioMinimo: number;
  /** 1 si está activo. */
  activo: number;
  /** Suma del kardex en todas las bodegas. */
  stockTotal: number;
}

/**
 * Consulta base: productos con su proveedor y su stock total (suma del kardex).
 */
const CONSULTA_PRODUCTOS = `
  SELECT p.codigo, p.nombre, p.proveedor_codigo AS proveedorCodigo, pr.nombre AS proveedorNombre,
         p.unidad, p.costo, p.precio_mayor AS precioMayor, p.precio_menor AS precioMenor,
         p.precio_minimo AS precioMinimo, p.activo,
         COALESCE((SELECT SUM(m.cantidad) FROM movimientos_inventario m
                   WHERE m.producto_codigo = p.codigo), 0) AS stockTotal
  FROM productos p
  JOIN proveedores pr ON pr.codigo = p.proveedor_codigo`;

/**
 * Convierte una fila de la consulta en un producto.
 *
 * @param fila - Fila leída.
 * @returns Producto para la lista.
 */
function aResumen(fila: FilaProducto): ProductoResumen {
  return {
    codigo: fila.codigo,
    nombre: fila.nombre,
    proveedorCodigo: fila.proveedorCodigo,
    proveedorNombre: fila.proveedorNombre,
    unidad: fila.unidad,
    costo: fila.costo,
    precios: { mayor: fila.precioMayor, menor: fila.precioMenor, minimo: fila.precioMinimo },
    activo: fila.activo === 1,
    stockTotal: fila.stockTotal,
  };
}

/**
 * Datos del producto que se guardan en el historial.
 *
 * @param producto - Producto.
 * @returns Objeto JSON con los campos editables, el costo y el estado.
 */
function aJson(producto: ProductoResumen): ValorJson {
  return {
    nombre: producto.nombre,
    proveedorCodigo: producto.proveedorCodigo,
    unidad: producto.unidad,
    costo: producto.costo,
    precios: { ...producto.precios },
    activo: producto.activo,
  };
}

/**
 * Lista todos los productos ordenados por código.
 *
 * @param db - Conexión abierta.
 * @returns Productos con su stock total.
 */
export function listarProductos(db: BaseDeDatos): ProductoResumen[] {
  return (db.prepare(`${CONSULTA_PRODUCTOS} ORDER BY p.codigo`).all() as FilaProducto[]).map(
    aResumen,
  );
}

/**
 * Obtiene un producto con su stock por bodega.
 *
 * @param db - Conexión abierta.
 * @param codigo - Código del producto.
 * @returns El producto, o `null` si no existe.
 */
export function obtenerProducto(db: BaseDeDatos, codigo: number): ProductoDetalle | null {
  const fila = db.prepare(`${CONSULTA_PRODUCTOS} WHERE p.codigo = ?`).get(codigo) as
    FilaProducto | undefined;
  if (!fila) {
    return null;
  }
  return {
    ...aResumen(fila),
    stockPorBodega: stockPorBodega(db, codigo),
    tieneMovimientos: tieneMovimientos(db, codigo),
  };
}

/**
 * Códigos de productos existentes con su unidad y costo (para el importador).
 *
 * @param db - Conexión abierta.
 * @returns Código → unidad y costo.
 */
export function mapaProductos(
  db: BaseDeDatos,
): Map<number, { unidad: UnidadMedida; costo: number }> {
  const filas = db.prepare('SELECT codigo, unidad, costo FROM productos').all() as {
    codigo: number;
    unidad: UnidadMedida;
    costo: number;
  }[];
  return new Map(filas.map((f) => [f.codigo, { unidad: f.unidad, costo: f.costo }]));
}

/**
 * Inserta un producto y registra la creación en el historial.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param codigo - Código ya validado y libre.
 * @param datos - Datos ya validados.
 * @param costo - Costo inicial.
 * @param motivo - Motivo para el historial (p. ej. «Importación»), opcional.
 * @returns El producto creado.
 */
export function insertarProducto(
  ctx: ContextoTransaccion,
  codigo: number,
  datos: DatosProducto,
  costo: number,
  motivo?: string,
): ProductoResumen {
  ctx.db
    .prepare(
      `INSERT INTO productos (codigo, nombre, proveedor_codigo, unidad, costo,
                              precio_mayor, precio_menor, precio_minimo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      codigo,
      datos.nombre,
      datos.proveedorCodigo,
      datos.unidad,
      costo,
      datos.precios.mayor,
      datos.precios.menor,
      datos.precios.minimo,
    );
  const creado = leerResumen(ctx.db, codigo);
  ctx.registrarCambio({
    entidad: 'producto',
    entidadId: codigo,
    accion: 'crear',
    antes: null,
    despues: aJson(creado),
    motivo: motivo ?? null,
  });
  return creado;
}

/**
 * Actualiza los datos editables de un producto y registra el cambio.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param anterior - Producto antes del cambio.
 * @param datos - Datos nuevos ya validados.
 * @returns El producto actualizado.
 */
export function actualizarProducto(
  ctx: ContextoTransaccion,
  anterior: ProductoResumen,
  datos: DatosProducto,
): ProductoResumen {
  ctx.db
    .prepare(
      `UPDATE productos SET nombre = ?, proveedor_codigo = ?, unidad = ?,
              precio_mayor = ?, precio_menor = ?, precio_minimo = ?
       WHERE codigo = ?`,
    )
    .run(
      datos.nombre,
      datos.proveedorCodigo,
      datos.unidad,
      datos.precios.mayor,
      datos.precios.menor,
      datos.precios.minimo,
      anterior.codigo,
    );
  const actualizado = leerResumen(ctx.db, anterior.codigo);
  ctx.registrarCambio({
    entidad: 'producto',
    entidadId: anterior.codigo,
    accion: 'editar',
    antes: aJson(anterior),
    despues: aJson(actualizado),
  });
  return actualizado;
}

/**
 * Cambia el costo de un producto y registra el cambio con su motivo
 * (corrección manual, D-35; las compras de la Fase 2 usarán la misma función).
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param anterior - Producto antes del cambio.
 * @param costo - Costo nuevo ya validado.
 * @param motivo - Motivo del cambio.
 * @returns El producto actualizado.
 */
export function actualizarCostoProducto(
  ctx: ContextoTransaccion,
  anterior: ProductoResumen,
  costo: number,
  motivo: string,
): ProductoResumen {
  ctx.db.prepare('UPDATE productos SET costo = ? WHERE codigo = ?').run(costo, anterior.codigo);
  const actualizado = leerResumen(ctx.db, anterior.codigo);
  ctx.registrarCambio({
    entidad: 'producto',
    entidadId: anterior.codigo,
    accion: 'editar',
    antes: { costo: anterior.costo },
    despues: { costo },
    motivo,
  });
  return actualizado;
}

/**
 * Inactiva o reactiva un producto y registra el cambio.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param anterior - Producto antes del cambio.
 * @param activo - Estado nuevo.
 * @returns El producto actualizado.
 */
export function cambiarEstadoProducto(
  ctx: ContextoTransaccion,
  anterior: ProductoResumen,
  activo: boolean,
): ProductoResumen {
  ctx.db
    .prepare('UPDATE productos SET activo = ? WHERE codigo = ?')
    .run(activo ? 1 : 0, anterior.codigo);
  ctx.registrarCambio({
    entidad: 'producto',
    entidadId: anterior.codigo,
    accion: activo ? 'reactivar' : 'inactivar',
    antes: { activo: anterior.activo },
    despues: { activo },
  });
  return leerResumen(ctx.db, anterior.codigo);
}

/**
 * Lee un producto que se sabe que existe.
 *
 * @param db - Conexión abierta.
 * @param codigo - Código.
 * @returns El producto.
 * @throws {Error} Si no existe (error técnico: se acaba de escribir).
 */
function leerResumen(db: BaseDeDatos, codigo: number): ProductoResumen {
  const fila = db.prepare(`${CONSULTA_PRODUCTOS} WHERE p.codigo = ?`).get(codigo) as
    FilaProducto | undefined;
  if (!fila) {
    throw new Error(`El producto ${codigo} no existe.`);
  }
  return aResumen(fila);
}
