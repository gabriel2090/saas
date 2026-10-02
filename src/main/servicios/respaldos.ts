import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  POLITICA_RETENCION_POR_DEFECTO,
  seleccionarRespaldosAEliminar,
  type ArchivoRespaldo,
  type PoliticaRetencion,
} from '../../domain/politica-respaldos';
import type { BaseDeDatos } from '../../data/conexion';
import { aIsoLocal } from '../../shared/formato/fechas';

/**
 * Patrón del nombre de un respaldo: `respaldo-20261001-233000-123.db`.
 */
const PATRON_ARCHIVO = /^respaldo-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(\d{3})\.db$/;

/**
 * Opciones del servicio de respaldos.
 */
export interface OpcionesRespaldos {
  /** Conexión a respaldar. */
  db: BaseDeDatos;
  /** Carpeta de destino (se crea si no existe). */
  carpeta: string;
  /** Espera tras la última transacción antes de copiar (por defecto 3000 ms, D-07). */
  esperaMs?: number;
  /** Política de retención. */
  politica?: PoliticaRetencion;
  /** Fuente de la hora actual (inyectable en pruebas). */
  ahora?: () => Date;
  /** Se llama cuando una copia automática falla (para registrarla en el log). */
  alFallar?: (error: unknown) => void;
}

/**
 * Servicio de respaldos automáticos.
 */
export interface ServicioRespaldos {
  /** Programa una copia tras la espera; si ya había una programada, la reinicia (debounce). */
  programar(): void;
  /**
   * Hace la copia de inmediato y aplica la rotación.
   *
   * @returns Ruta del archivo creado.
   */
  respaldarAhora(): string;
  /** Si hay una copia programada, la hace ya (se usa al cerrar la aplicación). */
  vaciarPendiente(): void;
  /**
   * Fecha ISO de la última copia hecha en esta ejecución.
   *
   * @returns Fecha o `null`.
   */
  ultimoRespaldo(): string | null;
  /**
   * Carpeta de destino.
   *
   * @returns Ruta de la carpeta.
   */
  carpeta(): string;
}

/**
 * Rellena con ceros a la izquierda.
 *
 * @param valor - Número.
 * @param largo - Largo total.
 * @returns Texto relleno.
 */
function rellenar(valor: number, largo = 2): string {
  return String(valor).padStart(largo, '0');
}

/**
 * Construye el nombre de archivo de un respaldo a partir de su fecha local.
 *
 * @param fecha - Momento de la copia.
 * @returns Nombre como `respaldo-20261001-233000-123.db`.
 */
export function nombreArchivoRespaldo(fecha: Date): string {
  return (
    `respaldo-${fecha.getFullYear()}${rellenar(fecha.getMonth() + 1)}${rellenar(fecha.getDate())}` +
    `-${rellenar(fecha.getHours())}${rellenar(fecha.getMinutes())}${rellenar(fecha.getSeconds())}` +
    `-${rellenar(fecha.getMilliseconds(), 3)}.db`
  );
}

/**
 * Lee la fecha local codificada en el nombre de un respaldo.
 *
 * @param nombre - Nombre del archivo.
 * @returns La fecha, o `null` si el nombre no es de un respaldo.
 */
export function fechaDeArchivoRespaldo(nombre: string): Date | null {
  const m = PATRON_ARCHIVO.exec(nombre);
  if (!m) {
    return null;
  }
  const [, a, mes, d, h, min, s, ms] = m.map(Number);
  return new Date(a ?? 0, (mes ?? 1) - 1, d, h, min, s, ms);
}

/**
 * Crea el servicio de respaldos.
 *
 * La copia se hace con `VACUUM INTO`, que genera un archivo SQLite
 * consistente y compacto aunque la base esté en modo WAL. Se escribe primero
 * con extensión `.tmp` y luego se renombra, para que nunca quede un respaldo
 * a medio escribir con nombre válido.
 *
 * @param opciones - Configuración del servicio.
 * @returns El servicio.
 */
export function crearServicioRespaldos(opciones: OpcionesRespaldos): ServicioRespaldos {
  const espera = opciones.esperaMs ?? 3000;
  const politica = opciones.politica ?? POLITICA_RETENCION_POR_DEFECTO;
  const ahora = opciones.ahora ?? ((): Date => new Date());
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let ultimo: string | null = null;

  const rotar = (): void => {
    const archivos: ArchivoRespaldo[] = readdirSync(opciones.carpeta).flatMap((nombre) => {
      const fecha = fechaDeArchivoRespaldo(nombre);
      return fecha ? [{ nombre, fecha }] : [];
    });
    for (const nombre of seleccionarRespaldosAEliminar(archivos, ahora(), politica)) {
      rmSync(join(opciones.carpeta, nombre), { force: true });
    }
  };

  const respaldarAhora = (): string => {
    if (!existsSync(opciones.carpeta)) {
      mkdirSync(opciones.carpeta, { recursive: true });
    }
    const momento = ahora();
    const destino = join(opciones.carpeta, nombreArchivoRespaldo(momento));
    const temporal = `${destino}.tmp`;
    rmSync(temporal, { force: true });
    opciones.db.prepare('VACUUM INTO ?').run(temporal);
    renameSync(temporal, destino);
    ultimo = aIsoLocal(momento);
    rotar();
    return destino;
  };

  const ejecutarProgramado = (): void => {
    temporizador = null;
    try {
      respaldarAhora();
    } catch (error) {
      opciones.alFallar?.(error);
    }
  };

  return {
    programar() {
      if (temporizador !== null) {
        clearTimeout(temporizador);
      }
      temporizador = setTimeout(ejecutarProgramado, espera);
    },
    respaldarAhora,
    vaciarPendiente() {
      if (temporizador !== null) {
        clearTimeout(temporizador);
        ejecutarProgramado();
      }
    },
    ultimoRespaldo: () => ultimo,
    carpeta: () => opciones.carpeta,
  };
}
