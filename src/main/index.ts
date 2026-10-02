import { app, dialog, Menu } from 'electron';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { abrirBaseDeDatos, verificarIntegridad, type BaseDeDatos } from '../data/conexion';
import { migracionesDelProyecto } from '../data/migraciones';
import { aplicarMigraciones } from '../data/migrador';
import { obtenerConfiguracion } from '../data/repositorios/configuracion.repo';
import { crearEjecutorTransacciones } from '../data/transaccion';
import { registrarIpcAutenticacion } from './ipc/autenticacion.ipc';
import { registrarIpcImportador } from './ipc/importador.ipc';
import { registrarIpcMaestros } from './ipc/maestros.ipc';
import { crearRegistradorIpc } from './ipc/registrar';
import { registrarIpcSistema } from './ipc/sistema.ipc';
import { iniciarLog, registrarError, registrarInfo } from './log';
import { crearServicioAutenticacion } from './servicios/autenticacion';
import { crearServicioCatalogos } from './servicios/catalogos';
import { crearServicioImportador } from './servicios/importador';
import { crearServicioNegocio } from './servicios/negocio';
import { crearServicioProductos } from './servicios/productos';
import { crearServicioTerceros } from './servicios/terceros';
import { crearServicioRespaldos, type ServicioRespaldos } from './servicios/respaldos';
import { crearVentanaPrincipal, type VentanaPrincipal } from './ventana-principal';

/**
 * Nombre del archivo de la base de datos dentro de la carpeta de datos.
 */
const ARCHIVO_BASE_DATOS = 'inventario.db';

/**
 * Recursos abiertos que hay que liberar al salir.
 */
interface Recursos {
  /** Conexión a la base de datos. */
  db: BaseDeDatos;
  /** Servicio de respaldos (para vaciar la copia pendiente). */
  respaldos: ServicioRespaldos;
  /** Ventana principal. */
  ventana: VentanaPrincipal;
}

/**
 * Recursos de la ejecución actual (`null` hasta terminar el arranque).
 */
let recursos: Recursos | null = null;

/**
 * Crea una carpeta si no existe.
 *
 * @param ruta - Carpeta a asegurar.
 * @returns La misma ruta.
 */
function asegurarCarpeta(ruta: string): string {
  mkdirSync(ruta, { recursive: true });
  return ruta;
}

/**
 * Arranca la aplicación: log, base de datos (integridad, respaldo previo y
 * migraciones), servicios, IPC y ventana.
 *
 * @throws {Error} Si falla la apertura o la migración de la base de datos.
 */
function iniciar(): void {
  const carpetaUsuario = app.getPath('userData');
  iniciarLog(asegurarCarpeta(join(carpetaUsuario, 'logs')));
  registrarInfo(`Iniciando versión ${app.getVersion()}`);
  Menu.setApplicationMenu(null);

  const carpetaDatos = asegurarCarpeta(join(carpetaUsuario, 'datos'));
  const rutaBaseDatos = join(carpetaDatos, ARCHIVO_BASE_DATOS);
  const existiaBase = existsSync(rutaBaseDatos);
  const db = abrirBaseDeDatos(rutaBaseDatos);
  const carpetaRespaldos = obtenerConfiguracionSegura(db) ?? join(carpetaUsuario, 'respaldos');

  const integridad = verificarIntegridad(db);
  if (!integridad.ok) {
    registrarError('arranque:integridad', new Error(integridad.detalle.join('\n')));
    dialog.showErrorBox(
      'Base de datos dañada',
      'La verificación de integridad encontró daños en la base de datos y la aplicación no puede continuar.\n\n' +
        `Los respaldos automáticos están en: ${carpetaRespaldos}\n` +
        'Comuníquese con soporte para restaurar la última copia.',
    );
    db.close();
    app.exit(1);
    return;
  }

  const respaldos = crearServicioRespaldos({
    db,
    carpeta: asegurarCarpeta(carpetaRespaldos),
    alFallar: (error) => registrarError('respaldos', error),
  });

  // Copia previa a las migraciones: si una migración falla, hay desde dónde volver.
  if (existiaBase) {
    respaldos.respaldarAhora();
  }
  const aplicadas = aplicarMigraciones(db, migracionesDelProyecto());
  if (aplicadas.length > 0) {
    registrarInfo(`Migraciones aplicadas: ${aplicadas.join(', ')}`);
  }

  const ejecutar = crearEjecutorTransacciones(db, { alConfirmar: () => respaldos.programar() });
  const autenticacion = crearServicioAutenticacion(db, ejecutar);
  const ventana = crearVentanaPrincipal();
  const registrar = crearRegistradorIpc(() => autenticacion.haySesion(), ventana.esRemitenteValido);

  registrarIpcAutenticacion(registrar, autenticacion);
  registrarIpcSistema(registrar, {
    obtenerInfo: () => ({
      version: app.getVersion(),
      carpetaDatos,
      carpetaRespaldos: respaldos.carpeta(),
      ultimoRespaldo: respaldos.ultimoRespaldo(),
      desarrollo: !app.isPackaged,
    }),
    confirmarCierre: () => ventana.cerrarConfirmado(),
  });
  registrarIpcMaestros(registrar, {
    negocio: crearServicioNegocio(db, ejecutar),
    productos: crearServicioProductos(db, ejecutar),
    terceros: crearServicioTerceros(db, ejecutar),
    catalogos: crearServicioCatalogos(db, ejecutar),
  });
  registrarIpcImportador(registrar, {
    servicio: crearServicioImportador(db, ejecutar),
    guardarArchivo: (nombreSugerido, contenido) =>
      guardarArchivoElegido(ventana, nombreSugerido, contenido),
  });

  recursos = { db, respaldos, ventana };
}

