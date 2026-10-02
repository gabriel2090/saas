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
