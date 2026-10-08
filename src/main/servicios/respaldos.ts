import {
  accessSync,
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import Database from 'better-sqlite3';
import { crearEntradaHistorial } from '../../domain/auditoria';
import { normalizarClaveRecuperacion } from '../../domain/clave-recuperacion';
import { ErrorDeNegocio } from '../../domain/errores';
import {
  avisoBarraCopiaExterna,
  documentosQueSePierden,
  estadoCopiaExterna,
  POLITICA_RETENCION_POR_DEFECTO,
  resumirPerdida,
  seleccionarRespaldosAEliminar,
  textoDialogoPerdida,
  yaHayCopiaExternaHoy,
  type ArchivoRespaldo,
  type PerdidaAlRestaurar,
  type PoliticaRetencion,
  type TipoRespaldo,
} from '../../domain/politica-respaldos';
import type { Migracion } from '../../data/migrador';
import { abrirBaseDeDatos, type BaseDeDatos } from '../../data/conexion';
import {
  guardarConfiguracion,
  obtenerConfiguracion,
} from '../../data/repositorios/configuracion.repo';
import { listarDocumentosRespaldo } from '../../data/repositorios/documentosRespaldo.repo';
import { insertarHistorial } from '../../data/repositorios/historial.repo';
import type { EjecutorTransacciones } from '../../data/transaccion';
import { aIsoLocal } from '../../shared/formato/fechas';
import type {
  CopiaRespaldo,
  CredencialRestauracion,
  EstadoRespaldos,
  OrigenRestauracion,
  PrevisualizacionRestauracion,
} from '../../shared/respaldos';
import { htmlListaPerdida } from '../impresion/perdida-respaldo';
import { verificarContrasena } from './hash-contrasena';
import {
  borrarDiario,
  ErrorReemplazo,
  mismaRuta,
  reemplazarArchivoBase,
  type GanchosReemplazo,
} from './reemplazo-base';
import { validarCopia } from './validar-copia';

/**
 * Patrón del nombre: `respaldo-20261001-233000-123.db` o, con tipo,
 * `respaldo-manual-20261001-233000-123.db` (D-179).
 */
const PATRON_ARCHIVO =
  /^respaldo-(?:(manual|migracion|restauracion)-)?(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(\d{3})\.db$/;

/**
 * Infijo del nombre según el tipo. La automática no lleva infijo, para que
 * las copias ya guardadas sigan leyéndose.
 */
const INFIJO_TIPO: Readonly<Record<TipoRespaldo, string>> = {
  automatica: '',
  manual: 'manual-',
  migracion: 'migracion-',
  restauracion: 'restauracion-',
};

/**
 * Copia ya ubicada en disco, lista para previsualizar o restaurar.
 */
interface CopiaResuelta extends PrevisualizacionRestauracion {
  /** Ruta absoluta del archivo. */
  ruta: string;
}

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
  /** Se llama cuando una copia automática o la copia externa fallan. */
  alFallar?: (error: unknown) => void;
  /** Ruta del archivo de la base en uso. Hace falta para restaurar. */
  rutaBaseDatos?: string;
  /** Migraciones que conoce esta versión, para aceptar o rechazar una copia. */
  migraciones?: readonly Migracion[];
  /**
   * Ejecutor de la base en uso. Se pide en el momento de guardar, porque al
   * construir el servicio las migraciones pueden no haberse aplicado.
   */
  obtenerEjecutor?: () => EjecutorTransacciones | null;
  /** Reinicia la aplicación tras una restauración exitosa. */
  reiniciar?: () => void;
  /** Cortes de prueba del reemplazo. */
  ganchos?: GanchosReemplazo;
  /**
   * Rechaza una carpeta (la de datos del negocio cuando la app no está
   * empaquetada). Si devuelve `true`, no se usa.
   */
  rutaProhibida?: (ruta: string) => boolean;
}

/**
 * Servicio de respaldos automáticos, de la ventana Respaldos y de la restauración.
 */
export interface ServicioRespaldos {
  /** Programa una copia tras la espera; si ya había una programada, la reinicia (debounce). */
  programar(): void;
  /**
   * Hace la copia de inmediato y aplica la rotación.
   *
   * @param tipo - Tipo de copia (por defecto automática).
   * @returns Ruta del archivo creado.
   */
  respaldarAhora(tipo?: TipoRespaldo): string;
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
  /**
   * Estado para la ventana y la barra de estado.
   *
   * @returns Copias, carpeta y copia externa.
   */
  estado(): EstadoRespaldos;
  /**
   * Aviso de la copia externa, o `null` si no hay nada que advertir.
   *
   * @returns Texto para la barra de estado.
   */
  avisoExterna(): string | null;
  /**
   * Cambia la carpeta local, comprueba que se pueda escribir y deja una copia inmediata.
   *
   * @param carpeta - Carpeta nueva.
   * @throws {ErrorDeNegocio} Si no se puede escribir o es la carpeta del negocio.
   */
  cambiarCarpeta(carpeta: string): void;
  /**
   * Configura la carpeta de la copia diaria externa.
   *
   * @param carpeta - Carpeta nueva.
   * @throws {ErrorDeNegocio} Si no se puede escribir.
   */
  cambiarExterna(carpeta: string): void;
  /** Quita la carpeta externa. La copia local sigue igual. */
  quitarExterna(): void;
  /**
   * Calcula qué se perdería al restaurar, sin modificar nada.
   *
   * @param origen - Copia de la lista o archivo elegido.
   * @returns Fecha de la copia y documentos que desaparecerían.
   * @throws {ErrorDeNegocio} Si la copia no sirve.
   */
  previsualizar(origen: OrigenRestauracion): PrevisualizacionRestauracion;
  /**
   * HTML de la lista de documentos que se perderían.
   *
   * @param origen - Copia de la lista o archivo elegido.
   * @returns HTML listo para el PDF.
   */
  htmlPerdida(origen: OrigenRestauracion): string;
  /**
   * Restaura una copia: valida, comprueba la credencial, deja la copia previa,
   * reemplaza la base, anota el historial y reinicia.
   *
   * @param origen - Copia de la lista o archivo elegido.
   * @param credencial - Contraseña actual o clave de recuperación.
   * @throws {ErrorDeNegocio} Si la copia no sirve, la credencial es incorrecta
   * o el reemplazo no se puede completar.
   */
  restaurar(origen: OrigenRestauracion, credencial: CredencialRestauracion): void;
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
 * @param tipo - Tipo de copia (por defecto automática, sin infijo).
 * @returns Nombre como `respaldo-20261001-233000-123.db`.
 */
export function nombreArchivoRespaldo(fecha: Date, tipo: TipoRespaldo = 'automatica'): string {
  return (
    `respaldo-${INFIJO_TIPO[tipo]}` +
    `${fecha.getFullYear()}${rellenar(fecha.getMonth() + 1)}${rellenar(fecha.getDate())}` +
    `-${rellenar(fecha.getHours())}${rellenar(fecha.getMinutes())}${rellenar(fecha.getSeconds())}` +
    `-${rellenar(fecha.getMilliseconds(), 3)}.db`
  );
}

/**
 * Lee la fecha y el tipo codificados en el nombre de un respaldo.
 *
 * @param nombre - Nombre del archivo.
 * @returns Fecha y tipo, o `null` si el nombre no es de un respaldo.
 */
export function interpretarArchivoRespaldo(
  nombre: string,
): { fecha: Date; tipo: TipoRespaldo } | null {
  const coincidencia = PATRON_ARCHIVO.exec(nombre);
  if (!coincidencia) {
    return null;
  }
  const tipo = (coincidencia[1] as TipoRespaldo | undefined) ?? 'automatica';
  const numeros = coincidencia.slice(2).map(Number);
  const [anio, mes, dia, hora, minuto, segundo, milisegundo] = numeros;
  return {
    tipo,
    fecha: new Date(anio ?? 0, (mes ?? 1) - 1, dia, hora, minuto, segundo, milisegundo),
  };
}

/**
 * Lee la fecha local codificada en el nombre de un respaldo.
 *
 * @param nombre - Nombre del archivo.
 * @returns La fecha, o `null` si el nombre no es de un respaldo.
 */
export function fechaDeArchivoRespaldo(nombre: string): Date | null {
  return interpretarArchivoRespaldo(nombre)?.fecha ?? null;
}

/**
 * Nombre de la copia diaria en la carpeta externa.
 *
 * @param fecha - Día local.
 * @returns Nombre `respaldo-diaria-AAAAMMDD.db`.
 */
function nombreCopiaDiaria(fecha: Date): string {
  return `respaldo-diaria-${fecha.getFullYear()}${rellenar(fecha.getMonth() + 1)}${rellenar(fecha.getDate())}.db`;
}

/**
 * Lista las copias de una carpeta, de la más reciente a la más antigua.
 *
 * @param carpeta - Carpeta de respaldos.
 * @returns Copias reconocidas por su nombre.
 */
function listarCopias(carpeta: string): CopiaRespaldo[] {
  if (!existsSync(carpeta)) {
    return [];
  }
  return readdirSync(carpeta)
    .flatMap((nombre) => {
      const interpretado = interpretarArchivoRespaldo(nombre);
      if (!interpretado) {
        return [];
      }
      return [
        {
          nombre,
          fecha: aIsoLocal(interpretado.fecha),
          tipo: interpretado.tipo,
          tamano: statSync(join(carpeta, nombre)).size,
        },
      ];
    })
    .sort((a, b) => {
      if (a.fecha === b.fecha) {
        return 0;
      }
      return a.fecha < b.fecha ? 1 : -1;
    });
}

/**
 * Lee los documentos de un archivo de copia, sin modificarlo.
 *
 * @param ruta - Archivo `.db`.
 * @returns Documentos que trae la copia.
 */
function leerDocumentosDeArchivo(ruta: string): PerdidaAlRestaurar['documentos'] {
  const db = new Database(ruta, { readonly: true, fileMustExist: true });
  try {
    return listarDocumentosRespaldo(db, true);
  } finally {
    db.close();
  }
}

/**
 * Comprueba la contraseña actual o la clave de recuperación, sin consumirla.
 *
 * @param db - Base en uso.
 * @param credencial - Lo que escribió el usuario.
 * @throws {ErrorDeNegocio} Si no coincide o todavía no hay contraseña.
 */
function exigirCredencial(db: BaseDeDatos, credencial: CredencialRestauracion): void {
  if (credencial.tipo === 'contrasena') {
    const hash = obtenerConfiguracion(db, 'auth.hash_contrasena');
    if (hash === null) {
      throw new ErrorDeNegocio('CONFLICTO', 'Aún no se ha creado la contraseña de acceso.');
    }
    if (!verificarContrasena(credencial.valor, hash)) {
      throw new ErrorDeNegocio('CONTRASENA_INCORRECTA', 'La contraseña es incorrecta.');
    }
    return;
  }
  const hashClave = obtenerConfiguracion(db, 'auth.hash_clave_recuperacion');
  const compacta = normalizarClaveRecuperacion(credencial.valor);
  if (hashClave === null || compacta === null || !verificarContrasena(compacta, hashClave)) {
    throw new ErrorDeNegocio(
      'CONTRASENA_INCORRECTA',
      'La clave de recuperación no es correcta. Revise que la haya copiado completa.',
    );
  }
}

/**
 * Ubica la copia, comprueba que sirva y calcula lo que se perdería.
 *
 * @param opciones - Opciones del servicio.
 * @param carpeta - Carpeta local de respaldos.
 * @param origen - Copia de la lista o archivo elegido.
 * @param ahora - Reloj.
 * @returns Copia lista para restaurar.
 * @throws {ErrorDeNegocio} Si el archivo no existe o no se puede restaurar.
 */
function prepararRestauracion(
  opciones: OpcionesRespaldos,
  carpeta: string,
  origen: OrigenRestauracion,
  ahora: () => Date,
): CopiaResuelta {
  const resuelta = resolverOrigen(carpeta, origen, ahora);
  if (opciones.rutaBaseDatos !== undefined && mismaRuta(resuelta.ruta, opciones.rutaBaseDatos)) {
    throw new ErrorDeNegocio('VALIDACION', 'Ese archivo es la base que está en uso.');
  }
  const validacion = validarCopia(resuelta.ruta, opciones.migraciones ?? []);
  if (!validacion.ok) {
    throw new ErrorDeNegocio('VALIDACION', validacion.mensaje);
  }
  const actuales = listarDocumentosRespaldo(opciones.db);
  const enLaCopia = leerDocumentosDeArchivo(resuelta.ruta);
  const perdidos = documentosQueSePierden(actuales, enLaCopia).sort(
    (a, b) => a.momento.localeCompare(b.momento) || a.tipo.localeCompare(b.tipo, 'es'),
  );
  return { ...resuelta, perdida: resumirPerdida(perdidos) };
}

/**
 * Traduce el origen a una ruta y una fecha.
 *
 * @param carpeta - Carpeta local de respaldos.
 * @param origen - Copia de la lista o archivo elegido.
 * @param ahora - Reloj, para fechar un archivo cuyo nombre no es de respaldo.
 * @returns Ruta, nombre y fecha.
 * @throws {ErrorDeNegocio} Si el nombre no es válido o el archivo no está.
 */
function resolverOrigen(
  carpeta: string,
  origen: OrigenRestauracion,
  ahora: () => Date,
): Omit<CopiaResuelta, 'perdida'> {
  if (origen.tipo === 'copia') {
    if (origen.nombre !== basename(origen.nombre) || !interpretarArchivoRespaldo(origen.nombre)) {
      throw new ErrorDeNegocio('VALIDACION', 'El archivo de respaldo no es válido.');
    }
    const ruta = join(carpeta, origen.nombre);
    if (!existsSync(ruta)) {
      throw new ErrorDeNegocio('NO_ENCONTRADO', 'Esa copia ya no está en la carpeta de respaldos.');
    }
    const interpretado = interpretarArchivoRespaldo(origen.nombre);
    return {
      ruta,
      nombre: origen.nombre,
      fecha: aIsoLocal(interpretado?.fecha ?? ahora()),
    };
  }
  if (!existsSync(origen.ruta)) {
    throw new ErrorDeNegocio('NO_ENCONTRADO', 'No se encontró el archivo elegido.');
  }
  const nombre = basename(origen.ruta);
  const interpretado = interpretarArchivoRespaldo(nombre);
  return {
    ruta: origen.ruta,
    nombre,
    fecha: aIsoLocal(interpretado?.fecha ?? statSync(origen.ruta).mtime),
  };
}

/**
 * Convierte un fallo del reemplazo en un mensaje que dice si la base quedó intacta.
 *
 * @param error - Error capturado.
 * @param previa - Ruta de la copia previa a restauración.
 * @returns Error de negocio.
 */
function mensajeDeReemplazo(error: unknown, previa: string): ErrorDeNegocio {
  if (error instanceof ErrorReemplazo) {
    if (error.baseQuedoIntacta) {
      return new ErrorDeNegocio(
        'INESPERADO',
        'No se pudo completar la restauración. La base actual no cambió. ' +
          `Quedó la copia previa a restauración en «${previa}». Cierre el programa y vuelva a abrirlo.`,
      );
    }
    return new ErrorDeNegocio(
      'INESPERADO',
      'La restauración se interrumpió a mitad. ' +
        `La base que estaba en uso quedó en «${error.rutaApartada ?? previa}» ` +
        `y la copia previa a restauración en «${previa}». No siga trabajando: use una de esas copias.`,
    );
  }
  if (error instanceof ErrorDeNegocio) {
    return error;
  }
  return new ErrorDeNegocio(
    'INESPERADO',
    `No se pudo completar la restauración. Quedó la copia previa a restauración en «${previa}».`,
  );
}

/**
 * Anota la restauración en la base que acaba de quedar en uso.
 *
 * @param ruta - Archivo de la base ya restaurada.
 * @param nombre - Nombre de la copia restaurada.
 * @param perdida - Documentos que se dejaron atrás.
 * @param momento - Momento de la restauración.
 */
function registrarRestauracion(
  ruta: string,
  nombre: string,
  perdida: PerdidaAlRestaurar,
  momento: Date,
): void {
  const db = abrirBaseDeDatos(ruta);
  try {
    const rango =
      perdida.facturaDesde === null || perdida.facturaHasta === null
        ? ''
        : perdida.facturaDesde === perdida.facturaHasta
          ? String(perdida.facturaDesde)
          : `${perdida.facturaDesde} a ${perdida.facturaHasta}`;
    const entrada = crearEntradaHistorial(
      {
        entidad: 'respaldo',
        entidadId: nombre,
        accion: 'sistema',
        antes: null,
        despues: {
          archivo: nombre,
          documentosPerdidos: textoDialogoPerdida(perdida),
          facturasCliente: rango,
        },
        motivo: 'Restauración de una copia de respaldo',
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
  let carpetaDestino = opciones.carpeta;
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let ultimo: string | null = null;
  let cerrada = false;

  /**
   * Ejecutor de la base en uso.
   *
   * @returns El ejecutor.
   * @throws {ErrorDeNegocio} Si todavía no está disponible.
   */
  const exigirEjecutor = (): EjecutorTransacciones => {
    const ejecutar = opciones.obtenerEjecutor?.() ?? null;
    if (ejecutar === null) {
      throw new ErrorDeNegocio(
        'INESPERADO',
        'El sistema todavía no puede guardar la configuración de respaldos.',
      );
    }
    return ejecutar;
  };

  /**
   * Rechaza la carpeta de datos del negocio.
   *
   * @param carpeta - Carpeta pedida.
   * @throws {ErrorDeNegocio} Si no se debe usar.
   */
  const exigirPermitida = (carpeta: string): void => {
    if (opciones.rutaProhibida?.(carpeta)) {
      throw new ErrorDeNegocio(
        'VALIDACION',
        'Esa carpeta es la de los datos del negocio. Elija otra unidad o carpeta.',
      );
    }
  };

  /**
   * Crea la carpeta y escribe un archivo de prueba.
   *
   * @param carpeta - Carpeta a comprobar.
   * @throws {ErrorDeNegocio} Si no se puede escribir.
   */
  const exigirSePuedeEscribir = (carpeta: string): void => {
    const prueba = join(carpeta, `.escritura-${Date.now()}.tmp`);
    try {
      mkdirSync(carpeta, { recursive: true });
      writeFileSync(prueba, 'ok');
      rmSync(prueba, { force: true });
    } catch {
      rmSync(prueba, { force: true });
      throw new ErrorDeNegocio(
        'VALIDACION',
        `No se puede escribir en «${carpeta}». Compruebe que la unidad esté conectada y que tenga permiso.`,
      );
    }
  };

  /**
   * Indica si la carpeta existe y se puede escribir, sin crearla.
   *
   * @param carpeta - Carpeta a mirar.
   * @returns `true` si está disponible.
   */
  const estaDisponible = (carpeta: string): boolean => {
    try {
      accessSync(carpeta, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  };

  /**
   * Lee una clave de configuración, o `null` si la tabla aún no existe.
   *
   * @param clave - Clave a leer.
   * @returns El valor o `null`.
   */
  const leerConfig = <K extends 'respaldos.externa' | 'respaldos.externa_ultima'>(
    clave: K,
  ): string | null => {
    try {
      const valor = obtenerConfiguracion(opciones.db, clave);
      return valor === null ? null : valor;
    } catch {
      return null;
    }
  };

  const rotar = (): void => {
    const archivos: ArchivoRespaldo[] = readdirSync(carpetaDestino).flatMap((nombre) => {
      const interpretado = interpretarArchivoRespaldo(nombre);
      return interpretado ? [{ nombre, fecha: interpretado.fecha, tipo: interpretado.tipo }] : [];
    });
    for (const nombre of seleccionarRespaldosAEliminar(archivos, ahora(), politica)) {
      rmSync(join(carpetaDestino, nombre), { force: true });
    }
  };

  /**
   * Copia el archivo local a la carpeta externa. Un fallo no se propaga:
   * la copia local ya quedó hecha.
   *
   * @param archivoLocal - Respaldo recién creado.
   * @param momento - Momento de la copia.
   */
  const copiarExterna = (archivoLocal: string, momento: Date): void => {
    const carpeta = leerConfig('respaldos.externa');
    if (carpeta === null || carpeta.trim() === '') {
      return;
    }
    if (yaHayCopiaExternaHoy(leerConfig('respaldos.externa_ultima'), momento)) {
      return;
    }
    try {
      if (!estaDisponible(carpeta)) {
        throw new Error(`La carpeta externa no está disponible: ${carpeta}`);
      }
      const destino = join(carpeta, nombreCopiaDiaria(momento));
      const temporal = `${destino}.tmp`;
      rmSync(temporal, { force: true });
      copyFileSync(archivoLocal, temporal);
      renameSync(temporal, destino);
      exigirEjecutor()((ctx) =>
        guardarConfiguracion(ctx, 'respaldos.externa_ultima', aIsoLocal(momento)),
      );
    } catch (error) {
      opciones.alFallar?.(error);
    }
  };

  const respaldarAhora = (tipo: TipoRespaldo = 'automatica'): string => {
    if (cerrada) {
      throw new ErrorDeNegocio(
        'CONFLICTO',
        'La base ya se cerró para restaurar. Cierre el programa y vuelva a abrirlo.',
      );
    }
    if (!existsSync(carpetaDestino)) {
      mkdirSync(carpetaDestino, { recursive: true });
    }
    const momento = ahora();
    const destino = join(carpetaDestino, nombreArchivoRespaldo(momento, tipo));
    const temporal = `${destino}.tmp`;
    rmSync(temporal, { force: true });
    opciones.db.prepare('VACUUM INTO ?').run(temporal);
    renameSync(temporal, destino);
    ultimo = aIsoLocal(momento);
    rotar();
    if (tipo === 'automatica' || tipo === 'manual') {
      copiarExterna(destino, momento);
    }
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

  /**
   * Estado de la carpeta externa en este momento.
   *
   * @returns Estado para la pantalla.
   */
  const calcularExterna = (): EstadoRespaldos['externa'] => {
    const carpeta = leerConfig('respaldos.externa');
    const escribible = carpeta !== null && carpeta.trim() !== '' && estaDisponible(carpeta);
    return estadoCopiaExterna(
      carpeta,
      leerConfig('respaldos.externa_ultima'),
      escribible,
      'La unidad o la carpeta no está disponible.',
      ahora(),
    );
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
    carpeta: () => carpetaDestino,
    avisoExterna: () => avisoBarraCopiaExterna(calcularExterna()),
    estado(): EstadoRespaldos {
      const externa = calcularExterna();
      return {
        carpeta: carpetaDestino,
        ultimoRespaldo: ultimo,
        copias: listarCopias(carpetaDestino),
        externa,
        avisoExterna: avisoBarraCopiaExterna(externa),
        tieneClaveRecuperacion:
          obtenerConfiguracion(opciones.db, 'auth.hash_clave_recuperacion') !== null,
      };
    },
    cambiarCarpeta(carpeta: string): void {
      const destino = carpeta.trim();
      exigirPermitida(destino);
      exigirSePuedeEscribir(destino);
      exigirEjecutor()((ctx) => guardarConfiguracion(ctx, 'respaldos.carpeta', destino));
      carpetaDestino = destino;
      respaldarAhora('manual');
    },
    cambiarExterna(carpeta: string): void {
      const destino = carpeta.trim();
      exigirPermitida(destino);
      exigirSePuedeEscribir(destino);
      exigirEjecutor()((ctx) => guardarConfiguracion(ctx, 'respaldos.externa', destino));
      respaldarAhora('manual');
    },
    quitarExterna(): void {
      exigirEjecutor()((ctx) => guardarConfiguracion(ctx, 'respaldos.externa', null));
    },
    previsualizar(origen) {
      const preparada = prepararRestauracion(opciones, carpetaDestino, origen, ahora);
      return { nombre: preparada.nombre, fecha: preparada.fecha, perdida: preparada.perdida };
    },
    htmlPerdida(origen) {
      const preparada = prepararRestauracion(opciones, carpetaDestino, origen, ahora);
      return htmlListaPerdida(preparada.perdida, preparada.fecha);
    },
    restaurar(origen, credencial) {
      if (cerrada) {
        throw new ErrorDeNegocio('CONFLICTO', 'La restauración ya está en curso.');
      }
      const rutaBase = opciones.rutaBaseDatos;
      if (rutaBase === undefined || rutaBase === ':memory:') {
        throw new ErrorDeNegocio('VALIDACION', 'No se puede restaurar esta base.');
      }
      const preparada = prepararRestauracion(opciones, carpetaDestino, origen, ahora);
      exigirCredencial(opciones.db, credencial);
      const previa = respaldarAhora('restauracion');
      try {
        opciones.ganchos?.antesDeCerrar?.();
      } catch {
        throw new ErrorDeNegocio(
          'INESPERADO',
          `No se restauró. La base actual no se modificó. Quedó la copia previa a restauración en «${previa}».`,
        );
      }
      try {
        opciones.db.pragma('wal_checkpoint(TRUNCATE)');
      } catch {
        // El cierre deja el archivo consistente si el checkpoint no se pudo hacer.
      }
      opciones.db.close();
      cerrada = true;
      borrarDiario(rutaBase);
      try {
        reemplazarArchivoBase(rutaBase, preparada.ruta, {
          duranteReemplazo: opciones.ganchos?.duranteReemplazo,
        });
      } catch (error) {
        if (error instanceof ErrorDeNegocio) {
          throw new ErrorDeNegocio(
            error.codigo,
            `${error.message} Quedó la copia previa a restauración en «${previa}».`,
          );
        }
        throw mensajeDeReemplazo(error, previa);
      }
      try {
        registrarRestauracion(rutaBase, preparada.nombre, preparada.perdida, ahora());
      } catch (error) {
        opciones.alFallar?.(error);
      }
      opciones.reiniciar?.();
    },
  };
}
