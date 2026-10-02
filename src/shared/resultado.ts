/**
 * Códigos de error que el proceso principal puede devolver al renderer.
 *
 * - `VALIDACION`: los datos enviados no cumplen una regla (mensaje para el usuario).
 * - `NO_AUTORIZADO`: se intentó una operación sin haber ingresado la contraseña.
 * - `CONTRASENA_INCORRECTA`: la contraseña no coincide.
 * - `NO_ENCONTRADO`: el registro solicitado no existe.
 * - `CONFLICTO`: la operación choca con el estado actual (p. ej. contraseña ya creada).
 * - `INESPERADO`: error técnico; el detalle queda en el log local.
 */
export type CodigoError =
  | 'VALIDACION'
  | 'NO_AUTORIZADO'
  | 'CONTRASENA_INCORRECTA'
  | 'NO_ENCONTRADO'
  | 'CONFLICTO'
  | 'INESPERADO';

/**
 * Error presentable al usuario: un código para que el código cliente decida
 * qué hacer y un mensaje en español listo para mostrarse en pantalla.
 */
export interface ErrorUsuario {
  /** Código de error para decisiones programáticas. */
  codigo: CodigoError;
  /** Mensaje en español, claro y sin detalles técnicos. */
  mensaje: string;
}

/**
 * Resultado de una operación que puede fallar. Se usa en todas las respuestas
 * IPC porque Electron no conserva las clases de error al cruzar procesos.
 */
export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: ErrorUsuario };

/**
 * Construye un resultado exitoso.
 *
 * @param datos - Valor devuelto por la operación.
 * @returns Resultado con `ok: true`.
 */
export function exito<T>(datos: T): Resultado<T> {
  return { ok: true, datos };
}

/**
 * Construye un resultado fallido.
 *
 * @param codigo - Código del error.
 * @param mensaje - Mensaje en español para el usuario.
 * @returns Resultado con `ok: false`.
 */
export function fallo<T = never>(codigo: CodigoError, mensaje: string): Resultado<T> {
  return { ok: false, error: { codigo, mensaje } };
}

/**
 * Mensaje genérico para errores técnicos no previstos.
 */
export const MENSAJE_ERROR_INESPERADO =
  'Ocurrió un error inesperado. El detalle quedó guardado en el registro del sistema.';
