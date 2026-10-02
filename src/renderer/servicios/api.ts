import type { CanalIpc, PeticionDe, RespuestaDe } from '../../shared/ipc/contrato';
import { fallo, MENSAJE_ERROR_INESPERADO, type Resultado } from '../../shared/resultado';

/**
 * Invoca un canal IPC del proceso principal. Si el puente falla (por
 * ejemplo, el proceso principal no responde), devuelve un error genérico en
 * lugar de lanzar una excepción.
 *
 * @param canal - Canal a invocar.
 * @param peticion - Datos de la petición.
 * @returns Resultado de la operación.
 */
export async function invocar<C extends CanalIpc>(
  canal: C,
  peticion: PeticionDe<C>,
): Promise<Resultado<RespuestaDe<C>>> {
  try {
    return await window.api.invocar(canal, peticion);
  } catch (error) {
    console.error(error);
    return fallo('INESPERADO', MENSAJE_ERROR_INESPERADO);
  }
}

/**
 * Envía un error del renderer al log local del proceso principal.
 *
 * @param contexto - Dónde ocurrió.
 * @param error - Error capturado.
 */
export function registrarErrorRenderer(contexto: string, error: unknown): void {
  const mensaje = error instanceof Error ? error.message : String(error);
  const pila = error instanceof Error ? error.stack : undefined;
  void invocar('sistema:registrarError', { contexto, mensaje, ...(pila ? { pila } : {}) });
}
