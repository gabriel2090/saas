import { BrowserWindow, session, type IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';
import { EVENTO_SOLICITUD_CIERRE } from '../shared/ipc/contrato';

/**
 * Ventana principal y control de su cierre.
 */
export interface VentanaPrincipal {
  /** Ventana de Electron. */
  ventana: BrowserWindow;
  /** Permite el cierre (tras la confirmación del renderer) y cierra la ventana. */
  cerrarConfirmado: () => void;
  /**
   * Verifica que una petición IPC venga del contenido propio de la app.
   *
   * @param evento - Evento IPC recibido.
   * @returns `true` si el remitente es válido.
   */
  esRemitenteValido: (evento: IpcMainInvokeEvent) => boolean;
}

/**
 * Crea la única ventana de Electron con la configuración de seguridad del
 * proyecto: `contextIsolation`, `sandbox`, sin `nodeIntegration`, sin
 * ventanas emergentes, sin navegación externa, sin permisos y sin zoom.
 *
 * Al pulsar la X de la ventana no se cierra de inmediato: se avisa al
 * renderer para que confirme (hay que preguntar si hay cambios sin guardar).
 *
 * @returns La ventana y sus utilidades.
 */
export function crearVentanaPrincipal(): VentanaPrincipal {
  const urlDesarrollo = process.env.ELECTRON_RENDERER_URL;
  const archivoRenderer = join(__dirname, '../renderer/index.html');
  // En producción se compara solo el protocolo: la ruta de instalación puede
  // tener espacios y tildes que Chromium codifica distinto que Node.
  const origenPermitido = urlDesarrollo ?? 'file://';

  session.defaultSession.setPermissionRequestHandler((_contenido, _permiso, responder) =>
    responder(false),
  );

  const ventana = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: 'Inventario y Facturación',
    autoHideMenuBar: true,
    backgroundColor: '#dfe5ec',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });

  let cierrePermitido = false;

  ventana.once('ready-to-show', () => {
    ventana.maximize();
    ventana.show();
  });

  ventana.on('close', (evento) => {
    if (!cierrePermitido) {
      evento.preventDefault();
      ventana.webContents.send(EVENTO_SOLICITUD_CIERRE);
    }
  });

  // Si el renderer se cae no podría confirmar: se permite cerrar normalmente.
  ventana.webContents.on('render-process-gone', () => {
    cierrePermitido = true;
  });

  ventana.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  ventana.webContents.on('will-navigate', (evento, url) => {
    if (!url.startsWith(origenPermitido)) {
      evento.preventDefault();
    }
  });
  // Ctrl + rueda del ratón cambiaría el zoom: se devuelve siempre al 100 %.
  ventana.webContents.on('zoom-changed', () => ventana.webContents.setZoomLevel(0));

  if (urlDesarrollo) {
    ventana.webContents.on('before-input-event', (_evento, entrada) => {
      if (entrada.type === 'keyDown' && entrada.key === 'F12') {
        ventana.webContents.toggleDevTools();
      }
    });
    void ventana.loadURL(urlDesarrollo);
  } else {
    void ventana.loadFile(archivoRenderer);
  }

  return {
    ventana,
    cerrarConfirmado: () => {
      cierrePermitido = true;
      ventana.close();
    },
    esRemitenteValido: (evento) => {
      const url = evento.senderFrame?.url ?? '';
      return evento.sender === ventana.webContents && url.startsWith(origenPermitido);
    },
  };
}
