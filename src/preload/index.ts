import { contextBridge, ipcRenderer } from 'electron';
import {
  CANALES_IPC,
  EVENTO_SOLICITUD_CIERRE,
  type ApiPreload,
  type CanalIpc,
  type PeticionDe,
  type RespuestaDe,
} from '../shared/ipc/contrato';
import { fallo, type Resultado } from '../shared/resultado';

/**
 * API segura expuesta al renderer en `window.api`. Solo permite los canales
 * de la lista blanca y nunca entrega `ipcRenderer` completo.
 */
const api: ApiPreload = {
  invocar<C extends CanalIpc>(
    canal: C,
    peticion: PeticionDe<C>,
  ): Promise<Resultado<RespuestaDe<C>>> {
    if (!CANALES_IPC.includes(canal)) {
      return Promise.resolve(fallo('NO_AUTORIZADO', `Canal no permitido: ${canal}`));
    }
    return ipcRenderer.invoke(canal, peticion) as Promise<Resultado<RespuestaDe<C>>>;
  },
  alSolicitarCierre(manejador) {
    const escucha = (): void => manejador();
    ipcRenderer.on(EVENTO_SOLICITUD_CIERRE, escucha);
    return () => {
      ipcRenderer.removeListener(EVENTO_SOLICITUD_CIERRE, escucha);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);
