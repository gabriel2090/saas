/**
 * Parámetros de retención de respaldos (D-07).
 */
export interface PoliticaRetencion {
  /** Cuántas copias más recientes se conservan siempre. */
  ultimasCopias: number;
  /** Horas hacia atrás en las que se conserva una copia por hora. */
  horasConCopiaHoraria: number;
  /** Días hacia atrás en los que se conserva una copia por día. */
  diasConCopiaDiaria: number;
}

/**
 * Política acordada: últimas 20 copias, una por hora de las últimas 48 horas
 * y una diaria de los últimos 30 días.
 */
export const POLITICA_RETENCION_POR_DEFECTO: PoliticaRetencion = {
  ultimasCopias: 20,
  horasConCopiaHoraria: 48,
  diasConCopiaDiaria: 30,
};

/**
 * Un archivo de respaldo con su fecha de creación.
 */
export interface ArchivoRespaldo {
  /** Nombre del archivo. */
  nombre: string;
  /** Momento en que se creó la copia. */
  fecha: Date;
}

/**
 * Milisegundos en una hora.
 */
const MS_HORA = 60 * 60 * 1000;

/**
 * Clave de agrupación por hora local (`aaaa-mm-dd hh`).
 *
 * @param fecha - Fecha a agrupar.
 * @returns Clave de la hora.
 */
function claveHora(fecha: Date): string {
  return `${claveDia(fecha)} ${fecha.getHours()}`;
}

/**
 * Clave de agrupación por día local (`aaaa-mm-dd`).
 *
 * @param fecha - Fecha a agrupar.
 * @returns Clave del día.
 */
function claveDia(fecha: Date): string {
  return `${fecha.getFullYear()}-${fecha.getMonth() + 1}-${fecha.getDate()}`;
}

/**
 * Decide qué respaldos se deben eliminar según la política de retención.
 *
 * Se conserva un archivo si cumple **cualquiera** de estas condiciones:
 * 1. Está entre las `ultimasCopias` más recientes.
 * 2. Es la copia más reciente de su hora y tiene menos de `horasConCopiaHoraria` horas.
 * 3. Es la copia más reciente de su día y tiene menos de `diasConCopiaDiaria` días.
 *
 * Los grupos por hora y por día usan la hora local del equipo.
 *
 * @param archivos - Respaldos existentes (en cualquier orden).
 * @param ahora - Momento actual.
 * @param politica - Parámetros de retención.
 * @returns Nombres de los archivos que se deben borrar.
 *
 * @example
 * // Con 25 copias hechas en el mismo minuto, se conservan las 20 más recientes
 * // y se eliminan las 5 más antiguas.
 */
export function seleccionarRespaldosAEliminar(
  archivos: readonly ArchivoRespaldo[],
  ahora: Date,
  politica: PoliticaRetencion = POLITICA_RETENCION_POR_DEFECTO,
): string[] {
  const ordenados = [...archivos].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  const conservar = new Set<string>();
  const horasVistas = new Set<string>();
  const diasVistos = new Set<string>();
  const limiteHoras = ahora.getTime() - politica.horasConCopiaHoraria * MS_HORA;
  const limiteDias = ahora.getTime() - politica.diasConCopiaDiaria * 24 * MS_HORA;

  ordenados.forEach((archivo, indice) => {
    if (indice < politica.ultimasCopias) {
      conservar.add(archivo.nombre);
    }
    const tiempo = archivo.fecha.getTime();
    // Como el recorrido va del más nuevo al más viejo, el primero de cada
    // grupo es la copia más reciente de esa hora o de ese día.
    const hora = claveHora(archivo.fecha);
    if (!horasVistas.has(hora)) {
      horasVistas.add(hora);
      if (tiempo > limiteHoras) {
        conservar.add(archivo.nombre);
      }
    }
    const dia = claveDia(archivo.fecha);
    if (!diasVistos.has(dia)) {
      diasVistos.add(dia);
      if (tiempo > limiteDias) {
        conservar.add(archivo.nombre);
      }
    }
  });

  return ordenados.filter((a) => !conservar.has(a.nombre)).map((a) => a.nombre);
}
