import type { AccionHistorial, EntradaHistorial } from '../../domain/auditoria';
import type { BaseDeDatos } from '../conexion';

/**
 * Registro del historial tal como se lee de la base de datos.
 */
export interface FilaHistorial extends EntradaHistorial {
  /** Identificador autoincremental. */
  id: number;
}

/**
 * Filtros para consultar el historial (los usará el visor de la Fase 5).
 */
export interface FiltrosHistorial {
  /** Tipo de entidad exacto. */
  entidad?: string;
  /** Identificador de la entidad. */
  entidadId?: string;
  /** Acción realizada. */
  accion?: AccionHistorial;
  /** Fecha ISO mínima (inclusive). */
  desde?: string;
  /** Fecha ISO máxima (inclusive). */
  hasta?: string;
  /** Máximo de filas (por defecto 500). */
  limite?: number;
}

/**
 * Columnas de `historial_cambios` con alias en camelCase.
 */
const COLUMNAS = 'id, fecha, entidad, entidad_id AS entidadId, accion, antes, despues, motivo';

/**
 * Inserta una entrada en el historial. Debe llamarse dentro de la misma
 * transacción que el cambio que registra (lo hace el ejecutor de transacciones).
 *
 * @param db - Conexión abierta.
 * @param entrada - Entrada ya validada por `crearEntradaHistorial`.
 * @returns Id de la fila insertada.
 */
export function insertarHistorial(db: BaseDeDatos, entrada: EntradaHistorial): number {
  const resultado = db
    .prepare(
      `INSERT INTO historial_cambios (fecha, entidad, entidad_id, accion, antes, despues, motivo)
       VALUES (@fecha, @entidad, @entidadId, @accion, @antes, @despues, @motivo)`,
    )
    .run(entrada);
  return Number(resultado.lastInsertRowid);
}

/**
 * Consulta el historial con filtros, del más reciente al más antiguo.
 *
 * @param db - Conexión abierta.
 * @param filtros - Filtros opcionales.
 * @returns Filas del historial.
 */
export function listarHistorial(db: BaseDeDatos, filtros: FiltrosHistorial = {}): FilaHistorial[] {
  const condiciones: string[] = [];
  const parametros: Record<string, string | number> = {};
  if (filtros.entidad !== undefined) {
    condiciones.push('entidad = @entidad');
    parametros.entidad = filtros.entidad;
  }
  if (filtros.entidadId !== undefined) {
    condiciones.push('entidad_id = @entidadId');
    parametros.entidadId = filtros.entidadId;
  }
  if (filtros.accion !== undefined) {
    condiciones.push('accion = @accion');
    parametros.accion = filtros.accion;
  }
  if (filtros.desde !== undefined) {
    condiciones.push('fecha >= @desde');
    parametros.desde = filtros.desde;
  }
  if (filtros.hasta !== undefined) {
    condiciones.push('fecha <= @hasta');
    parametros.hasta = filtros.hasta;
  }
  parametros.limite = filtros.limite ?? 500;
  const donde = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';
  return db
    .prepare(`SELECT ${COLUMNAS} FROM historial_cambios ${donde} ORDER BY id DESC LIMIT @limite`)
    .all(parametros) as FilaHistorial[];
}
