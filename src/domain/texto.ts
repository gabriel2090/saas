/**
 * Quita los espacios de los extremos y deja un solo espacio entre palabras.
 *
 * @param texto - Texto escrito por el usuario o leído de un archivo.
 * @returns Texto limpio.
 *
 * @example
 * limpiarTexto('  Caja   pizza  '); // 'Caja pizza'
 */
export function limpiarTexto(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ');
}

/**
 * Clave para comparar textos sin importar mayúsculas, tildes ni espacios
 * repetidos (p. ej. para impedir dos bodegas «Principal» y «principal»).
 *
 * @param texto - Texto a comparar.
 * @returns Texto en minúsculas, sin tildes y limpio.
 *
 * @example
 * claveComparacion(' Bodega  NORTE '); // 'bodega norte'
 * claveComparacion('Jurídica');        // 'juridica'
 */
export function claveComparacion(texto: string): string {
  return limpiarTexto(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
