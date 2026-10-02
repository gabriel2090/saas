/**
 * Convierte una maqueta HTML en PNG usando el Electron del proyecto, para
 * revisar diseños sin abrir la aplicación ni tocar sus datos.
 *
 * Uso: npx electron docs/maquetas/capturar.mjs <maqueta.html> <salida.png> [ancho] [alto] [variante]
 *
 * `variante` se pasa como `#variante` en la URL, para maquetas con varios estados.
 */
import { app, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [html, png, ancho = '1280', alto = '800', variante = ''] = process.argv.slice(2);

app.whenReady().then(async () => {
  const ventana = new BrowserWindow({
    width: Number(ancho),
    height: Number(alto),
    useContentSize: true,
    show: false,
    webPreferences: { sandbox: true },
  });
  const url = pathToFileURL(resolve(html));
  url.hash = variante;
  await ventana.loadURL(url.href);
  // Margen para que termine de pintar fuentes y estilos.
  await new Promise((listo) => setTimeout(listo, 600));
  const imagen = await ventana.webContents.capturePage();
  writeFileSync(resolve(png), imagen.toPNG());
  app.quit();
});
