import type { CodigoError } from '../shared/resultado';

/**
 * Error de una regla de negocio. Su mensaje está en español y se puede
 * mostrar tal cual al usuario; cualquier otro error se trata como técnico y
 * se reemplaza por un mensaje genérico (su detalle va al log).
 *
 * @example
 * throw new ErrorDeNegocio('VALIDACION', 'El precio no puede quedar por debajo del costo.');
 */
export class ErrorDeNegocio extends Error {
  /** Código para que el código cliente decida qué hacer. */
  readonly codigo: CodigoError;

  /**
   * Crea el error.
   *
   * @param codigo - Código del error.
   * @param mensaje - Mensaje en español para el usuario.
   */
  constructor(codigo: CodigoError, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDeNegocio';
    this.codigo = codigo;
  }
}

/**
 * Indica si un valor es un {@link ErrorDeNegocio}.
 *
 * @param error - Valor capturado en un `catch`.
 * @returns `true` si es un error de negocio.
 */
export function esErrorDeNegocio(error: unknown): error is ErrorDeNegocio {
  return error instanceof ErrorDeNegocio;
}
