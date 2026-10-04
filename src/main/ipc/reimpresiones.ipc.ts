import { TIPOS_REIMPRESION } from '../../shared/reimpresiones';
import type { ServicioReimpresiones } from '../servicios/reimpresiones';
import type { RegistrarManejador } from './registrar';
import { exigirObjeto, exigirOpcion, exigirTexto } from './validacion';

/**
 * Lee una fecha opcional del rango.
 *
 * @param valor - Dato recibido.
 * @param campo - Nombre del campo para el mensaje.
 * @returns El texto, o `null`.
 * @throws {ErrorDeNegocio} Si no es texto ni `null`.
 */
function fechaONula(valor: unknown, campo: string): string | null {
  return valor === null ? null : exigirTexto(valor, campo);
}

/**
 * Registra el canal de búsqueda de la ventana de Reimpresiones (Fase 4b).
 * Exige sesión.
 *
 * @param registrar - Función de registro de manejadores.
 * @param servicio - Servicio de reimpresiones.
 */
export function registrarIpcReimpresiones(
  registrar: RegistrarManejador,
  servicio: ServicioReimpresiones,
): void {
  registrar('reimpresiones:buscar', (peticion) => {
    const d = exigirObjeto(peticion);
    return servicio.buscar({
      tipo: exigirOpcion(d.tipo, TIPOS_REIMPRESION, 'tipo de documento'),
      texto: exigirTexto(d.texto, 'búsqueda'),
      desde: fechaONula(d.desde, 'desde'),
      hasta: fechaONula(d.hasta, 'hasta'),
    });
  });
}
