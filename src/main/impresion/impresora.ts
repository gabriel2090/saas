import { BrowserWindow, type WebContents } from 'electron';
import { ErrorDeNegocio } from '../../domain/errores';
import type { ImpresoraSistema } from '../../shared/ventas';
import { ANCHO_TIRILLA_MM } from './tirilla';

/**
 * Micras por milímetro (Electron recibe el tamaño de página en micras).
 */
const MICRAS_POR_MM = 1000;

/**
 * Micras por píxel CSS (96 píxeles por pulgada).
 */
const MICRAS_POR_PIXEL = 25_400 / 96;

/**
 * Papel extra al final de la tirilla, en micras, para que el corte no quede
 * pegado a la última línea.
 */
const MARGEN_CORTE_MICRAS = 8 * MICRAS_POR_MM;

/**
 * Mensaje cuando la impresión falla por una causa del equipo.
 */
const MENSAJE_FALLO_IMPRESORA =
  'No se pudo imprimir. Revise que la impresora esté encendida y conectada.';

/**
 * Carga un documento HTML en una ventana oculta y aislada: sin preload, sin
 * ventanas emergentes ni navegación. Solo sirve para imprimir o generar el
 * PDF. El documento no trae scripts (su política de seguridad los bloquea);
 * `medir` habilita la evaluación desde el proceso principal para leer el
 * alto del contenido.
 *
 * @param html - Documento completo.
 * @param medir - Si se va a medir el alto con `executeJavaScript`.
 * @returns La ventana con el documento cargado.
 */
async function cargarDocumento(html: string, medir = false): Promise<BrowserWindow> {
  const ventana = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: medir,
      webSecurity: true,
      spellcheck: false,
    },
  });
  ventana.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  ventana.webContents.on('will-navigate', (evento) => evento.preventDefault());
  await ventana.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return ventana;
}

/**
 * Abre el diálogo de impresión de Windows con el documento en hoja carta
 * (D-52, D-72).
 *
 * @param html - Documento completo.
 * @returns `true` si se envió a la impresora; `false` si el usuario canceló.
 * @throws {ErrorDeNegocio} Si la impresión falla.
 */
export async function imprimirDocumento(html: string): Promise<boolean> {
  const ventana = await cargarDocumento(html);
  try {
    return await new Promise<boolean>((resolver, rechazar) => {
      ventana.webContents.print(
        { silent: false, printBackground: true, pageSize: 'Letter' },
        (exito, motivo) => {
          if (exito) {
            resolver(true);
          } else if (motivo === 'cancelled') {
            resolver(false);
          } else {
            rechazar(new ErrorDeNegocio('VALIDACION', MENSAJE_FALLO_IMPRESORA));
          }
        },
      );
    });
  } finally {
    ventana.destroy();
  }
}

/**
 * Lista las impresoras instaladas en Windows.
 *
 * @param contenido - Cualquier `webContents` (las impresoras son del sistema).
 * @returns Impresoras con su nombre interno y visible.
 */
export async function listarImpresoras(contenido: WebContents): Promise<ImpresoraSistema[]> {
  const impresoras = await contenido.getPrintersAsync();
  return impresoras.map((i) => ({
    nombre: i.name,
    nombreVisible: i.displayName || i.name,
  }));
}

/**
 * Imprime una tirilla de 80 mm (D-88). Con impresora configurada imprime en
 * silencio en ella; sin impresora abre el diálogo de Windows. La página mide
 * lo mismo que el contenido para que la impresora corte al final.
 *
 * @param html - Documento de la tirilla.
 * @param impresora - Nombre de la impresora térmica o `null` para el diálogo.
 * @returns `true` si se envió a la impresora; `false` si el usuario canceló el diálogo.
 * @throws {ErrorDeNegocio} Si la impresora no está instalada o la impresión falla.
 */
export async function imprimirTirilla(html: string, impresora: string | null): Promise<boolean> {
  const ventana = await cargarDocumento(html, true);
  try {
    if (impresora !== null) {
      const instaladas = await ventana.webContents.getPrintersAsync();
      if (!instaladas.some((i) => i.name === impresora)) {
        throw new ErrorDeNegocio(
          'VALIDACION',
          `La impresora «${impresora}» no está instalada en este equipo. Elíjala de nuevo en Datos del negocio.`,
        );
      }
    }
    const altoPixeles: unknown = await ventana.webContents.executeJavaScript(
      'document.documentElement.scrollHeight',
    );
    const alto =
      Math.ceil((typeof altoPixeles === 'number' ? altoPixeles : 0) * MICRAS_POR_PIXEL) +
      MARGEN_CORTE_MICRAS;
    return await new Promise<boolean>((resolver, rechazar) => {
      ventana.webContents.print(
        {
          silent: impresora !== null,
          ...(impresora !== null ? { deviceName: impresora } : {}),
          printBackground: true,
          margins: { marginType: 'none' },
          pageSize: { width: ANCHO_TIRILLA_MM * MICRAS_POR_MM, height: alto },
        },
        (exito, motivo) => {
          if (exito) {
            resolver(true);
          } else if (motivo === 'cancelled') {
            resolver(false);
          } else {
            rechazar(new ErrorDeNegocio('VALIDACION', MENSAJE_FALLO_IMPRESORA));
          }
        },
      );
    });
  } finally {
    ventana.destroy();
  }
}

/**
 * Genera el PDF del documento en hoja carta con `printToPDF` (D-52).
 *
 * @param html - Documento completo.
 * @returns Bytes del PDF.
 */
export async function generarPdf(html: string): Promise<Uint8Array> {
  const ventana = await cargarDocumento(html);
  try {
    return await ventana.webContents.printToPDF({ pageSize: 'Letter', printBackground: true });
  } finally {
    ventana.destroy();
  }
}
