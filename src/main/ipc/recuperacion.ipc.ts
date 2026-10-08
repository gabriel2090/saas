import { dialog, shell, type BrowserWindow } from 'electron';
import type { OrigenRestauracion } from '../../shared/respaldos';
import { registrarError } from '../log';
import type { ServicioRecuperacion } from '../servicios/recuperacion';
import type { RegistrarManejador } from './registrar';
import { exigirObjeto, exigirOpcion, exigirTexto } from './validacion';

/**
 * Dependencias de la pantalla de recuperación.
 */
export interface DependenciasRecuperacion {
  /** Servicio que no abre la base dañada. */
  servicio: ServicioRecuperacion;
  /** Ventana sobre la que se abre el diálogo de archivo. */
  ventana: BrowserWindow;
}

/**
 * Lee el origen enviado por la pantalla.
 *
 * @param valor - Petición.
 * @returns Origen validado.
 * @throws {ErrorDeNegocio} Si la petición no tiene la forma esperada.
 */
function leerOrigen(valor: unknown): OrigenRestauracion {
  const datos = exigirObjeto(valor);
  const tipo = exigirOpcion(datos.tipo, ['copia', 'archivo'] as const, 'tipo');
  if (tipo === 'copia') {
    return { tipo, nombre: exigirTexto(datos.nombre, 'nombre') };
  }
  return { tipo, ruta: exigirTexto(datos.ruta, 'ruta') };
}

/**
 * Registra los canales de la recuperación al arrancar. Ninguno exige sesión:
 * la contraseña vive en la base que no se puede abrir (D-173).
 *
 * @param registrar - Función de registro de manejadores.
 * @param dependencias - Servicio y ventana.
 */
export function registrarIpcRecuperacion(
  registrar: RegistrarManejador,
  dependencias: DependenciasRecuperacion,
): void {
  const { servicio, ventana } = dependencias;
  const sinSesion = { requiereSesion: false };

  registrar('recuperacion:estado', () => servicio.estado(), sinSesion);
  registrar('recuperacion:datosSoporte', () => servicio.datosSoporte(), sinSesion);
  registrar(
    'recuperacion:abrirCarpeta',
    () => {
      void shell.openPath(servicio.carpeta()).then((error) => {
        if (error !== '') {
          registrarError('recuperacion:abrirCarpeta', new Error(error));
        }
      });
    },
    sinSesion,
  );
  registrar(
    'recuperacion:elegirArchivo',
    () => {
      const rutas = dialog.showOpenDialogSync(ventana, {
        title: 'Restaurar desde archivo',
        filters: [{ name: 'Base de datos', extensions: ['db'] }],
        properties: ['openFile'],
      });
      const ruta = rutas?.[0];
      if (ruta === undefined) {
        return null;
      }
      return servicio.describirArchivo(ruta);
    },
    sinSesion,
  );
  registrar(
    'recuperacion:restaurar',
    (origen) => {
      servicio.restaurar(leerOrigen(origen));
    },
    sinSesion,
  );
}
