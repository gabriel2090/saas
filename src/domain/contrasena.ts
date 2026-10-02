import { ErrorDeNegocio } from './errores';

/**
 * Largo mínimo de la contraseña de acceso (D-14).
 */
export const LARGO_MINIMO_CONTRASENA = 4;

/**
 * Largo máximo, para evitar entradas desmedidas al calcular el hash.
 */
export const LARGO_MAXIMO_CONTRASENA = 128;

/**
 * Valida una contraseña nueva antes de guardarla.
 *
 * @param contrasena - Contraseña escrita por el usuario.
 * @throws {ErrorDeNegocio} Si está vacía, es muy corta, muy larga o empieza/termina con espacios.
 */
export function validarContrasenaNueva(contrasena: string): void {
  if (contrasena.length < LARGO_MINIMO_CONTRASENA) {
    throw new ErrorDeNegocio(
      'VALIDACION',
      `La contraseña debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`,
    );
  }
  if (contrasena.length > LARGO_MAXIMO_CONTRASENA) {
    throw new ErrorDeNegocio(
      'VALIDACION',
      `La contraseña no puede tener más de ${LARGO_MAXIMO_CONTRASENA} caracteres.`,
    );
  }
  // Los espacios al borde suelen ser accidentales y luego impiden entrar.
  if (contrasena !== contrasena.trim()) {
    throw new ErrorDeNegocio(
      'VALIDACION',
      'La contraseña no puede empezar ni terminar con espacios.',
    );
  }
}
