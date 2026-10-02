import { abrirBaseDeDatos, type BaseDeDatos } from '../../src/data/conexion';
import { migracionesDelProyecto } from '../../src/data/migraciones';
import { aplicarMigraciones } from '../../src/data/migrador';

/**
 * Fecha fija usada como reloj en las pruebas.
 */
export const FECHA_PRUEBA = '2026-10-01T23:30:00.000-05:00';

/**
 * Abre una base de datos en memoria con todas las migraciones del proyecto aplicadas.
 *
 * @returns Conexión lista para usar.
 */
export function baseDeDatosDePrueba(): BaseDeDatos {
  const db = abrirBaseDeDatos(':memory:');
  aplicarMigraciones(db, migracionesDelProyecto(), () => FECHA_PRUEBA);
  return db;
}
