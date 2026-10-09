/**
 * Prueba del instalador NSIS (Fase 6b): instala en una carpeta temporal,
 * vuelve a instalar encima (actualización) y desinstala en silencio.
 *
 * No ejecuta el programa empaquetado: abrirlo usaría la carpeta real de
 * datos (D-15). Si el acceso del escritorio o del menú Inicio ya existe,
 * se detiene para no reemplazarlo. Compara la carpeta real antes y después
 * y aborta si cambió. El texto de la advertencia va comprimido dentro del
 * desinstalador; lo valida la compilación de `build/instalador.nsh`
 * (`warningsAsErrors`). En silencio la respuesta es No: los datos se conservan.
 *
 * Uso: `node tests/e2e/instalador.mjs`
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Nombre del producto, igual al del acceso directo y a la carpeta de datos. */
const NOMBRE = 'Inventario y Facturación';

/** Carpeta temporal de la instalación de prueba. Nunca es la carpeta real. */
const DESTINO = join(tmpdir(), 'saas-instalador-prueba');

/**
 * Falla la prueba con un mensaje en español.
 *
 * @param {string} mensaje Qué falló.
 * @returns {never} Siempre lanza.
 */
function fallar(mensaje) {
  console.error(mensaje);
  process.exitCode = 1;
  throw new Error(mensaje);
}

/**
 * Carpeta del escritorio del usuario (puede estar redirigida a OneDrive).
 *
 * @returns {string} Ruta del escritorio.
 */
function carpetaEscritorio() {
  const resultado = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-Command', "[Environment]::GetFolderPath('Desktop')"],
    { encoding: 'utf8' },
  );
  const ruta = (resultado.stdout ?? '').trim();
  if (resultado.status !== 0 || ruta === '') {
    fallar('No se pudo leer la carpeta del escritorio.');
  }
  return ruta;
}

/**
 * Huella de una carpeta: existencia, tamaño y fecha de cada archivo.
 * No lee el contenido.
 *
 * @param {string} raiz Carpeta a describir.
 * @returns {string} Texto comparable; `ausente` si la carpeta no existe.
 */
function huella(raiz) {
  if (!existsSync(raiz)) return 'ausente';
  /** @type {string[]} */
  const archivos = [];
  const recorrer = (dir) => {
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre);
      const estado = statSync(ruta);
      if (estado.isDirectory()) recorrer(ruta);
      else archivos.push(`${ruta}|${estado.size}|${Math.floor(estado.mtimeMs)}`);
    }
  };
  recorrer(raiz);
  archivos.sort();
  return archivos.join('\n');
}

/**
 * Lee la versión de producto de un ejecutable de Windows.
 *
 * @param {string} ruta Ruta del `.exe`.
 * @returns {string} Versión de producto.
 */
function versionDe(ruta) {
  const literal = ruta.replace(/'/g, "''");
  const resultado = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-Command', `(Get-Item -LiteralPath '${literal}').VersionInfo.ProductVersion`],
    { encoding: 'utf8' },
  );
  return (resultado.stdout ?? '').trim();
}

/**
 * Ejecuta un programa y corta la prueba si el código de salida no es cero.
 *
 * @param {string} exe Ruta del programa.
 * @param {string[]} args Argumentos.
 * @returns {void}
 */
function ejecutar(exe, args) {
  const resultado = spawnSync(exe, args, { stdio: 'inherit' });
  if (resultado.status !== 0) {
    fallar(`Falló (código ${resultado.status ?? 'sin código'}): ${exe}`);
  }
}

/**
 * Busca un archivo por expresión regular.
 *
 * @param {string} directorio Carpeta donde buscar.
 * @param {RegExp} patron Nombre esperado.
 * @returns {string} Ruta completa.
 */
function buscar(directorio, patron) {
  const nombre = readdirSync(directorio).find((item) => patron.test(item));
  if (nombre == null) fallar(`No hay un archivo ${patron} en ${directorio}.`);
  return join(directorio, nombre);
}

/**
 * Espera a que una ruta deje de existir. El desinstalador se copia a una
 * carpeta temporal y el proceso que lo lanzó termina antes de borrar los archivos.
 *
 * @param {string} ruta Archivo que debe desaparecer.
 * @param {number} ms Tiempo máximo de espera.
 * @returns {boolean} Si desapareció a tiempo.
 */
