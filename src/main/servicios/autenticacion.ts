import { randomBytes } from 'node:crypto';
import {
  generarClaveRecuperacion,
  LARGO_CLAVE,
  normalizarClaveRecuperacion,
} from '../../domain/clave-recuperacion';
import { validarContrasenaNueva } from '../../domain/contrasena';
import { ErrorDeNegocio } from '../../domain/errores';
import type { BaseDeDatos } from '../../data/conexion';
import {
  guardarConfiguracion,
  obtenerConfiguracion,
} from '../../data/repositorios/configuracion.repo';
import type { ContextoTransaccion, EjecutorTransacciones } from '../../data/transaccion';
import { calcularHashContrasena, verificarContrasena } from './hash-contrasena';

/**
 * Servicio de la contraseña única de acceso (no hay usuarios ni roles, §10)
 * y de la clave de recuperación (D-22, D-23).
 */
export interface ServicioAutenticacion {
  /**
   * Indica si ya se creó la contraseña (si no, es el primer arranque, D-01).
   *
   * @returns `true` si existe una contraseña guardada.
   */
  tieneContrasena(): boolean;
  /**
   * Indica si hay una clave de recuperación vigente.
   *
   * @returns `true` si existe.
   */
  tieneClaveRecuperacion(): boolean;
  /**
   * Crea la contraseña en el primer arranque, genera la clave de
   * recuperación e inicia la sesión.
   *
   * @param contrasena - Contraseña nueva.
   * @returns La clave de recuperación, para mostrarla una sola vez.
   * @throws {ErrorDeNegocio} Si ya existe una contraseña o la nueva no es válida.
   */
  crear(contrasena: string): string;
  /**
   * Verifica la contraseña e inicia la sesión.
   *
   * @param contrasena - Contraseña escrita.
   * @throws {ErrorDeNegocio} Si no hay contraseña creada o no coincide.
   */
  ingresar(contrasena: string): void;
  /**
   * Cambia la contraseña. Exige la actual y deja el cambio en el historial.
   *
   * @param actual - Contraseña actual.
   * @param nueva - Contraseña nueva.
   * @throws {ErrorDeNegocio} Si no hay sesión, la actual no coincide o la nueva no es válida.
   */
  cambiar(actual: string, nueva: string): void;
  /**
   * Restablece la contraseña con la clave de recuperación. La clave es de un
   * solo uso: se reemplaza por una nueva, que se devuelve. Inicia la sesión.
   *
   * @param clave - Clave de recuperación escrita por el usuario.
   * @param nueva - Contraseña nueva.
   * @returns La clave de recuperación nueva.
   * @throws {ErrorDeNegocio} Si no hay clave vigente, no coincide o la contraseña no es válida.
   */
  restablecer(clave: string, nueva: string): string;
  /**
   * Genera una clave de recuperación nueva (reemplaza la anterior). Se ofrece
   * a las instalaciones que no tienen clave.
   *
   * @returns La clave nueva.
   * @throws {ErrorDeNegocio} Si no hay sesión.
   */
  generarClaveRecuperacion(): string;
  /**
   * Indica si en esta ejecución ya se ingresó la contraseña.
   *
   * @returns `true` si hay sesión iniciada.
   */
  haySesion(): boolean;
}

/**
 * Fuente de azar del servicio (inyectable en pruebas).
 */
export type FuenteAzar = (bytes: number) => Uint8Array;

/**
 * Crea el servicio de autenticación.
 *
 * @param db - Conexión abierta.
 * @param ejecutar - Ejecutor de transacciones (registra el historial).
 * @param azar - Fuente de bytes aleatorios (por defecto `crypto.randomBytes`).
 * @returns El servicio.
 */
