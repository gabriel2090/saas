import { claveComparacion } from '../../domain/texto';
import type { DatosCatalogo, RegistroCatalogo, TipoCatalogo } from '../../shared/maestros';
import type { BaseDeDatos } from '../conexion';
import type { ContextoTransaccion } from '../transaccion';

/**
 * Fila de la consulta de catálogos.
 */
interface FilaCatalogo {
  /** Id. */
  id: number;
  /** Nombre. */
  nombre: string;
  /** 1 si está activo. */
  activo: number;
  /** 1 si es la bodega Principal. */
  esPrincipal: number;
  /** 1 si calcula el cambio. */
  calculaCambio: number;
}

/**
 * Tabla de cada catálogo.
 */
const TABLAS: Readonly<Record<TipoCatalogo, string>> = {
  bodega: 'bodegas',
  'forma-pago': 'formas_pago',
};

/**
 * Nombre de la entidad en el historial.
 */
const ENTIDADES: Readonly<Record<TipoCatalogo, string>> = {
  bodega: 'bodega',
  'forma-pago': 'forma_pago',
};

/**
 * Consulta base de cada catálogo, con su condición `WHERE` (se le puede
 * añadir `AND …`). Las formas de pago de sistema («Saldo a favor», D-130) no
 * forman parte del catálogo editable ni se ofrecen al facturar.
 *
 * @param tipo - Catálogo.
 * @returns SQL.
 */
function consulta(tipo: TipoCatalogo): string {
  const extras =
    tipo === 'bodega'
      ? 'es_principal AS esPrincipal, 0 AS calculaCambio'
      : '0 AS esPrincipal, calcula_cambio AS calculaCambio';
  const filtro = tipo === 'forma-pago' ? 'es_sistema = 0' : '1 = 1';
  return `SELECT id, nombre, activo, ${extras} FROM ${TABLAS[tipo]} WHERE ${filtro}`;
}

/**
 * Convierte una fila en un registro.
 *
 * @param fila - Fila leída.
 * @returns El registro.
 */
function aRegistro(fila: FilaCatalogo): RegistroCatalogo {
  return {
    id: fila.id,
    nombre: fila.nombre,
    activo: fila.activo === 1,
    esPrincipal: fila.esPrincipal === 1,
    calculaCambio: fila.calculaCambio === 1,
  };
}

/**
 * Lista un catálogo ordenado por id (la Principal y Efectivo primero).
 *
 * @param db - Conexión abierta.
 * @param tipo - Catálogo.
 * @returns Registros.
 */
export function listarCatalogo(db: BaseDeDatos, tipo: TipoCatalogo): RegistroCatalogo[] {
  return (db.prepare(`${consulta(tipo)} ORDER BY id`).all() as FilaCatalogo[]).map(aRegistro);
}

/**
 * Obtiene un registro de catálogo.
 *
 * @param db - Conexión abierta.
 * @param tipo - Catálogo.
 * @param id - Id.
 * @returns El registro, o `null` si no existe.
 */
export function obtenerCatalogo(
  db: BaseDeDatos,
  tipo: TipoCatalogo,
  id: number,
): RegistroCatalogo | null {
  const fila = db.prepare(`${consulta(tipo)} AND id = ?`).get(id) as FilaCatalogo | undefined;
  return fila ? aRegistro(fila) : null;
}

/**
 * Id de la forma de pago de sistema «Saldo a favor» (D-130), que no está en
 * el catálogo editable.
 *
 * @param db - Conexión abierta.
 * @returns El id.
 * @throws {Error} Si la migración 0007 no la creó.
 */
export function idFormaSaldoFavor(db: BaseDeDatos): number {
  const fila = db.prepare('SELECT id FROM formas_pago WHERE es_sistema = 1').get() as
    { id: number } | undefined;
  if (!fila) {
    throw new Error('No existe la forma de pago de sistema «Saldo a favor».');
  }
  return fila.id;
}

/**
 * Nombre de una forma de pago, también la de sistema (para mostrar
 * documentos ya guardados).
 *
 * @param db - Conexión abierta.
 * @param id - Id de la forma de pago.
 * @returns El nombre.
 * @throws {Error} Si no existe.
 */
export function nombreFormaPago(db: BaseDeDatos, id: number): string {
  const fila = db.prepare('SELECT nombre FROM formas_pago WHERE id = ?').get(id) as
    { nombre: string } | undefined;
  if (!fila) {
    throw new Error(`No existe la forma de pago ${id}.`);
  }
  return fila.nombre;
}

