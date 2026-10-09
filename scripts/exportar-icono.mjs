/**
 * Exporta `build/icono.svg` a `build/icon.ico` (16, 24, 32, 48, 64, 128 y 256 px)
 * y deja una vista a 256 px en `build/icono-vista.png`.
 *
 * Los paquetes de rasterizado no son dependencia del proyecto: se instalan
 * en una carpeta temporal y se descartan.
 *
 * Uso: `node scripts/exportar-icono.mjs`
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Genera el `.ico` y la vista PNG.
 *
 * @returns {void}
 */
function exportar() {
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
  const dir = mkdtempSync(join(tmpdir(), 'icono-saas-'));
  try {
    writeFileSync(join(dir, 'package.json'), '{"private":true,"type":"module"}\n');
    const instalacion = spawnSync('npm', ['install', '--silent', '@resvg/resvg-js', 'png-to-ico'], {
      cwd: dir,
      stdio: 'inherit',
      shell: true,
    });
    if (instalacion.status !== 0) {
      process.exit(instalacion.status ?? 1);
    }
    const trabajo = join(dir, 'trabajo.mjs');
    writeFileSync(trabajo, cuerpo(raiz));
    const corrida = spawnSync(process.execPath, [trabajo], { cwd: dir, stdio: 'inherit' });
    if (corrida.status !== 0) {
      process.exit(corrida.status ?? 1);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Programa que rasteriza el SVG ya con los paquetes instalados.
 *
 * @param {string} raizProyecto Ruta del repositorio.
 * @returns {string} Código del programa temporal.
 */
function cuerpo(raizProyecto) {
  const svg = JSON.stringify(join(raizProyecto, 'build', 'icono.svg'));
  const png = JSON.stringify(join(raizProyecto, 'build', 'icono-vista.png'));
  const ico = JSON.stringify(join(raizProyecto, 'build', 'icon.ico'));
  return `
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';
const svg = readFileSync(${svg}, 'utf8');
const tamanos = [16, 24, 32, 48, 64, 128, 256];
const pngs = tamanos.map((tamano) => new Resvg(svg, { fitTo: { mode: 'width', value: tamano } }).render().asPng());
writeFileSync(${png}, pngs.at(-1));
writeFileSync(${ico}, await pngToIco(pngs));
console.log('Icono exportado: build/icon.ico');
`;
}

exportar();
