import { ErrorDeNegocio } from './errores';

/**
 * Acciones que se registran en el historial de cambios.
 * Debe coincidir con el `CHECK` de la tabla `historial_cambios`.
 */
export type AccionHistorial = 'crear' | 'editar' | 'anular' | 'inactivar' | 'reactivar' | 'sistema';

/**
 * Lista de acciones válidas, para validar en tiempo de ejecución.
 */
export const ACCIONES_HISTORIAL: readonly AccionHistorial[] = [
  'crear',
  'editar',
  'anular',
  'inactivar',
  'reactivar',
  'sistema',
];

/**
 * Valor que reemplaza a los secretos (como el hash de la contraseña) en el historial.
 */
export const VALOR_OCULTO = '[OCULTO]';

/**
 * Valor serializable a JSON que se guarda como «antes» o «después».
 */
export type ValorJson =
  string | number | boolean | null | ValorJson[] | { [clave: string]: ValorJson };

/**
 * Datos de un cambio, tal como los entrega quien hace la operación.
 */
export interface CambioARegistrar {
  /** Tipo de entidad, p. ej. `factura_cliente` o `configuracion`. */
  entidad: string;
  /** Identificador de la entidad (texto para admitir claves de configuración). */
  entidadId: string | number;
  /** Acción realizada. */
  accion: AccionHistorial;
  /** Contenido antes del cambio (`null` al crear). */
  antes: ValorJson | null;
  /** Contenido después del cambio (`null` si no aplica). */
  despues: ValorJson | null;
  /** Motivo opcional (p. ej. de una anulación). */
  motivo?: string | null;
  /** Nombres de campos cuyo valor no debe guardarse (se reemplaza por {@link VALOR_OCULTO}). */
  camposSecretos?: readonly string[];
}

/**
 * Fila lista para insertar en `historial_cambios`.
 */
export interface EntradaHistorial {
  /** Fecha ISO 8601 con desfase local. */
  fecha: string;
  /** Tipo de entidad. */
  entidad: string;
  /** Identificador como texto. */
  entidadId: string;
  /** Acción realizada. */
  accion: AccionHistorial;
  /** JSON del contenido anterior o `null`. */
  antes: string | null;
  /** JSON del contenido posterior o `null`. */
  despues: string | null;
  /** Motivo o `null`. */
  motivo: string | null;
}

/**
 * Reemplaza recursivamente por {@link VALOR_OCULTO} el valor de los campos
 * secretos de un objeto JSON, sin modificar el original.
 *
 * @param valor - Valor a limpiar.
 * @param camposSecretos - Nombres de campo a ocultar (a cualquier profundidad).
 * @returns Copia con los secretos ocultos.
 *
 * @example
 * ocultarSecretos({ clave: 'x', hash: 'abc' }, ['hash']); // { clave: 'x', hash: '[OCULTO]' }
 */
export function ocultarSecretos(valor: ValorJson, camposSecretos: readonly string[]): ValorJson {
  if (camposSecretos.length === 0 || valor === null || typeof valor !== 'object') {
    return valor;
  }
  if (Array.isArray(valor)) {
    return valor.map((v) => ocultarSecretos(v, camposSecretos));
  }
  const copia: { [clave: string]: ValorJson } = {};
  for (const [clave, v] of Object.entries(valor)) {
    copia[clave] = camposSecretos.includes(clave)
      ? VALOR_OCULTO
      : ocultarSecretos(v, camposSecretos);
  }
  return copia;
}

/**
 * Valida un cambio y lo convierte en una fila del historial.
 *
 * @param cambio - Datos del cambio.
 * @param fecha - Fecha ISO de la transacción (la misma para todo lo que se guarde junto).
 * @returns Entrada lista para insertar.
 * @throws {ErrorDeNegocio} Si falta la entidad, el id o la acción no es válida.
 *
 * @example
 * crearEntradaHistorial(
 *   { entidad: 'configuracion', entidadId: 'auth.hash', accion: 'editar',
 *     antes: { valor: 'viejo' }, despues: { valor: 'nuevo' }, camposSecretos: ['valor'] },
 *   '2026-10-01T23:30:00.000-05:00',
 * ); // antes y despues quedan como {"valor":"[OCULTO]"}
 */
export function crearEntradaHistorial(cambio: CambioARegistrar, fecha: string): EntradaHistorial {
  const entidad = cambio.entidad.trim();
  const entidadId = String(cambio.entidadId).trim();
  if (entidad === '' || entidadId === '') {
    throw new ErrorDeNegocio(
      'VALIDACION',
      'El historial de cambios requiere la entidad y su identificador.',
    );
  }
  if (!ACCIONES_HISTORIAL.includes(cambio.accion)) {
    throw new ErrorDeNegocio(
      'VALIDACION',
      `Acción de historial no válida: ${String(cambio.accion)}.`,
    );
  }
  const secretos = cambio.camposSecretos ?? [];
  const serializar = (v: ValorJson | null): string | null =>
    v === null ? null : JSON.stringify(ocultarSecretos(v, secretos));
  const motivo = cambio.motivo?.trim();
  return {
    fecha,
    entidad,
    entidadId,
    accion: cambio.accion,
    antes: serializar(cambio.antes),
    despues: serializar(cambio.despues),
    motivo: motivo === undefined || motivo === '' ? null : motivo,
  };
}
