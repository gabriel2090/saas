import { esErrorDeNegocio } from '../../domain/errores';
import { exito, fallo, MENSAJE_ERROR_INESPERADO, type Resultado } from '../../shared/resultado';

/**
 * Dependencias para ejecutar un manejador IPC.
 */
export interface ContextoManejador {
  /** Nombre del canal (para el log). */
  canal: string;
  /** Si el canal exige haber ingresado la contraseña. */
  requiereSesion: boolean;
  /** Indica si hay sesión iniciada. */
  haySesion: () => boolean;
  /** Registra un error técnico en el log. */
  registrarError: (contexto: string, error: unknown) => void;
}

/**
 * Ejecuta un manejador IPC y convierte su resultado o error en un
 * {@link Resultado}:
 *
 * - Un `ErrorDeNegocio` se devuelve con su código y mensaje (para el usuario).
 * - Cualquier otro error se registra en el log y se devuelve un mensaje genérico.
 *
 * El manejador puede ser asíncrono (p. ej. imprimir o guardar un PDF): en
 * ese caso se devuelve una promesa del resultado, con el mismo trato de errores.
 *
 * Está separado de `ipcMain` para poder probarlo sin Electron.
 *
 * @param manejador - Función que atiende la petición.
 * @param peticion - Datos recibidos del renderer.
 * @param contexto - Canal, control de sesión y log.
 * @returns Resultado serializable para el renderer (o su promesa).
 */
export function ejecutarManejador<P, R>(
  manejador: (peticion: P) => R | Promise<R>,
  peticion: P,
  contexto: ContextoManejador,
): Resultado<R> | Promise<Resultado<R>> {
  if (contexto.requiereSesion && !contexto.haySesion()) {
    return fallo('NO_AUTORIZADO', 'Debe ingresar la contraseña para continuar.');
  }
  const convertirError = (error: unknown): Resultado<R> => {
    if (esErrorDeNegocio(error)) {
      return fallo(error.codigo, error.message);
    }
    contexto.registrarError(`ipc:${contexto.canal}`, error);
    return fallo('INESPERADO', MENSAJE_ERROR_INESPERADO);
  };
  try {
    const respuesta = manejador(peticion);
    if (respuesta instanceof Promise) {
      return respuesta.then((datos: R) => exito(datos), convertirError);
    }
    return exito(respuesta);
  } catch (error) {
    return convertirError(error);
  }
}
