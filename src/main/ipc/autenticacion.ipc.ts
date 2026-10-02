import type { ServicioAutenticacion } from '../servicios/autenticacion';
import type { RegistrarManejador } from './registrar';
import { exigirObjeto, exigirTexto } from './validacion';

/**
 * Registra los canales IPC de la contraseña de acceso y la clave de recuperación.
 *
 * `estado`, `crear`, `ingresar` y `restablecer` no exigen sesión (son los que
 * la inician); `cambiar` y `generarClave` sí.
 *
 * @param registrar - Función de registro de manejadores.
 * @param servicio - Servicio de autenticación.
 */
export function registrarIpcAutenticacion(
  registrar: RegistrarManejador,
  servicio: ServicioAutenticacion,
): void {
  registrar(
    'autenticacion:estado',
    () => ({
      tieneContrasena: servicio.tieneContrasena(),
      tieneClaveRecuperacion: servicio.tieneClaveRecuperacion(),
    }),
    { requiereSesion: false },
  );
  registrar(
    'autenticacion:crear',
    (contrasena) => ({
      claveRecuperacion: servicio.crear(exigirTexto(contrasena, 'contraseña')),
    }),
    { requiereSesion: false },
  );
  registrar(
    'autenticacion:ingresar',
    (contrasena) => servicio.ingresar(exigirTexto(contrasena, 'contraseña')),
    { requiereSesion: false },
  );
  registrar(
    'autenticacion:restablecer',
    (peticion) => {
      const datos = exigirObjeto(peticion);
      return {
        claveRecuperacion: servicio.restablecer(
          exigirTexto(datos.clave, 'clave de recuperación'),
          exigirTexto(datos.nueva, 'contraseña nueva'),
        ),
      };
    },
    { requiereSesion: false },
  );
  registrar('autenticacion:cambiar', (peticion) => {
    const datos = exigirObjeto(peticion);
    servicio.cambiar(
      exigirTexto(datos.actual, 'contraseña actual'),
      exigirTexto(datos.nueva, 'contraseña nueva'),
    );
  });
  registrar('autenticacion:generarClave', () => ({
    claveRecuperacion: servicio.generarClaveRecuperacion(),
  }));
}