/**
 * Pide al usuario dónde guardar un archivo XLSX y lo escribe. El diálogo es
 * modal sobre la ventana principal.
 *
 * @param ventana - Ventana principal.
 * @param nombreSugerido - Nombre propuesto (solo se usa el nombre, sin carpetas).
 * @param contenido - Bytes del archivo.
 * @returns `true` si se guardó; `false` si el usuario canceló.
 */
function guardarArchivoElegido(
  ventana: VentanaPrincipal,
  nombreSugerido: string,
  contenido: Uint8Array,
): boolean {
  const ruta = dialog.showSaveDialogSync(ventana.ventana, {
    title: 'Guardar reporte de errores',
    defaultPath: join(app.getPath('documents'), basename(nombreSugerido)),
    filters: [{ name: 'Libro de Excel', extensions: ['xlsx'] }],
  });
  if (ruta === undefined) {
    return false;
  }
  writeFileSync(ruta, contenido);
  return true;
}

/**
 * Lee la carpeta de respaldos configurada. Si la tabla aún no existe (base
 * nueva, sin migrar) o la base está dañada, devuelve `null`.
 *
 * @param db - Conexión abierta.
 * @returns La carpeta configurada o `null`.
 */
function obtenerConfiguracionSegura(db: BaseDeDatos): string | null {
  try {
    return obtenerConfiguracion(db, 'respaldos.carpeta');
  } catch {
    return null;
  }
}

/**
 * Libera los recursos: hace la copia pendiente y cierra la base de datos.
 */
function liberarRecursos(): void {
  if (!recursos) {
    return;
  }
  try {
    recursos.respaldos.vaciarPendiente();
  } catch (error) {
    registrarError('cierre:respaldo', error);
  }
  recursos.db.close();
  recursos = null;
}

/**
 * Parámetro de línea de comandos para usar otra carpeta de datos (D-15).
 * Solo se acepta sin empaquetar, para pruebas y desarrollo: en producción
 * los datos siempre viven en la carpeta estándar del usuario.
 */
const PARAMETRO_CARPETA_DATOS = 'carpeta-datos';

/**
 * Sufijo de la carpeta de datos cuando la app corre sin empaquetar (D-21).
 */
const SUFIJO_CARPETA_DESARROLLO = ' (desarrollo)';

// Sin empaquetar (`npm run dev`) nunca se usan los datos reales del negocio.
if (!app.isPackaged) {
  app.setPath(
    'userData',
    app.commandLine.hasSwitch(PARAMETRO_CARPETA_DATOS)
      ? app.commandLine.getSwitchValue(PARAMETRO_CARPETA_DATOS)
      : join(app.getPath('appData'), `${app.getName()}${SUFIJO_CARPETA_DESARROLLO}`),
  );
}

// Una sola instancia: dos procesos escribiendo la misma base SQLite causarían bloqueos.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const ventana = recursos?.ventana.ventana;
    if (ventana) {
      if (ventana.isMinimized()) {
        ventana.restore();
      }
      ventana.focus();
    }
  });

  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', liberarRecursos);

  app
    .whenReady()
    .then(iniciar)
    .catch((error: unknown) => {
      registrarError('arranque', error);
      dialog.showErrorBox(
        'No se pudo iniciar',
        `La aplicación no pudo iniciar.\n\n${error instanceof Error ? error.message : String(error)}`,
      );
      app.exit(1);
    });
}