function esperarAusente(ruta, ms) {
  const limite = Date.now() + ms;
  while (existsSync(ruta)) {
    if (Date.now() > limite) return false;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
  }
  return true;
}

/**
 * Instala, actualiza y desinstala sin abrir el programa.
 *
 * @returns {void}
 */
function main() {
  const escritorio = join(carpetaEscritorio(), `${NOMBRE}.lnk`);
  const inicio = join(
    process.env.APPDATA ?? '',
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    `${NOMBRE}.lnk`,
  );
  if (existsSync(escritorio) || existsSync(inicio)) {
    fallar(
      'Ya hay un acceso directo de Inventario y Facturación. No se instala, para no reemplazarlo.',
    );
  }

  const datosReales = join(process.env.APPDATA ?? '', NOMBRE);
  const antes = huella(datosReales);
  const instalador = buscar(join(process.cwd(), 'release'), /Setup 1\.0\.0\.exe$/);
  const comprobarDatos = () => {
    const despues = huella(datosReales);
    if (despues !== antes) {
      fallar(
        'La carpeta real de datos cambió durante la prueba del instalador. Deténgase y revísela.',
      );
    }
  };

  console.log('Instalando en', DESTINO);
  ejecutar(instalador, ['/S', '/currentuser', `/D=${DESTINO}`]);
  comprobarDatos();

  const programa = join(DESTINO, `${NOMBRE}.exe`);
  if (!existsSync(programa)) fallar(`No quedó el programa en ${programa}.`);
  const version = versionDe(programa);
  if (!version.startsWith('1.0.0'))
    fallar(`La versión del programa es «${version}», se esperaba 1.0.0.`);
  if (!existsSync(escritorio) || !existsSync(inicio)) {
    fallar('Faltó el acceso del escritorio o del menú Inicio.');
  }
  const sqlite = join(DESTINO, 'resources', 'app.asar.unpacked', 'node_modules', 'better-sqlite3');
  if (!existsSync(sqlite)) fallar('better-sqlite3 no quedó descomprimido en la instalación.');

  const marca = join(DESTINO, 'marca-prueba.txt');
  writeFileSync(marca, 'se debe borrar al actualizar');
  console.log('Actualizando sobre la instalación anterior');
  ejecutar(instalador, ['/S', '/currentuser', `/D=${DESTINO}`]);
  comprobarDatos();
  if (existsSync(marca)) fallar('La actualización no reemplazó los archivos del programa.');
  if (!existsSync(programa)) fallar('Tras actualizar no está el programa.');
  if (!versionDe(programa).startsWith('1.0.0')) fallar('Tras actualizar la versión no es 1.0.0.');

  const desinstaladorNuevo = buscar(DESTINO, /^Uninstall .+\.exe$/);
  console.log('Desinstalando en silencio (debe conservar los datos)');
  ejecutar(desinstaladorNuevo, ['/S']);
  if (!esperarAusente(programa, 20000)) {
    fallar('El programa sigue en la carpeta de instalación.');
  }
  if (!esperarAusente(escritorio, 20000) || !esperarAusente(inicio, 20000)) {
    fallar('Quedó un acceso directo después de desinstalar.');
  }
  comprobarDatos();
  esperarAusente(desinstaladorNuevo, 20000);
  try {
    rmSync(DESTINO, { recursive: true, force: true });
  } catch {
    // El desinstalador puede seguir cerrando la carpeta un instante.
  }
  console.log(
    'Instalación, actualización y desinstalación en silencio correctas. El programa no se abrió.',
  );
}

try {
  main();
} catch (error) {
  if (process.exitCode !== 1) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
  if (existsSync(DESTINO)) {
    const pendiente = readdirSync(DESTINO).find((item) => /^Uninstall .+\.exe$/.test(item));
    if (pendiente != null) {
      console.error('La prueba falló: se desinstala la copia de prueba.');
      spawnSync(join(DESTINO, pendiente), ['/S'], { stdio: 'inherit' });
    }
  }
}
