/**
 * Genera el PDF de un reporte con las mismas opciones que la app
 * (`generarPdf`: hoja carta, fondos), para revisar en la prueba de punta a
 * punta el pie con el número de página sin pasar por el diálogo de guardar.
 *
 * Uso: npx electron tests/e2e/pdf-reporte.mjs <reporte.html> <salida.pdf>
 */
import { app, BrowserWindow } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** HTML del reporte y PDF de salida, de la línea de comandos. */
const [entrada, salida] = process.argv.slice(2);

app.whenReady().then(async () => {
  const ventana = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, javascript: false },
  });
  const html = readFileSync(resolve(entrada), 'utf8');
  await ventana.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  const pdf = await ventana.webContents.printToPDF({ pageSize: 'Letter', printBackground: true });
  writeFileSync(resolve(salida), pdf);
  app.quit();
});
