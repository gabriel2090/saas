import { crearEntradaHistorial, type CambioARegistrar } from '../domain/auditoria';
import { aIsoLocal } from '../shared/formato/fechas';
import type { BaseDeDatos } from './conexion';
import { insertarHistorial } from './repositorios/historial.repo';

/**
 * Contexto que recibe el trabajo ejecutado dentro de una transacción.
 * Los repositorios que escriben exigen este contexto, así es imposible
 * escribir fuera de una transacción o sin poder registrar el historial.
 */
export interface ContextoTransaccion {
  /** Conexión, ya dentro de la transacción. */
  readonly db: BaseDeDatos;
  /** Fecha ISO de la transacción: todo lo guardado junto lleva la misma. */
  readonly fecha: string;
  /**
   * Registra un cambio en el historial dentro de la misma transacción.
   *
   * @param cambio - Datos del cambio.
   */
  registrarCambio(cambio: CambioARegistrar): void;
}

/**
 * Opciones del ejecutor de transacciones.
 */
export interface OpcionesEjecutor {
  /** Fuente de la fecha (inyectable en pruebas). */
  reloj?: () => string;
  /** Se llama después de cada confirmación exitosa (p. ej. para programar el respaldo). */
  alConfirmar?: () => void;
}

/**
 * Ejecuta un trabajo síncrono dentro de una transacción y devuelve su resultado.
 */
export type EjecutorTransacciones = <T>(trabajo: (ctx: ContextoTransaccion) => T) => T;

/**
 * Crea el ejecutor de transacciones del proyecto.
 *
 * Cada llamada abre una transacción `IMMEDIATE` (toma el bloqueo de
 * escritura al inicio, evitando fallos a mitad de camino), ejecuta el
 * trabajo, inserta las entradas del historial y confirma. Si algo falla,
 * se revierte todo: ni el cambio ni su historial quedan guardados.
 *
 * @param db - Conexión abierta.
 * @param opciones - Reloj y acción posterior a la confirmación.
 * @returns Función para ejecutar trabajos en transacción.
 * @throws {Error} (al ejecutar) Si se anida una transacción o el trabajo devuelve una promesa.
 *
 * @example
 * const ejecutar = crearEjecutorTransacciones(db, { alConfirmar: programarRespaldo });
 * ejecutar((ctx) => {
 *   guardarConfiguracion(ctx, 'respaldos.carpeta', 'D:\\respaldos');
 * });
 */
export function crearEjecutorTransacciones(
  db: BaseDeDatos,
  opciones: OpcionesEjecutor = {},
): EjecutorTransacciones {
  const reloj = opciones.reloj ?? aIsoLocal;
  let enCurso = false;

  return <T>(trabajo: (ctx: ContextoTransaccion) => T): T => {
    // Anidar haría que `alConfirmar` se dispare antes de la confirmación real;
    // quien ya tiene un contexto debe reutilizarlo.
    if (enCurso) {
      throw new Error('No se permiten transacciones anidadas: reutilice el contexto recibido.');
    }
    const fecha = reloj();
    const contexto: ContextoTransaccion = {
      db,
      fecha,
      registrarCambio: (cambio) => {
        insertarHistorial(db, crearEntradaHistorial(cambio, fecha));
      },
    };
    const transaccion = db.transaction(() => {
      const resultado = trabajo(contexto);
      // better-sqlite3 confirma al volver la función: un trabajo asíncrono
      // quedaría fuera de la transacción.
      if (resultado instanceof Promise) {
        throw new Error('El trabajo de una transacción debe ser síncrono.');
      }
      return resultado;
    });

    enCurso = true;
    let resultado: T;
    try {
      resultado = transaccion.immediate();
    } finally {
      enCurso = false;
    }
    opciones.alConfirmar?.();
    return resultado;
  };
}