export function crearServicioAutenticacion(
  db: BaseDeDatos,
  ejecutar: EjecutorTransacciones,
  azar: FuenteAzar = randomBytes,
): ServicioAutenticacion {
  let sesionIniciada = false;

  const hashGuardado = (): string | null => obtenerConfiguracion(db, 'auth.hash_contrasena');
  const hashClave = (): string | null => obtenerConfiguracion(db, 'auth.hash_clave_recuperacion');

  /**
   * Genera una clave nueva y guarda su hash dentro de la transacción recibida.
   *
   * @param ctx - Contexto de la transacción.
   * @returns La clave en texto, agrupada.
   */
  const guardarClaveNueva = (ctx: ContextoTransaccion): string => {
    const clave = generarClaveRecuperacion(azar(LARGO_CLAVE));
    const compacta = normalizarClaveRecuperacion(clave);
    if (compacta === null) {
      throw new Error('La clave generada no es válida.');
    }
    guardarConfiguracion(ctx, 'auth.hash_clave_recuperacion', calcularHashContrasena(compacta));
    return clave;
  };

  return {
    tieneContrasena: () => hashGuardado() !== null,

    tieneClaveRecuperacion: () => hashClave() !== null,

    crear(contrasena) {
      if (hashGuardado() !== null) {
        throw new ErrorDeNegocio(
          'CONFLICTO',
          'La contraseña ya fue creada. Use «Cambiar contraseña».',
        );
      }
      validarContrasenaNueva(contrasena);
      const hash = calcularHashContrasena(contrasena);
      const clave = ejecutar((ctx) => {
        guardarConfiguracion(ctx, 'auth.hash_contrasena', hash);
        return guardarClaveNueva(ctx);
      });
      sesionIniciada = true;
      return clave;
    },

    ingresar(contrasena) {
      const hash = hashGuardado();
      if (hash === null) {
        throw new ErrorDeNegocio('CONFLICTO', 'Aún no se ha creado la contraseña de acceso.');
      }
      if (!verificarContrasena(contrasena, hash)) {
        throw new ErrorDeNegocio('CONTRASENA_INCORRECTA', 'La contraseña es incorrecta.');
      }
      sesionIniciada = true;
    },

    cambiar(actual, nueva) {
      if (!sesionIniciada) {
        throw new ErrorDeNegocio(
          'NO_AUTORIZADO',
          'Debe ingresar al sistema antes de cambiar la contraseña.',
        );
      }
      const hash = hashGuardado();
      if (hash === null || !verificarContrasena(actual, hash)) {
        throw new ErrorDeNegocio('CONTRASENA_INCORRECTA', 'La contraseña actual es incorrecta.');
      }
      validarContrasenaNueva(nueva);
      if (actual === nueva) {
        throw new ErrorDeNegocio(
          'VALIDACION',
          'La contraseña nueva debe ser distinta de la actual.',
        );
      }
      const nuevoHash = calcularHashContrasena(nueva);
      ejecutar((ctx) => guardarConfiguracion(ctx, 'auth.hash_contrasena', nuevoHash));
    },

    restablecer(clave, nueva) {
      const hashVigente = hashClave();
      if (hashGuardado() === null || hashVigente === null) {
        throw new ErrorDeNegocio(
          'CONFLICTO',
          'Este equipo no tiene una clave de recuperación. Comuníquese con soporte.',
        );
      }
      const compacta = normalizarClaveRecuperacion(clave);
      if (compacta === null || !verificarContrasena(compacta, hashVigente)) {
        throw new ErrorDeNegocio(
          'CONTRASENA_INCORRECTA',
          'La clave de recuperación no es correcta. Revise que la haya copiado completa.',
        );
      }
      validarContrasenaNueva(nueva);
      const nuevoHash = calcularHashContrasena(nueva);
      const claveNueva = ejecutar((ctx) => {
        guardarConfiguracion(ctx, 'auth.hash_contrasena', nuevoHash);
        ctx.registrarCambio({
          entidad: 'autenticacion',
          entidadId: 'contrasena',
          accion: 'sistema',
          antes: null,
          despues: null,
          motivo: 'Contraseña restablecida con la clave de recuperación',
        });
        return guardarClaveNueva(ctx);
      });
      sesionIniciada = true;
      return claveNueva;
    },

    generarClaveRecuperacion() {
      if (!sesionIniciada) {
        throw new ErrorDeNegocio(
          'NO_AUTORIZADO',
          'Debe ingresar al sistema antes de generar la clave de recuperación.',
        );
      }
      return ejecutar((ctx) => guardarClaveNueva(ctx));
    },

    haySesion: () => sesionIniciada,
  };
}
