import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { CanalIpc, PeticionDe, RespuestaDe } from '../../shared/ipc/contrato';
import { fallo } from '../../shared/resultado';
import { registrarError } from '../log';
import { ejecutarManejador } from './envolver';

/**
 * Opciones de un manejador IPC.
 */
export interface OpcionesManejador {
  /** Si exige haber ingresado la contraseña (por defecto `true`). */
  requiereSesion?: boolean;
}

/**
 * Función que registra el manejador de un canal IPC tipado.
 */
export type RegistrarManejador = <C extends CanalIpc>(
  canal: C,
  manejador: (peticion: PeticionDe<C>) => RespuestaDe<C> | Promise<RespuestaDe<C>>,
  opciones?: OpcionesManejador,
) => void;

/**
 * Crea la función para registrar manejadores IPC con control de sesión,
 * verificación del remitente y conversión de errores a `Resultado`.
 *
 * @param haySesion - Indica si ya se ingresó la contraseña.
 * @param esRemitenteValido - Verifica que la petición venga de la ventana de la app.
 * @returns Función de registro.
 */
export function crearRegistradorIpc(
  haySesion: () => boolean,
  esRemitenteValido: (evento: IpcMainInvokeEvent) => boolean,
): RegistrarManejador {
  return (canal, manejador, opciones = {}) => {
    ipcMain.handle(canal, (evento, peticion: PeticionDe<typeof canal>) => {
      if (!esRemitenteValido(evento)) {
        registrarError(
          `ipc:${canal}`,
          new Error(`Remitente no autorizado: ${evento.senderFrame?.url ?? 'desconocido'}`),
        );
        return fallo('NO_AUTORIZADO', 'Petición no autorizada.');
      }
      return ejecutarManejador(manejador, peticion, {
        canal,
        requiereSesion: opciones.requiereSesion ?? true,
        haySesion,
        registrarError,
      });
    });
  };
}
