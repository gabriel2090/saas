import log from 'electron-log/main';
import { join } from 'node:path';

/**
 * Tamaño máximo del archivo de log antes de rotarlo (5 MB).
 */
const TAMANO_MAXIMO_LOG = 5 * 1024 * 1024;

/**
 * Configura el log técnico local en `<carpeta>/sistema.log`. Aquí va el
 * detalle de los errores (pila, SQL, contexto) que nunca se muestra al usuario.
 *
 * @param carpeta - Carpeta de logs.
 */
export function iniciarLog(carpeta: string): void {
  log.transports.file.resolvePathFn = () => join(carpeta, 'sistema.log');
  log.transports.file.maxSize = TAMANO_MAXIMO_LOG;
  log.transports.console.level = process.env.NODE_ENV === 'production' ? false : 'debug';
}

/**
 * Registra un error técnico con su contexto.
 *
 * @param contexto - Dónde ocurrió (p. ej. `ipc:autenticacion:crear`).
 * @param error - Error capturado.
 */
export function registrarError(contexto: string, error: unknown): void {
  log.error(`[${contexto}]`, error);
}

/**
 * Registra un mensaje informativo.
 *
 * @param mensaje - Texto a registrar.
 */
export function registrarInfo(mensaje: string): void {
  log.info(mensaje);
}