/**
 * Busca el id del registro con un nombre equivalente (sin importar
 * mayúsculas, tildes ni espacios).
 *
 * @param db - Conexión abierta.
 * @param tipo - Catálogo.
 * @param nombre - Nombre a buscar.
 * @returns El id, o `null` si no existe.
 */
export function idPorNombre(db: BaseDeDatos, tipo: TipoCatalogo, nombre: string): number | null {
  const fila = db
    .prepare(`SELECT id FROM ${TABLAS[tipo]} WHERE nombre_clave = ?`)
    .get(claveComparacion(nombre)) as { id: number } | undefined;
  return fila?.id ?? null;
}

/**
 * Inserta un registro y registra la creación.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param tipo - Catálogo.
 * @param datos - Datos ya validados.
 * @returns El registro creado.
 */
export function insertarCatalogo(
  ctx: ContextoTransaccion,
  tipo: TipoCatalogo,
  datos: DatosCatalogo,
): RegistroCatalogo {
  const resultado =
    tipo === 'bodega'
      ? ctx.db
          .prepare('INSERT INTO bodegas (nombre, nombre_clave) VALUES (?, ?)')
          .run(datos.nombre, claveComparacion(datos.nombre))
      : ctx.db
          .prepare(
            'INSERT INTO formas_pago (nombre, nombre_clave, calcula_cambio) VALUES (?, ?, ?)',
          )
          .run(datos.nombre, claveComparacion(datos.nombre), datos.calculaCambio ? 1 : 0);
  const creado = leer(ctx.db, tipo, Number(resultado.lastInsertRowid));
  ctx.registrarCambio({
    entidad: ENTIDADES[tipo],
    entidadId: creado.id,
    accion: 'crear',
    antes: null,
    despues: { ...creado },
  });
  return creado;
}

/**
 * Actualiza un registro y registra el cambio.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param tipo - Catálogo.
 * @param anterior - Registro antes del cambio.
 * @param datos - Datos nuevos ya validados.
 * @returns El registro actualizado.
 */
export function actualizarCatalogo(
  ctx: ContextoTransaccion,
  tipo: TipoCatalogo,
  anterior: RegistroCatalogo,
  datos: DatosCatalogo,
): RegistroCatalogo {
  if (tipo === 'bodega') {
    ctx.db
      .prepare('UPDATE bodegas SET nombre = ?, nombre_clave = ? WHERE id = ?')
      .run(datos.nombre, claveComparacion(datos.nombre), anterior.id);
  } else {
    ctx.db
      .prepare(
        'UPDATE formas_pago SET nombre = ?, nombre_clave = ?, calcula_cambio = ? WHERE id = ?',
      )
      .run(datos.nombre, claveComparacion(datos.nombre), datos.calculaCambio ? 1 : 0, anterior.id);
  }
  const actualizado = leer(ctx.db, tipo, anterior.id);
  ctx.registrarCambio({
    entidad: ENTIDADES[tipo],
    entidadId: anterior.id,
    accion: 'editar',
    antes: { ...anterior },
    despues: { ...actualizado },
  });
  return actualizado;
}

/**
 * Inactiva o reactiva un registro y registra el cambio.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param tipo - Catálogo.
 * @param anterior - Registro antes del cambio.
 * @param activo - Estado nuevo.
 * @returns El registro actualizado.
 */
export function cambiarEstadoCatalogo(
  ctx: ContextoTransaccion,
  tipo: TipoCatalogo,
  anterior: RegistroCatalogo,
  activo: boolean,
): RegistroCatalogo {
  ctx.db
    .prepare(`UPDATE ${TABLAS[tipo]} SET activo = ? WHERE id = ?`)
    .run(activo ? 1 : 0, anterior.id);
  ctx.registrarCambio({
    entidad: ENTIDADES[tipo],
    entidadId: anterior.id,
    accion: activo ? 'reactivar' : 'inactivar',
    antes: { activo: anterior.activo },
    despues: { activo },
  });
  return leer(ctx.db, tipo, anterior.id);
}

/**
 * Lee un registro que se sabe que existe.
 *
 * @param db - Conexión abierta.
 * @param tipo - Catálogo.
 * @param id - Id.
 * @returns El registro.
 * @throws {Error} Si no existe (error técnico).
 */
function leer(db: BaseDeDatos, tipo: TipoCatalogo, id: number): RegistroCatalogo {
  const registro = obtenerCatalogo(db, tipo, id);
  if (!registro) {
    throw new Error(`El registro ${id} de ${TABLAS[tipo]} no existe.`);
  }
  return registro;
}
