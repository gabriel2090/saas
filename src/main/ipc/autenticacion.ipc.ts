import type { ServicioAutenticacion } from '../servicios/autenticacion';
import type { RegistrarManejador } from './registrar';
import { exigirObjeto, exigirTexto } from './validacion';

/**
 * Registra los canales IPC de la contraseña de acceso.
 *
 * `estado`, `crear` e `ingresar` no exigen sesión (son los que la inician);
 * `cambiar` sí.
 *
 * @param registrar - Función de registro de manejadores.
 * @param servicio - Servicio de autenticación.
 */
export function registrarIpcAutenticacion(
  registrar: RegistrarManejador,
  servicio: ServicioAutenticacion,
): void {
  registrar('autenticacion:estado', () => ({ tieneContrasena: servicio.tieneContrasena() }), {
    requiereSesion: false,
  });
  registrar(
    'autenticacion:crear',
    (contrasena) => servicio.crear(exigirTexto(contrasena, 'contraseña')),
    {
      requiereSesion: false,
    },
  );
  registrar(
    'autenticacion:ingresar',
    (contrasena) => servicio.ingresar(exigirTexto(contrasena, 'contraseña')),
    {
      requiereSesion: false,
    },
  );
  registrar('autenticacion:cambiar', (peticion) => {
    const datos = exigirObjeto(peticion);
    servicio.cambiar(
      exigirTexto(datos.actual, 'contraseña actual'),
      exigirTexto(datos.nueva, 'contraseña nueva'),
    );
  });
}
