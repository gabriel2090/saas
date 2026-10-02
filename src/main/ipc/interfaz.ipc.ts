import {
  exigirModoBarra,
  exigirProceso,
  leerGeometria,
  type ServicioInterfaz,
} from '../servicios/interfaz';
import type { RegistrarManejador } from './registrar';
import { exigirObjeto } from './validacion';

/**
 * Registra los canales de preferencias de interfaz (barra superior y
 * geometría de las ventanas). Todos exigen sesión.
 *
 * @param registrar - Función de registro de manejadores.
 * @param servicio - Servicio de preferencias.
 */
export function registrarIpcInterfaz(
  registrar: RegistrarManejador,
  servicio: ServicioInterfaz,
): void {
  registrar('interfaz:preferencias', () => servicio.preferencias());
  registrar('interfaz:guardarBarra', (modo) => servicio.guardarBarra(exigirModoBarra(modo)));
  registrar('interfaz:guardarVentana', (peticion) => {
    const p = exigirObjeto(peticion);
    servicio.guardarVentana({ id: exigirProceso(p.id), geometria: leerGeometria(p.geometria) });
  });
  registrar('interfaz:restablecerVentanas', (id) =>
    servicio.restablecerVentanas(id === null ? null : exigirProceso(id)),
  );
}
