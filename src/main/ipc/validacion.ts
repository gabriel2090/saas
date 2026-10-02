import { ErrorDeNegocio } from '../../domain/errores';

/**
 * Verifica en tiempo de ejecución que un dato recibido por IPC sea texto.
 * El contrato ya está tipado, pero el renderer es un proceso aparte y no se
 * confía ciegamente en lo que envía.
 *
 * @param valor - Dato recibido.
 * @param campo - Nombre del campo para el mensaje de error.
 * @returns El mismo valor como `string`.
 * @throws {ErrorDeNegocio} Si no es texto.
 */
export function exigirTexto(valor: unknown, campo: string): string {
  if (typeof valor !== 'string') {
    throw new ErrorDeNegocio('VALIDACION', `El campo «${campo}» es inválido.`);
  }
  return valor;
}

/**
 * Verifica que un dato recibido por IPC sea un objeto con propiedades.
 *
 * @param valor - Dato recibido.
 * @returns El valor como registro de propiedades desconocidas.
 * @throws {ErrorDeNegocio} Si no es un objeto.
 */
export function exigirObjeto(valor: unknown): Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new ErrorDeNegocio('VALIDACION', 'La petición es inválida.');
  }
  return valor as Record<string, unknown>;
}

/**
 * Verifica que un dato recibido por IPC sea un número entero (seguro).
 *
 * @param valor - Dato recibido.
 * @param campo - Nombre del campo para el mensaje de error.
 * @returns El valor como `number`.
 * @throws {ErrorDeNegocio} Si no es un entero.
 */
export function exigirEntero(valor: unknown, campo: string): number {
  if (typeof valor !== 'number' || !Number.isSafeInteger(valor)) {
    throw new ErrorDeNegocio('VALIDACION', `El campo «${campo}» debe ser un número entero.`);
  }
  return valor;
}

/**
 * Verifica que un dato recibido por IPC sea un entero o `null`.
 *
 * @param valor - Dato recibido.
 * @param campo - Nombre del campo para el mensaje de error.
 * @returns El entero o `null`.
 * @throws {ErrorDeNegocio} Si no es entero ni `null`.
 */
export function exigirEnteroONulo(valor: unknown, campo: string): number | null {
  return valor === null ? null : exigirEntero(valor, campo);
}

/**
 * Verifica que un dato recibido por IPC sea booleano.
 *
 * @param valor - Dato recibido.
 * @param campo - Nombre del campo para el mensaje de error.
 * @returns El valor como `boolean`.
 * @throws {ErrorDeNegocio} Si no es booleano.
 */
export function exigirBooleano(valor: unknown, campo: string): boolean {
  if (typeof valor !== 'boolean') {
    throw new ErrorDeNegocio('VALIDACION', `El campo «${campo}» es inválido.`);
  }
  return valor;
}

/**
 * Verifica que un dato recibido por IPC sea uno de los valores permitidos.
 *
 * @param valor - Dato recibido.
 * @param permitidos - Valores aceptados.
 * @param campo - Nombre del campo para el mensaje de error.
 * @returns El valor con su tipo literal.
 * @throws {ErrorDeNegocio} Si no está entre los permitidos.
 */
export function exigirOpcion<T extends string>(
  valor: unknown,
  permitidos: readonly T[],
  campo: string,
): T {
  const encontrado = permitidos.find((p) => p === valor);
  if (encontrado === undefined) {
    throw new ErrorDeNegocio('VALIDACION', `El campo «${campo}» es inválido.`);
  }
  return encontrado;
}

/**
 * Verifica que un dato recibido por IPC sea un arreglo.
 *
 * @param valor - Dato recibido.
 * @param campo - Nombre del campo para el mensaje de error.
 * @returns El valor como arreglo de elementos desconocidos.
 * @throws {ErrorDeNegocio} Si no es un arreglo.
 */
export function exigirArreglo(valor: unknown, campo: string): unknown[] {
  if (!Array.isArray(valor)) {
    throw new ErrorDeNegocio('VALIDACION', `El campo «${campo}» es inválido.`);
  }
  return valor as unknown[];
}
