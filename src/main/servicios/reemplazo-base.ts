import { copyFileSync, existsSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { ErrorDeNegocio } from '../../domain/errores';

/**
 * Puntos en los que una prueba puede cortar el reemplazo de la base.
 */
export interface GanchosReemplazo {
  /**
   * Se llama después de la copia previa y antes de cerrar la conexión.
   * Si lanza, la base en uso no se toca y la conexión sigue abierta.
   */
  antesDeCerrar?: () => void;
  /**
   * Se llama cuando la base ya se apartó y la copia nueva todavía no ocupa
   * su lugar. Si lanza, se intenta devolver la base apartada.
   */
  duranteReemplazo?: () => void;
}

/**
 * Indica si dos rutas apuntan al mismo archivo (sin distinguir mayúsculas).
 *
 * @param a - Primera ruta.
 * @param b - Segunda ruta.
 * @returns `true` si son la misma.
 */
export function mismaRuta(a: string, b: string): boolean {
  return resolve(a).toLowerCase() === resolve(b).toLowerCase();
}

/**
 * Borra el diario WAL de una base ya cerrada, para que no se reaplique sobre
 * el archivo que va a ocupar su lugar.
 *
 * @param ruta - Ruta del archivo `.db`.
 */
export function borrarDiario(ruta: string): void {
  rmSync(`${ruta}-wal`, { force: true });
  rmSync(`${ruta}-shm`, { force: true });
}

/**
 * Renombra un archivo y, si existen, su `-wal` y su `-shm`.
 *
 * @param origen - Ruta actual.
 * @param destino - Ruta nueva.
 */
export function renombrarConDiario(origen: string, destino: string): void {
  renameSync(origen, destino);
  for (const sufijo of ['-wal', '-shm']) {
    const lado = `${origen}${sufijo}`;
    if (existsSync(lado)) {
      renameSync(lado, `${destino}${sufijo}`);
    }
  }
}

/**
 * Sustituye la base en uso por una copia, sin escribir encima del archivo
 * abierto: primero se copia a un nombre nuevo y después se renombra.
 *
 * Quien llama ya cerró la conexión y borró el diario. Si algo falla antes de
 * apartar la base, el archivo original sigue en su sitio. Si falla después,
 * se intenta devolverlo.
 *
 * @param rutaActual - Base en uso.
 * @param rutaCopia - Copia ya validada.
 * @param ganchos - Corte a mitad del reemplazo.
 * @throws {ErrorDeNegocio} Si no se puede apartar la base (queda intacta).
 * @throws {ErrorReemplazo} Si el reemplazo se interrumpe después de apartarla.
 */
export function reemplazarArchivoBase(
  rutaActual: string,
  rutaCopia: string,
  ganchos: GanchosReemplazo = {},
): void {
  const temporal = join(dirname(rutaActual), `${basename(rutaActual)}.nueva`);
  const apartada = join(dirname(rutaActual), `${basename(rutaActual)}.apartada`);
  rmSync(temporal, { force: true });
  copyFileSync(rutaCopia, temporal);
  try {
    renameSync(rutaActual, apartada);
  } catch {
    rmSync(temporal, { force: true });
    throw new ErrorDeNegocio(
      'INESPERADO',
      'No se pudo reemplazar la base porque el archivo sigue en uso. La base actual no se modificó. Cierre el programa y vuelva a intentar.',
    );
  }
  try {
    ganchos.duranteReemplazo?.();
    renameSync(temporal, rutaActual);
  } catch (error) {
    let intacta = false;
    if (!existsSync(rutaActual) && existsSync(apartada)) {
      try {
        renameSync(apartada, rutaActual);
        intacta = true;
      } catch {
        intacta = false;
      }
    }
    if (intacta) {
      rmSync(temporal, { force: true });
    }
    throw new ErrorReemplazo(error, intacta, intacta ? null : apartada);
  }
  try {
    rmSync(apartada, { force: true });
  } catch {
    // La copia previa a restauración ya guarda este contenido.
  }
}

/**
 * El reemplazo se interrumpió después de apartar la base.
 */
export class ErrorReemplazo extends Error {
  /** `true` si la base original volvió a su sitio. */
  readonly baseQuedoIntacta: boolean;
  /** Dónde quedó la base si no se pudo devolver. */
  readonly rutaApartada: string | null;

  /**
   * Crea el error.
   *
   * @param causa - Error que interrumpió el reemplazo.
   * @param baseQuedoIntacta - Si la base original volvió a su sitio.
   * @param rutaApartada - Ruta de la base apartada, si sigue apartada.
   */
  constructor(causa: unknown, baseQuedoIntacta: boolean, rutaApartada: string | null) {
    super(causa instanceof Error ? causa.message : String(causa));
    this.name = 'ErrorReemplazo';
    this.baseQuedoIntacta = baseQuedoIntacta;
    this.rutaApartada = rutaApartada;
  }
}
