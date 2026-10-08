import { dialog, shell, type BrowserWindow } from 'electron';
import type { OrigenRestauracion } from '../../shared/respaldos';
import { registrarError } from '../log';
import type { ServicioRespaldos } from '../servicios/respaldos';
import type { RegistrarManejador } from './registrar';
import { exigirObjeto, exigirOpcion, exigirTexto } from './validacion';

/**
 * Dependencias de los canales de respaldos.
 */
export interface DependenciasRespaldos {
  /** Servicio de copias y restauración. */
  servicio: ServicioRespaldos;
  /** Ventana sobre la que se abren los diálogos de Windows. */
  ventana: BrowserWindow;
  /**
   * Pide dónde guardar el PDF de la lista y lo escribe.
   *
   * @param html - Documento.
   * @param nombreSugerido - Nombre propuesto.
   * @returns `true` si se guardó.
   */
  guardarPdf: (html: string, nombreSugerido: string) => Promise<boolean>;
}

/**
 * Lee el origen de una copia enviado por la pantalla.
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
 * Pide una carpeta al usuario.
 *
 * @param ventana - Ventana principal.
 * @param titulo - Título del diálogo.
 * @returns La carpeta, o `null` si canceló.
 */
function elegirCarpeta(ventana: BrowserWindow, titulo: string): string | null {
  const rutas = dialog.showOpenDialogSync(ventana, {
    title: titulo,
    properties: ['openDirectory'],
  });
  return rutas?.[0] ?? null;
}

/**
 * Registra los canales de la ventana Respaldos.
 *
 * @param registrar - Función de registro de manejadores.
 * @param dependencias - Servicio, ventana y guardado del PDF.
 */
export function registrarIpcRespaldos(
  registrar: RegistrarManejador,
  dependencias: DependenciasRespaldos,
): void {
  const { servicio, ventana } = dependencias;

  registrar('respaldos:estado', () => servicio.estado());
  registrar('respaldos:ahora', () => {
    servicio.respaldarAhora('manual');
    return servicio.estado();
  });
  registrar('respaldos:cambiarCarpeta', () => {
    const carpeta = elegirCarpeta(ventana, 'Carpeta de respaldos');
    if (carpeta === null) {
      return { cancelado: true, estado: null };
    }
    servicio.cambiarCarpeta(carpeta);
    return { cancelado: false, estado: servicio.estado() };
  });
  registrar('respaldos:abrirCarpeta', () => {
    void shell.openPath(servicio.carpeta()).then((error) => {
      if (error !== '') {
        registrarError('respaldos:abrirCarpeta', new Error(error));
      }
    });
  });
  registrar('respaldos:cambiarExterna', () => {
    const carpeta = elegirCarpeta(ventana, 'Carpeta de la copia externa');
    if (carpeta === null) {
      return { cancelado: true, estado: null };
    }
    servicio.cambiarExterna(carpeta);
    return { cancelado: false, estado: servicio.estado() };
  });
  registrar('respaldos:quitarExterna', () => {
    servicio.quitarExterna();
    return servicio.estado();
  });
  registrar('respaldos:elegirArchivo', () => {
    const rutas = dialog.showOpenDialogSync(ventana, {
      title: 'Restaurar desde archivo',
      filters: [{ name: 'Base de datos', extensions: ['db'] }],
      properties: ['openFile'],
    });
    return rutas?.[0] ?? null;
  });
  registrar('respaldos:previsualizar', (origen) => servicio.previsualizar(leerOrigen(origen)));
  registrar('respaldos:pdf', async (origen) => {
    const html = servicio.htmlPerdida(leerOrigen(origen));
    return dependencias.guardarPdf(html, 'Documentos que se perderían.pdf');
  });
  registrar('respaldos:restaurar', (peticion) => {
    const datos = exigirObjeto(peticion);
    const credencial = exigirObjeto(datos.credencial);
    const tipo = exigirOpcion(credencial.tipo, ['contrasena', 'clave'] as const, 'tipo');
    servicio.restaurar(leerOrigen(datos.origen), {
      tipo,
      valor: exigirTexto(credencial.valor, 'valor'),
    });
  });
}
