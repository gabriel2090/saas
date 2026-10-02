import type { Migracion } from '../migrador';

/**
 * Contenido de los archivos `NNNN_nombre.sql` de esta carpeta, incrustado en
 * el bundle por Vite al compilar (así no hay que copiar archivos sueltos al
 * instalador).
 */
const ARCHIVOS_SQL = import.meta.glob<string>('./*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/**
 * Patrón del nombre de archivo de una migración: `0001_base.sql`.
 */
const PATRON_NOMBRE = /^\.\/(\d{4})_([a-z0-9_]+)\.sql$/;

/**
 * Devuelve las migraciones del proyecto ordenadas por versión.
 *
 * @returns Lista de migraciones.
 * @throws {Error} Si algún archivo no sigue el patrón `NNNN_nombre.sql`.
 */
export function migracionesDelProyecto(): Migracion[] {
  return Object.entries(ARCHIVOS_SQL)
    .map(([ruta, sql]) => {
      const coincidencia = PATRON_NOMBRE.exec(ruta);
      if (!coincidencia) {
        throw new Error(`Nombre de migración inválido: «${ruta}». Use el formato 0001_nombre.sql.`);
      }
      const [, version = '', nombre = ''] = coincidencia;
      return { version: Number(version), nombre, sql };
    })
    .sort((a, b) => a.version - b.version);
}
