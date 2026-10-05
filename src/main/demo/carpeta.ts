import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { abrirBaseDeDatos } from '../../data/conexion';
import { migracionesDelProyecto } from '../../data/migraciones';
import { aplicarMigraciones } from '../../data/migrador';
import { obtenerConfiguracion } from '../../data/repositorios/configuracion.repo';
import { ARCHIVO_BASE_DATOS, CARPETA_DATOS } from '../rutas';
import { sembrarDatosGrandes } from './grande';
import { CLAVE_MARCA_DEMO, CONTRASENA_DEMO, sembrarDatosDemo } from './sembrar';

/**
 * Qué hacer con los datos de ejemplo: cargarlos (reemplazando la base de
 * desarrollo), cargarlos con el volumen grande para medir tiempos, o
 * borrarlos.
 */
export type AccionDatosDemo = 'cargar' | 'grande' | 'borrar';

/**
 * Resultado de preparar la carpeta: líneas para la consola y si terminó bien.
 */
export interface ResultadoDatosDemo {
  /** `true` si se hizo lo pedido. */
  ok: boolean;
  /** Mensajes para mostrar en la terminal. */
  lineas: string[];
}

/**
 * Lo que se sabe de la base de desarrollo que ya existe.
 */
interface BaseExistente {
  /** Si está marcada como base de ejemplo. */
  esDemo: boolean;
  /** Impresora configurada, para conservarla al recargar. */
  impresora: string | null;
}

/**
 * Lee la marca de ejemplo y la impresora de una base existente. Una base sin
 * migrar o dañada cuenta como «no es de ejemplo» (nunca se borra).
 *
 * @param ruta - Archivo de la base.
 * @returns Marca e impresora.
 */
function leerBaseExistente(ruta: string): BaseExistente {
  const db = abrirBaseDeDatos(ruta);
  try {
    return {
      esDemo: obtenerConfiguracion(db, CLAVE_MARCA_DEMO) !== null,
      impresora: obtenerConfiguracion(db, 'facturacion.impresora'),
    };
  } catch {
    return { esDemo: false, impresora: null };
  } finally {
    db.close();
  }
}

/**
 * Indica si una carpeta es la de datos del negocio o está dentro de ella. Se
 * compara sin distinguir mayúsculas (rutas de Windows).
 *
 * @param carpeta - Carpeta pedida.
 * @param carpetaReal - Carpeta de datos de la app instalada.
 * @returns `true` si no se debe tocar.
 *
 * @example
 * esCarpetaProtegida('C:\\Users\\a\\AppData\\Roaming\\Inventario y Facturación\\', 'C:\\Users\\a\\AppData\\Roaming\\Inventario y Facturación'); // true
 * esCarpetaProtegida('C:\\Users\\a\\AppData\\Roaming\\Inventario y Facturación (desarrollo)', 'C:\\Users\\a\\AppData\\Roaming\\Inventario y Facturación'); // false
 */
export function esCarpetaProtegida(carpeta: string, carpetaReal: string): boolean {
  const pedida = resolve(carpeta).toLowerCase();
  const real = resolve(carpetaReal).toLowerCase();
  return pedida === real || pedida.startsWith(`${real}${sep}`);
}

/**
 * Sello de fecha y hora para el nombre de la carpeta guardada aparte.
 *
 * @param fecha - Momento.
 * @returns `AAAAMMDD-HHMMSS`.
 */
function sello(fecha: Date): string {
  const dos = (n: number): string => String(n).padStart(2, '0');
  return (
    `${fecha.getFullYear()}${dos(fecha.getMonth() + 1)}${dos(fecha.getDate())}-` +
    `${dos(fecha.getHours())}${dos(fecha.getMinutes())}${dos(fecha.getSeconds())}`
  );
}

