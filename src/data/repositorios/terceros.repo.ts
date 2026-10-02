import type { ValorJson } from '../../domain/auditoria';
import { claveIdentificacion } from '../../domain/maestros';
import type {
  ClaseTercero,
  DatosTercero,
  Tercero,
  TipoIdentificacion,
  TipoPersona,
} from '../../shared/maestros';
import type { BaseDeDatos } from '../conexion';
import type { ContextoTransaccion } from '../transaccion';

/**
 * Fila de la consulta de terceros.
 */
interface FilaTercero {
  /** Código. */
  codigo: number;
  /** Tipo de persona. */
  tipoPersona: TipoPersona;
  /** Nombre o razón social. */
  nombre: string;
  /** Tipo de identificación. */
  tipoIdentificacion: TipoIdentificacion;
  /** Número de identificación. */
  numeroIdentificacion: string;
  /** Celular. */
  celular: string;
  /** Dirección. */
  direccion: string;
  /** Barrio. */
  barrio: string;
  /** Ciudad. */
  ciudad: string;
  /** Tope de crédito (solo clientes). */
  topeCredito: number | null;
  /** 1 si está activo. */
  activo: number;
  /** 1 si lo creó el sistema. */
  esSistema: number;
}

/**
 * Tabla de cada clase de tercero.
 */
const TABLAS: Readonly<Record<ClaseTercero, string>> = {
  cliente: 'clientes',
  proveedor: 'proveedores',
};

/**
 * Nombre de la entidad en el historial.
 */
const ENTIDADES: Readonly<Record<ClaseTercero, string>> = {
  cliente: 'cliente',
  proveedor: 'proveedor',
};

/**
 * Consulta de cada clase (los proveedores no tienen tope ni registros del sistema).
 *
 * @param clase - Cliente o proveedor.
 * @returns SQL de la consulta base.
 */
function consulta(clase: ClaseTercero): string {
  const extras =
    clase === 'cliente'
      ? 'tope_credito AS topeCredito, es_sistema AS esSistema'
      : 'NULL AS topeCredito, 0 AS esSistema';
  return `SELECT codigo, tipo_persona AS tipoPersona, nombre, tipo_identificacion AS tipoIdentificacion,
                 numero_identificacion AS numeroIdentificacion, celular, direccion, barrio, ciudad,
                 activo, ${extras}
          FROM ${TABLAS[clase]}`;
}

/**
 * Convierte una fila en un tercero.
 *
 * @param fila - Fila leída.
 * @returns El tercero.
 */
function aTercero(fila: FilaTercero): Tercero {
  return {
    codigo: fila.codigo,
    tipoPersona: fila.tipoPersona,
    nombre: fila.nombre,
    tipoIdentificacion: fila.tipoIdentificacion,
    numeroIdentificacion: fila.numeroIdentificacion,
    celular: fila.celular,
    direccion: fila.direccion,
    barrio: fila.barrio,
    ciudad: fila.ciudad,
    topeCredito: fila.topeCredito,
    activo: fila.activo === 1,
    esSistema: fila.esSistema === 1,
  };
}

/**
 * Datos del tercero que se guardan en el historial.
 *
 * @param tercero - Tercero.
 * @returns Objeto JSON.
 */
function aJson(tercero: Tercero): ValorJson {
  return {
    tipoPersona: tercero.tipoPersona,
    nombre: tercero.nombre,
    tipoIdentificacion: tercero.tipoIdentificacion,
    numeroIdentificacion: tercero.numeroIdentificacion,
    celular: tercero.celular,
    direccion: tercero.direccion,
    barrio: tercero.barrio,
    ciudad: tercero.ciudad,
    topeCredito: tercero.topeCredito,
    activo: tercero.activo,
  };
}

/**
 * Lista los terceros de una clase ordenados por código.
 *
 * @param db - Conexión abierta.
 * @param clase - Cliente o proveedor.
 * @returns Terceros.
 */
export function listarTerceros(db: BaseDeDatos, clase: ClaseTercero): Tercero[] {
  return (db.prepare(`${consulta(clase)} ORDER BY codigo`).all() as FilaTercero[]).map(aTercero);
}

/**
 * Obtiene un tercero.
 *
 * @param db - Conexión abierta.
 * @param clase - Cliente o proveedor.
 * @param codigo - Código.
 * @returns El tercero, o `null` si no existe.
 */
export function obtenerTercero(
  db: BaseDeDatos,
  clase: ClaseTercero,
  codigo: number,
): Tercero | null {
  const fila = db.prepare(`${consulta(clase)} WHERE codigo = ?`).get(codigo) as
    FilaTercero | undefined;
  return fila ? aTercero(fila) : null;
}

/**
 * Busca el código del tercero que tiene una identificación.
 *
 * @param db - Conexión abierta.
 * @param clase - Cliente o proveedor.
 * @param tipo - Tipo de identificación.
 * @param numero - Número normalizado.
 * @returns El código, o `null` si nadie la tiene.
 */
export function codigoPorIdentificacion(
  db: BaseDeDatos,
  clase: ClaseTercero,
  tipo: TipoIdentificacion,
  numero: string,
): number | null {
  const fila = db
    .prepare(
      `SELECT codigo FROM ${TABLAS[clase]} WHERE tipo_identificacion = ? AND numero_identificacion = ?`,
    )
    .get(tipo, numero) as { codigo: number } | undefined;
  return fila?.codigo ?? null;
}

