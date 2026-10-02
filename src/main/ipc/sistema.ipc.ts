import { clipboard } from 'electron';
import type { InfoSistema } from '../../shared/ipc/contrato';
import { registrarError } from '../log';
import type { RegistrarManejador } from './registrar';
import { exigirObjeto, exigirTexto } from './validacion';

/**
 * Dependencias de los canales de sistema.
 */
export interface DependenciasSistema {
  /** Devuelve la información para la barra de estado. */
  obtenerInfo: () => InfoSistema;
  /** Cierra la aplicación tras la confirmación del renderer. */
  confirmarCierre: () => void;
}

/**
 * Registra los canales IPC generales del sistema.
 *
 * @param registrar - Función de registro de manejadores.
 * @param dependencias - Información del sistema y cierre de la app.
 */
export function registrarIpcSistema(
  registrar: RegistrarManejador,
  dependencias: DependenciasSistema,
): void {
  registrar('sistema:info', () => dependencias.obtenerInfo());

  // Los errores del renderer se aceptan aun sin sesión: pueden ocurrir en la pantalla de acceso.
  registrar(
    'sistema:registrarError',
    (peticion) => {
      const datos = exigirObjeto(peticion);
      const error = new Error(exigirTexto(datos.mensaje, 'mensaje'));
      if (typeof datos.pila === 'string') {
        error.stack = datos.pila;
      }
      registrarError(`renderer:${exigirTexto(datos.contexto, 'contexto')}`, error);
    },
    { requiereSesion: false },
  );

  // Sin sesión: la clave de recuperación se copia en la pantalla de acceso.
  registrar(
    'sistema:copiarTexto',
    (texto) => {
      clipboard
        .writeText(exigirTexto(texto, 'texto'))
        .catch((error: unknown) => registrarError('sistema:copiarTexto', error));
    },
    { requiereSesion: false },
  );

  registrar('app:confirmarCierre', () => dependencias.confirmarCierre(), { requiereSesion: false });
}
