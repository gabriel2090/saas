import { validarDatosNegocio } from '../../domain/maestros';
import type { BaseDeDatos } from '../../data/conexion';
import {
  guardarConfiguracion,
  obtenerConfiguracion,
} from '../../data/repositorios/configuracion.repo';
import type { EjecutorTransacciones } from '../../data/transaccion';
import { DATOS_NEGOCIO_VACIOS, type DatosNegocio } from '../../shared/maestros';

/**
 * Servicio de los datos del negocio (encabezado de la factura, D-12).
 */
export interface ServicioNegocio {
  /**
   * Devuelve los datos guardados o, si aún no se configuran, los datos vacíos
   * con el régimen por defecto.
   *
   * @returns Datos del negocio.
   */
  obtener(): DatosNegocio;
  /**
   * Valida y guarda los datos (queda en el historial).
   *
   * @param datos - Datos nuevos.
   * @returns Datos guardados (limpios).
   * @throws {ErrorDeNegocio} Si falta un dato obligatorio.
   */
  guardar(datos: DatosNegocio): DatosNegocio;
}

/**
 * Crea el servicio de datos del negocio.
 *
 * @param db - Conexión abierta.
 * @param ejecutar - Ejecutor de transacciones.
 * @returns El servicio.
 */
export function crearServicioNegocio(
  db: BaseDeDatos,
  ejecutar: EjecutorTransacciones,
): ServicioNegocio {
  return {
    obtener: () => obtenerConfiguracion(db, 'negocio.datos') ?? DATOS_NEGOCIO_VACIOS,
    guardar(datos) {
      const limpios = validarDatosNegocio(datos);
      ejecutar((ctx) => guardarConfiguracion(ctx, 'negocio.datos', limpios));
      return limpios;
    },
  };
}
