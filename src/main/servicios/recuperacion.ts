import { copyFileSync, existsSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { crearEntradaHistorial } from '../../domain/auditoria';
import { ErrorDeNegocio } from '../../domain/errores';
import { abrirBaseDeDatos } from '../../data/conexion';
import type { Migracion } from '../../data/migrador';
import { insertarHistorial } from '../../data/repositorios/historial.repo';
import { aIsoLocal } from '../../shared/formato/fechas';
import type {
  ArchivoParaRecuperar,
  CopiaRecuperacion,
  EstadoRecuperacion,
} from '../../shared/recuperacion';
import type { OrigenRestauracion } from '../../shared/respaldos';
import { mismaRuta } from './reemplazo-base';
import { fechaDeArchivoRespaldo, interpretarArchivoRespaldo } from './respaldos';
import { validarCopia } from './validar-copia';

/**
 * Dependencias de la recuperación al arrancar.
 */
export interface OpcionesRecuperacion {
  /** Archivo `inventario.db` que no pasó el chequeo. */
  rutaBaseDatos: string;
  /** Carpeta de respaldos (la configurada, o la predeterminada si no se pudo leer). */
  carpetaRespaldos: string;
  /** Carpeta de datos, donde se conserva la base dañada. */
  carpetaDatos: string;
  /** Versión de la aplicación, para el texto de soporte. */
  version: string;
  /** Resultado técnico del chequeo, sin datos del negocio. */
  detalleIntegridad: string;
  /** Migraciones que conoce esta instalación. */
  migraciones: readonly Migracion[];
  /** Reinicia el proceso cuando la copia ya quedó en su lugar. */
  reiniciar: () => void;
  /**
   * Recibe un fallo que no debe impedir el reinicio (por ejemplo, el historial).
   *
   * @param error - Error capturado.
   */
  alFallar: (error: unknown) => void;
  /**
   * Reloj, para pruebas.
   *
   * @returns El momento actual.
   */
  ahora?: () => Date;
}

/**
 * Recuperación de una base que no se puede abrir: no pide contraseña y no
 * borra el archivo dañado.
 */
export interface ServicioRecuperacion {
  /**
   * Carpeta de respaldos que se está revisando.
   *
   * @returns Ruta de la carpeta.
   */
  carpeta(): string;
  /**
   * Lista las copias y marca la válida más reciente.
   *
   * @returns Estado para la pantalla.
   */
  estado(): EstadoRecuperacion;
  /**
   * Revisa un archivo elegido fuera de la carpeta, sin tocar la base dañada.
   *
   * @param ruta - Archivo elegido.
   * @returns Datos para confirmar.
   * @throws {ErrorDeNegocio} Si el archivo no se puede restaurar.
   */
  describirArchivo(ruta: string): ArchivoParaRecuperar;
  /**
   * Aparta la base dañada, pone la copia en su lugar y reinicia.
   *
   * Si algo falla antes de apartarla, el archivo dañado sigue en su sitio.
   * Si falla después, el archivo dañado queda renombrado y no se borra.
   *
   * @param origen - Copia de la carpeta o archivo elegido.
   * @throws {ErrorDeNegocio} Si la copia no sirve o el reemplazo no se completa.
   */
  restaurar(origen: OrigenRestauracion): void;
  /**
   * Texto para soporte: versión, rutas y resultado del chequeo.
   *
   * @returns Texto plano, sin datos del negocio.
   */
  datosSoporte(): string;
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
 * Nombre del archivo dañado conservado, con la fecha y la hora.
 *
 * @param carpetaDatos - Carpeta de datos.
 * @param fecha - Momento del arranque dañado.
 * @returns Ruta libre (`inventario-AAAAMMDD-HHMMSS-danada.db`).
 */
function rutaBaseDanada(carpetaDatos: string, fecha: Date): string {
  const sello =
    `${fecha.getFullYear()}${rellenar(fecha.getMonth() + 1)}${rellenar(fecha.getDate())}` +
    `-${rellenar(fecha.getHours())}${rellenar(fecha.getMinutes())}${rellenar(fecha.getSeconds())}`;
  const base = `inventario-${sello}`;
  let candidato = join(carpetaDatos, `${base}-danada.db`);
  let n = 2;
  while (
    existsSync(candidato) ||
    existsSync(`${candidato}-wal`) ||
    existsSync(`${candidato}-shm`)
  ) {
    candidato = join(carpetaDatos, `${base}-${n}-danada.db`);
    n += 1;
  }
  return candidato;
}

/**
 * Indica si una ruta está dentro de una carpeta.
 *
 * @param carpeta - Carpeta contenedora.
 * @param ruta - Ruta a comprobar.
 * @returns `true` si la ruta cuelga de la carpeta.
 */
function dentroDeCarpeta(carpeta: string, ruta: string): boolean {
  const base = resolve(carpeta).toLowerCase();
  const destino = resolve(ruta).toLowerCase();
  return destino === base || destino.startsWith(base + sep);
}

/**
 * Renombra la base dañada y su diario. No borra nada.
 *
 * @param rutaBase - Archivo en uso.
 * @param destino - Nombre nuevo, en la misma carpeta.
 * @throws {ErrorDeNegocio} Si el archivo sigue en su sitio, o si se apartó
 * pero el diario no se pudo mover (en ese caso no se coloca la copia).
 */
function apartarBaseDanada(rutaBase: string, destino: string): void {
  const hayPrincipal = existsSync(rutaBase);
  try {
    if (hayPrincipal) {
      renameSync(rutaBase, destino);
    }
    for (const sufijo of ['-wal', '-shm']) {
      const lado = `${rutaBase}${sufijo}`;
      if (existsSync(lado)) {
        renameSync(lado, `${destino}${sufijo}`);
      }
    }
  } catch (error) {
    if (existsSync(rutaBase)) {
      throw new ErrorDeNegocio(
        'INESPERADO',
        'No se pudo apartar la base dañada: el archivo sigue en uso. No se reemplazó y sigue en su lugar.',
      );
    }
    const detalle = error instanceof Error ? error.message : String(error);
    throw new ErrorDeNegocio(
      'INESPERADO',
      `La base dañada quedó en «${destino}», pero no se pudo mover su diario (${detalle}). No se colocó la copia nueva.`,
    );
  }
}

/**
 * Deja la copia en el lugar de la base, por copia a un nombre nuevo y
 * renombre. No escribe encima de un archivo abierto.
 *
 * @param rutaBase - Destino (`inventario.db`), que ya no debe existir.
 * @param rutaCopia - Copia validada.
 * @param conservada - Dónde quedó la base dañada, para el mensaje si falla.
 * @throws {ErrorDeNegocio} Si no se pudo colocar la copia. La base dañada no se borra.
 */
function colocarCopia(rutaBase: string, rutaCopia: string, conservada: string): void {
  const temporal = `${rutaBase}.nueva`;
  rmSync(temporal, { force: true });
  try {
    copyFileSync(rutaCopia, temporal);
    renameSync(temporal, rutaBase);
  } catch (error) {
    rmSync(temporal, { force: true });
    const detalle = error instanceof Error ? error.message : String(error);
    throw new ErrorDeNegocio(
      'INESPERADO',
      `No se pudo dejar la copia en su lugar (${detalle}). La base dañada quedó intacta en «${conservada}». Puede volver a intentar.`,
    );
  }
}

/**
 * Crea el servicio de recuperación al arrancar.
 *
 * @param opciones - Rutas, migraciones y reinicio.
 * @returns Servicio que no abre la base dañada.
 */
export function crearServicioRecuperacion(opciones: OpcionesRecuperacion): ServicioRecuperacion {
  const ahora = opciones.ahora ?? ((): Date => new Date());

  /**
   * Exige que la copia sea restaurable. No modifica ningún archivo.
   *
   * @param ruta - Archivo a revisar.
   * @throws {ErrorDeNegocio} Si no se puede restaurar.
   */
  function exigirValida(ruta: string): void {
    if (mismaRuta(ruta, opciones.rutaBaseDatos)) {
      throw new ErrorDeNegocio(
        'VALIDACION',
        'Ese archivo es la base dañada. Elija una copia de respaldo.',
      );
    }
    const validacion = validarCopia(ruta, opciones.migraciones);
    if (!validacion.ok) {
      throw new ErrorDeNegocio('VALIDACION', validacion.mensaje);
    }
  }

  /**
   * Resuelve una copia de la carpeta, sin salir de ella.
   *
   * @param nombre - Nombre de archivo.
   * @returns Ruta absoluta.
   * @throws {ErrorDeNegocio} Si el nombre no es una copia de esta carpeta.
   */
  function resolverCopia(nombre: string): string {
    if (nombre !== basename(nombre) || !interpretarArchivoRespaldo(nombre)) {
      throw new ErrorDeNegocio('VALIDACION', 'El nombre de la copia no es válido.');
    }
    const ruta = join(opciones.carpetaRespaldos, nombre);
    if (!dentroDeCarpeta(opciones.carpetaRespaldos, ruta) || !existsSync(ruta)) {
      throw new ErrorDeNegocio('NO_ENCONTRADO', 'Esa copia ya no está en la carpeta de respaldos.');
    }
    return ruta;
  }

  /**
   * Anota la recuperación en la base ya restaurada. Si falla, no deshace
   * el reemplazo: la copia ya está en su lugar.
   *
   * @param nombre - Archivo restaurado.
   * @param momento - Momento de la recuperación.
   */
  function anotarHistorial(nombre: string, momento: Date): void {
    const db = abrirBaseDeDatos(opciones.rutaBaseDatos);
    try {
      const entrada = crearEntradaHistorial(
        {
          entidad: 'respaldo',
          entidadId: nombre,
          accion: 'sistema',
          antes: null,
          despues: { archivo: nombre },
          motivo: 'Restauración desde la pantalla de recuperación',
        },
        aIsoLocal(momento),
      );
      db.transaction(() => {
        insertarHistorial(db, entrada);
      }).immediate();
    } finally {
      db.close();
    }
  }

  return {
    carpeta: () => opciones.carpetaRespaldos,

    estado(): EstadoRecuperacion {
      const copias: CopiaRecuperacion[] = existsSync(opciones.carpetaRespaldos)
        ? readdirSync(opciones.carpetaRespaldos).flatMap((nombre) => {
            const interpretado = interpretarArchivoRespaldo(nombre);
            if (!interpretado) {
              return [];
            }
            const ruta = join(opciones.carpetaRespaldos, nombre);
            const validacion = validarCopia(ruta, opciones.migraciones);
            const tamano = existsSync(ruta) ? statSync(ruta).size : 0;
            return [
              {
                nombre,
                fecha: aIsoLocal(interpretado.fecha),
                tipo: interpretado.tipo,
                tamano,
                valida: validacion.ok,
                motivo: validacion.ok ? null : validacion.mensaje,
                recomendada: false,
              },
            ];
          })
        : [];
      copias.sort((a, b) => {
        if (a.fecha === b.fecha) {
          return 0;
        }
        return a.fecha < b.fecha ? 1 : -1;
      });
      const primeraValida = copias.find((copia) => copia.valida);
      if (primeraValida) {
        primeraValida.recomendada = true;
      }
      return {
        carpetaRespaldos: opciones.carpetaRespaldos,
        mensaje: 'La verificación de integridad encontró daños.',
        copias,
        nombreBaseDanada: basename(rutaBaseDanada(opciones.carpetaDatos, ahora())),
      };
    },

    describirArchivo(ruta: string): ArchivoParaRecuperar {
      if (!existsSync(ruta)) {
        throw new ErrorDeNegocio('NO_ENCONTRADO', 'No se encontró el archivo elegido.');
      }
      exigirValida(ruta);
      const nombre = basename(ruta);
      const delNombre = fechaDeArchivoRespaldo(nombre);
      return {
        ruta,
        nombre,
        fecha: aIsoLocal(delNombre ?? statSync(ruta).mtime),
      };
    },

    restaurar(origen: OrigenRestauracion): void {
      const ruta = origen.tipo === 'copia' ? resolverCopia(origen.nombre) : origen.ruta;
      const nombre = origen.tipo === 'copia' ? origen.nombre : basename(origen.ruta);
      if (origen.tipo === 'archivo' && !existsSync(ruta)) {
        throw new ErrorDeNegocio('NO_ENCONTRADO', 'No se encontró el archivo elegido.');
      }
      exigirValida(ruta);

      const hayDiario =
        existsSync(`${opciones.rutaBaseDatos}-wal`) || existsSync(`${opciones.rutaBaseDatos}-shm`);
      let conservada = opciones.carpetaDatos;
      if (existsSync(opciones.rutaBaseDatos) || hayDiario) {
        conservada = rutaBaseDanada(opciones.carpetaDatos, ahora());
        apartarBaseDanada(opciones.rutaBaseDatos, conservada);
      }
      colocarCopia(opciones.rutaBaseDatos, ruta, conservada);

      try {
        anotarHistorial(nombre, ahora());
      } catch (error) {
        opciones.alFallar(error);
      }
      opciones.reiniciar();
    },

    datosSoporte(): string {
      const detalle = opciones.detalleIntegridad.trim().slice(0, 4000);
      return [
        'Inventario y Facturación',
        `Versión: ${opciones.version}`,
        `Carpeta de datos: ${opciones.carpetaDatos}`,
        `Archivo de la base: ${opciones.rutaBaseDatos}`,
        `Carpeta de respaldos: ${opciones.carpetaRespaldos}`,
        'Resultado del chequeo de integridad:',
        detalle === '' ? '(sin detalle)' : detalle,
      ].join('\n');
    },
  };
}