/**
 * Carga o borra los datos de ejemplo en la carpeta de datos de desarrollo
 * (D-142). Solo se borra una base marcada como de ejemplo; cualquier otra se
 * mueve completa a `datos-anterior-AAAAMMDD-HHMMSS`, junto a la carpeta de
 * datos, para no perder nada que se haya escrito a mano.
 *
 * Al cargar, se conserva la impresora configurada en la base anterior, para
 * no tener que elegirla otra vez antes de probar la impresión.
 *
 * Nunca actúa sobre la carpeta de la app instalada ni dentro de ella, aunque
 * se pida con `--carpeta-datos`.
 *
 * @param carpetaUsuario - Carpeta de la app de desarrollo (contiene `datos`).
 * @param accion - Cargar (normal o con el volumen grande) o borrar.
 * @param carpetaReal - Carpeta de datos de la app instalada (la del negocio).
 * @param ahora - Momento actual (para el sello de la carpeta guardada aparte).
 * @returns Si se hizo y los mensajes para la terminal.
 * @throws {Error} Si falla el sistema de archivos o la carga.
 */
export function prepararDatosDemo(
  carpetaUsuario: string,
  accion: AccionDatosDemo,
  carpetaReal: string,
  ahora: Date = new Date(),
): ResultadoDatosDemo {
  if (esCarpetaProtegida(carpetaUsuario, carpetaReal)) {
    return {
      ok: false,
      lineas: [
        `${carpetaUsuario} es la carpeta de datos del negocio: los datos de ejemplo nunca se cargan ni se borran ahí.`,
        'Use npm run dev:datos-demo sin --carpeta-datos (carga en la carpeta de desarrollo).',
      ],
    };
  }
  const carpetaDatos = join(carpetaUsuario, CARPETA_DATOS);
  const ruta = join(carpetaDatos, ARCHIVO_BASE_DATOS);
  const lineas: string[] = [];
  let impresora: string | null = null;

  if (existsSync(ruta)) {
    const existente = leerBaseExistente(ruta);
    impresora = existente.impresora;
    if (existente.esDemo) {
      for (const archivo of [ruta, `${ruta}-wal`, `${ruta}-shm`]) {
        rmSync(archivo, { force: true });
      }
      lineas.push('Se borró la base de ejemplo anterior.');
    } else if (accion === 'borrar') {
      return {
        ok: false,
        lineas: [
          `La base de ${carpetaDatos} no es de ejemplo: no se borró.`,
          'Para reemplazarla por datos de ejemplo use npm run dev:datos-demo (la guarda aparte antes).',
        ],
      };
    } else {
      const aparte = join(carpetaUsuario, `${CARPETA_DATOS}-anterior-${sello(ahora)}`);
      renameSync(carpetaDatos, aparte);
      lineas.push(`La base de desarrollo anterior no era de ejemplo: se guardó en ${aparte}.`);
    }
  }

  if (accion === 'borrar') {
    if (lineas.length === 0) {
      lineas.push('No había datos de ejemplo.');
    }
    lineas.push(
      'Al abrir la app (npm run dev) se pedirá crear la contraseña, o cargue de nuevo con npm run dev:datos-demo.',
    );
    return { ok: true, lineas };
  }

  mkdirSync(carpetaDatos, { recursive: true });
  const db = abrirBaseDeDatos(ruta);
  try {
    aplicarMigraciones(db, migracionesDelProyecto());
    const { claveRecuperacion, resumen } = sembrarDatosDemo(db, { impresora });
    const grandes = accion === 'grande' ? sembrarDatosGrandes(db) : [];
    lineas.push(
      `Datos de ejemplo cargados en ${carpetaDatos}:`,
      ...resumen.map((r) => `  - ${r}`),
      ...(grandes.length > 0 ? ['Volumen grande:', ...grandes.map((r) => `  - ${r}`)] : []),
      impresora ? `Se conservó la impresora «${impresora}».` : 'Sin impresora configurada.',
      '',
      `Contraseña: ${CONTRASENA_DEMO}`,
      `Clave de recuperación: ${claveRecuperacion}`,
      '',
      'Abra la app con npm run dev. Para borrarlos: npm run dev:datos-demo:borrar.',
    );
  } finally {
    db.close();
  }
  return { ok: true, lineas };
}
