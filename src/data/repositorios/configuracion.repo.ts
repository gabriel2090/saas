import type { DatosNegocio } from '../../shared/maestros';
import type { BaseDeDatos } from '../conexion';
import type { ContextoTransaccion } from '../transaccion';

/**
 * Claves de configuración conocidas y el tipo de su valor. Agregar una clave
 * nueva aquí la hace disponible con tipos en todo el proyecto.
 */
export interface EsquemaConfiguracion {
  /** Hash scrypt de la contraseña única de acceso. */
  'auth.hash_contrasena': string;
  /** Hash scrypt de la clave de recuperación vigente (D-22, D-23). */
  'auth.hash_clave_recuperacion': string;
  /** Carpeta donde se guardan los respaldos automáticos. */
  'respaldos.carpeta': string;
  /** Carpeta opcional de la copia diaria externa (USB o sincronizada), o `null` si no hay (D-175). */
  'respaldos.externa': string | null;
  /** Fecha ISO de la última copia externa que se pudo escribir. */
  'respaldos.externa_ultima': string;
  /** Datos del negocio para el encabezado de la factura (D-12). */
  'negocio.datos': DatosNegocio;
  /** Impresora térmica de Windows para las facturas, o `null` para el diálogo de impresión (D-88). */
  'facturacion.impresora': string | null;
  /** Fecha ISO en que se cargaron los datos de ejemplo (solo bases de desarrollo, D-142). */
  'demo.cargada': string;
}

/**
 * Clave de configuración válida.
 */
export type ClaveConfiguracion = keyof EsquemaConfiguracion;

/**
 * Claves cuyo valor nunca se guarda en el historial de cambios.
 */
const CLAVES_SECRETAS: readonly ClaveConfiguracion[] = [
  'auth.hash_contrasena',
  'auth.hash_clave_recuperacion',
];

/**
 * Lee un valor de configuración.
 *
 * @param db - Conexión abierta.
 * @param clave - Clave a leer.
 * @returns El valor guardado, o `null` si la clave no existe.
 */
export function obtenerConfiguracion<K extends ClaveConfiguracion>(
  db: BaseDeDatos,
  clave: K,
): EsquemaConfiguracion[K] | null {
  const fila = db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(clave) as
    { valor: string } | undefined;
  return fila ? (JSON.parse(fila.valor) as EsquemaConfiguracion[K]) : null;
}

/**
 * Crea o actualiza un valor de configuración y registra el cambio en el
 * historial (ocultando los valores secretos).
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param clave - Clave a guardar.
 * @param valor - Valor nuevo.
 */
export function guardarConfiguracion<K extends ClaveConfiguracion>(
  ctx: ContextoTransaccion,
  clave: K,
  valor: EsquemaConfiguracion[K],
): void {
  const anterior = obtenerConfiguracion(ctx.db, clave);
  ctx.db
    .prepare(
      `INSERT INTO configuracion (clave, valor, actualizado_en) VALUES (?, ?, ?)
       ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`,
    )
    .run(clave, JSON.stringify(valor), ctx.fecha);
  ctx.registrarCambio({
    entidad: 'configuracion',
    entidadId: clave,
    accion: anterior === null ? 'crear' : 'editar',
    antes: anterior === null ? null : { valor: anterior },
    despues: { valor },
    camposSecretos: CLAVES_SECRETAS.includes(clave) ? ['valor'] : [],
  });
}
