import { validarContrasenaNueva } from '../../domain/contrasena';
import { ErrorDeNegocio } from '../../domain/errores';
import type { BaseDeDatos } from '../../data/conexion';
import {
  guardarConfiguracion,
  obtenerConfiguracion,
} from '../../data/repositorios/configuracion.repo';
import type { EjecutorTransacciones } from '../../data/transaccion';
import { calcularHashContrasena, verificarContrasena } from './hash-contrasena';

/**
 * Servicio de la contraseña única de acceso (no hay usuarios ni roles, §10).
 */
export interface ServicioAutenticacion {
  /**
   * Indica si ya se creó la contraseña (si no, es el primer arranque, D-01).
   *
   * @returns `true` si existe una contraseña guardada.
   */
  tieneContrasena(): boolean;
  /**
   * Crea la contraseña en el primer arranque e inicia la sesión.
   *
   * @param contrasena - Contraseña nueva.
   * @throws {ErrorDeNegocio} Si ya existe una contraseña o la nueva no es válida.
   */
  crear(contrasena: string): void;
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
   * Indica si en esta ejecución ya se ingresó la contraseña.
   *
   * @returns `true` si hay sesión iniciada.
   */
  haySesion(): boolean;
}

/**
 * Crea el servicio de autenticación.
 *
 * @param db - Conexión abierta.
 * @param ejecutar - Ejecutor de transacciones (registra el historial).
 * @returns El servicio.
 */
export function crearServicioAutenticacion(
  db: BaseDeDatos,
  ejecutar: EjecutorTransacciones,
): ServicioAutenticacion {
  let sesionIniciada = false;

  const hashGuardado = (): string | null => obtenerConfiguracion(db, 'auth.hash_contrasena');

  return {
    tieneContrasena: () => hashGuardado() !== null,

    crear(contrasena) {
      if (hashGuardado() !== null) {
        throw new ErrorDeNegocio(
          'CONFLICTO',
          'La contraseña ya fue creada. Use «Cambiar contraseña».',
        );
      }
      validarContrasenaNueva(contrasena);
      const hash = calcularHashContrasena(contrasena);
      ejecutar((ctx) => guardarConfiguracion(ctx, 'auth.hash_contrasena', hash));
      sesionIniciada = true;
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

    haySesion: () => sesionIniciada,
  };
}
