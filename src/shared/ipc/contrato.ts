import type { Resultado } from '../resultado';

/**
 * Información general del sistema que el renderer muestra en la barra de estado.
 */
export interface InfoSistema {
  /** Versión de la aplicación. */
  version: string;
  /** Carpeta donde vive la base de datos. */
  carpetaDatos: string;
  /** Carpeta donde se guardan los respaldos. */
  carpetaRespaldos: string;
  /** Fecha ISO del último respaldo hecho, o `null` si aún no hay. */
  ultimoRespaldo: string | null;
}

/**
 * Datos para cambiar la contraseña.
 */
export interface PeticionCambiarContrasena {
  /** Contraseña actual, para confirmar que quien la cambia la conoce. */
  actual: string;
  /** Contraseña nueva. */
  nueva: string;
}

/**
 * Error capturado en el renderer que se envía al log local del proceso principal.
 */
export interface PeticionRegistrarError {
  /** Dónde ocurrió (componente, acción). */
  contexto: string;
  /** Mensaje del error. */
  mensaje: string;
  /** Pila del error, si existe. */
  pila?: string;
}

/**
 * Contrato tipado de todos los canales IPC de tipo petición/respuesta.
 *
 * Cada canal declara el tipo de su petición y de su respuesta; el preload y
 * los manejadores del proceso principal se tipan a partir de este mapa, así
 * que un canal nuevo solo se declara aquí.
 */
export interface ContratoIpc {
  'autenticacion:estado': { peticion: void; respuesta: { tieneContrasena: boolean } };
  'autenticacion:crear': { peticion: string; respuesta: void };
  'autenticacion:ingresar': { peticion: string; respuesta: void };
  'autenticacion:cambiar': { peticion: PeticionCambiarContrasena; respuesta: void };
  'sistema:info': { peticion: void; respuesta: InfoSistema };
  'sistema:registrarError': { peticion: PeticionRegistrarError; respuesta: void };
  'app:confirmarCierre': { peticion: void; respuesta: void };
}

/**
 * Nombre de un canal IPC válido.
 */
export type CanalIpc = keyof ContratoIpc;

/**
 * Tipo de la petición de un canal.
 */
export type PeticionDe<C extends CanalIpc> = ContratoIpc[C]['peticion'];

/**
 * Tipo de la respuesta de un canal (sin envolver en `Resultado`).
 */
export type RespuestaDe<C extends CanalIpc> = ContratoIpc[C]['respuesta'];

/**
 * Lista blanca de canales que el preload deja invocar. Debe coincidir con
 * {@link ContratoIpc}; la prueba de contrato lo verifica.
 */
export const CANALES_IPC: readonly CanalIpc[] = [
  'autenticacion:estado',
  'autenticacion:crear',
  'autenticacion:ingresar',
  'autenticacion:cambiar',
  'sistema:info',
  'sistema:registrarError',
  'app:confirmarCierre',
];

/**
 * Evento que el proceso principal envía al renderer cuando el usuario intenta
 * cerrar la ventana de Electron, para que el renderer confirme si hay cambios.
 */
export const EVENTO_SOLICITUD_CIERRE = 'app:solicitudCierre';

/**
 * API que el preload expone en `window.api`.
 */
export interface ApiPreload {
  /**
   * Invoca un canal IPC del proceso principal.
   *
   * @param canal - Canal a invocar (debe estar en {@link CANALES_IPC}).
   * @param peticion - Datos de la petición.
   * @returns Promesa con el resultado tipado de la operación.
   */
  invocar<C extends CanalIpc>(
    canal: C,
    peticion: PeticionDe<C>,
  ): Promise<Resultado<RespuestaDe<C>>>;
  /**
   * Registra la función que se llama cuando el usuario intenta cerrar la aplicación.
   *
   * @param manejador - Función a llamar.
   * @returns Función para quitar el registro.
   */
  alSolicitarCierre(manejador: () => void): () => void;
}
