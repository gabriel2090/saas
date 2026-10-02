import { BrowserWindow } from 'electron';
import { ErrorDeNegocio } from '../../domain/errores';

/**
 * Carga un documento HTML en una ventana oculta y aislada: sin preload, sin
 * scripts, sin ventanas emergentes ni navegación. Solo sirve para imprimir o
 * generar el PDF.
 *
 * @param html - Documento completo.
 * @returns La ventana con el documento cargado.
 */
async function cargarDocumento(html: string): Promise<BrowserWindow> {
  const ventana = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false,
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
            rechazar(
              new ErrorDeNegocio(
                'VALIDACION',
                'No se pudo imprimir. Revise que la impresora esté encendida y conectada.',
              ),
            );
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