/**
 * Códigos e identificaciones existentes de una clase (para el importador).
 *
 * @param db - Conexión abierta.
 * @param clase - Cliente o proveedor.
 * @returns Conjuntos de códigos y de claves `TIPO|numero`.
 */
export function indiceTerceros(
  db: BaseDeDatos,
  clase: ClaseTercero,
): { codigos: Set<number>; identificaciones: Set<string> } {
  const filas = db
    .prepare(
      `SELECT codigo, tipo_identificacion AS tipo, numero_identificacion AS numero FROM ${TABLAS[clase]}`,
    )
    .all() as { codigo: number; tipo: TipoIdentificacion; numero: string }[];
  return {
    codigos: new Set(filas.map((f) => f.codigo)),
    identificaciones: new Set(filas.map((f) => claveIdentificacion(f.tipo, f.numero))),
  };
}

/**
 * Inserta un tercero y registra la creación.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param clase - Cliente o proveedor.
 * @param codigo - Código ya validado y libre.
 * @param datos - Datos ya validados.
 * @param motivo - Motivo para el historial (p. ej. «Importación»), opcional.
 * @returns El tercero creado.
 */
export function insertarTercero(
  ctx: ContextoTransaccion,
  clase: ClaseTercero,
  codigo: number,
  datos: DatosTercero,
  motivo?: string,
): Tercero {
  const columnas = [
    'codigo',
    'tipo_persona',
    'nombre',
    'tipo_identificacion',
    'numero_identificacion',
    'celular',
    'direccion',
    'barrio',
    'ciudad',
  ];
  const valores: (string | number | null)[] = [
    codigo,
    datos.tipoPersona,
    datos.nombre,
    datos.tipoIdentificacion,
    datos.numeroIdentificacion,
    datos.celular,
    datos.direccion,
    datos.barrio,
    datos.ciudad,
  ];
  if (clase === 'cliente') {
    columnas.push('tope_credito');
    valores.push(datos.topeCredito);
  }
  ctx.db
    .prepare(
      `INSERT INTO ${TABLAS[clase]} (${columnas.join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`,
    )
    .run(...valores);
  const creado = leer(ctx.db, clase, codigo);
  ctx.registrarCambio({
    entidad: ENTIDADES[clase],
    entidadId: codigo,
    accion: 'crear',
    antes: null,
    despues: aJson(creado),
    motivo: motivo ?? null,
  });
  return creado;
}

/**
 * Actualiza un tercero y registra el cambio.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param clase - Cliente o proveedor.
 * @param anterior - Tercero antes del cambio.
 * @param datos - Datos nuevos ya validados.
 * @returns El tercero actualizado.
 */
export function actualizarTercero(
  ctx: ContextoTransaccion,
  clase: ClaseTercero,
  anterior: Tercero,
  datos: DatosTercero,
): Tercero {
  const asignaciones = [
    'tipo_persona = ?',
    'nombre = ?',
    'tipo_identificacion = ?',
    'numero_identificacion = ?',
    'celular = ?',
    'direccion = ?',
    'barrio = ?',
    'ciudad = ?',
  ];
  const valores: (string | number | null)[] = [
    datos.tipoPersona,
    datos.nombre,
    datos.tipoIdentificacion,
    datos.numeroIdentificacion,
    datos.celular,
    datos.direccion,
    datos.barrio,
    datos.ciudad,
  ];
  if (clase === 'cliente') {
    asignaciones.push('tope_credito = ?');
    valores.push(datos.topeCredito);
  }
  ctx.db
    .prepare(`UPDATE ${TABLAS[clase]} SET ${asignaciones.join(', ')} WHERE codigo = ?`)
    .run(...valores, anterior.codigo);
  const actualizado = leer(ctx.db, clase, anterior.codigo);
  ctx.registrarCambio({
    entidad: ENTIDADES[clase],
    entidadId: anterior.codigo,
    accion: 'editar',
    antes: aJson(anterior),
    despues: aJson(actualizado),
  });
  return actualizado;
}

/**
 * Inactiva o reactiva un tercero y registra el cambio.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param clase - Cliente o proveedor.
 * @param anterior - Tercero antes del cambio.
 * @param activo - Estado nuevo.
 * @returns El tercero actualizado.
 */
export function cambiarEstadoTercero(
  ctx: ContextoTransaccion,
  clase: ClaseTercero,
  anterior: Tercero,
  activo: boolean,
): Tercero {
  ctx.db
    .prepare(`UPDATE ${TABLAS[clase]} SET activo = ? WHERE codigo = ?`)
    .run(activo ? 1 : 0, anterior.codigo);
  ctx.registrarCambio({
    entidad: ENTIDADES[clase],
    entidadId: anterior.codigo,
    accion: activo ? 'reactivar' : 'inactivar',
    antes: { activo: anterior.activo },
    despues: { activo },
  });
  return leer(ctx.db, clase, anterior.codigo);
}

/**
 * Lee un tercero que se sabe que existe.
 *
 * @param db - Conexión abierta.
 * @param clase - Cliente o proveedor.
 * @param codigo - Código.
 * @returns El tercero.
 * @throws {Error} Si no existe (error técnico: se acaba de escribir).
 */
function leer(db: BaseDeDatos, clase: ClaseTercero, codigo: number): Tercero {
  const tercero = obtenerTercero(db, clase, codigo);
  if (!tercero) {
    throw new Error(`El ${clase} ${codigo} no existe.`);
  }
  return tercero;
}
