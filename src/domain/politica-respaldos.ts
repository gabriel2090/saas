/**
 * Tipos de copia de respaldo (D-179).
 */
export const TIPOS_RESPALDO = ['automatica', 'manual', 'migracion', 'restauracion'] as const;

/**
 * Tipo de una copia de respaldo.
 */
export type TipoRespaldo = (typeof TIPOS_RESPALDO)[number];

/**
 * Nombre visible de cada tipo.
 */
export const NOMBRE_TIPO_RESPALDO: Readonly<Record<TipoRespaldo, string>> = {
  automatica: 'Automática',
  manual: 'Manual',
  migracion: 'Previa a migración',
  restauracion: 'Previa a restauración',
};

/**
 * Tipos que la rotación no borra antes de 30 días (D-179).
 */
export const TIPOS_PROTEGIDOS: ReadonlySet<TipoRespaldo> = new Set([
  'manual',
  'migracion',
  'restauracion',
]);

/**
 * Un archivo de respaldo con su fecha y tipo.
 */
export interface ArchivoRespaldo {
  /** Nombre del archivo. */
  nombre: string;
  /** Momento en que se creó la copia. */
  fecha: Date;
  /** Tipo de copia. */
  tipo: TipoRespaldo;
}

/**
 * Documento que se perdería al restaurar una copia (ventana Respaldos, D-175).
 */
export interface DocumentoPerdido {
  /** Tipo legible, p. ej. «Factura de cliente». */
  tipo: string;
  /** Número o clave del documento. */
  documento: string;
  /** Momento ISO. */
  momento: string;
  /** Resumen corto (tercero, valor…). */
  resumen: string;
}

/**
 * Resumen de lo que se perdería al restaurar una copia.
 */
export interface PerdidaAlRestaurar {
  /** Cantidad total de documentos posteriores a la copia. */
  total: number;
  /** Primer número de factura de cliente perdido, o `null`. */
  facturaDesde: number | null;
  /** Último número de factura de cliente perdido, o `null`. */
  facturaHasta: number | null;
  /** Lista para el PDF y el diálogo. */
  documentos: DocumentoPerdido[];
}

/**
 * Estado de la carpeta de copia externa (D-175).
 */
export type EstadoCopiaExterna =
  | { estado: 'sin_configurar' }
  | { estado: 'ok'; carpeta: string; ultimaCopia: string }
  | { estado: 'no_disponible'; carpeta: string; ultimaCopia: string | null; motivo: string }
  | { estado: 'atrasada'; carpeta: string; ultimaCopia: string; diasSinEscribir: number };

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
  /**
   * Días durante los que las copias protegidas (manual, migración, restauración)
   * no se eliminan por rotación (D-179).
   */
  diasProteccionEspecial: number;
}

/**
 * Política acordada: últimas 20 copias, una por hora de las últimas 48 horas
 * y una diaria de los últimos 30 días; las especiales se protegen 30 días.
 */
export const POLITICA_RETENCION_POR_DEFECTO: PoliticaRetencion = {
  ultimasCopias: 20,
  horasConCopiaHoraria: 48,
  diasConCopiaDiaria: 30,
  diasProteccionEspecial: 30,
};

/**
 * Días de atraso de la copia externa a partir de los cuales la barra de estado
 * muestra el aviso (D-175).
 */
export const DIAS_AVISO_COPIA_EXTERNA = 2;

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
 * 4. Es manual, previa a migración o previa a restauración y aún no cumple
 *    `diasProteccionEspecial` días (D-179).
 *
 * Los grupos por hora y por día usan la hora local del equipo.
 *
 * @param archivos - Respaldos existentes (en cualquier orden).
 * @param ahora - Momento actual.
 * @param politica - Parámetros de retención.
 * @returns Nombres de los archivos que se deben borrar.
 *
 * @example
 * // Con 25 copias automáticas hechas en el mismo minuto, se conservan las 20
 * // más recientes y se eliminan las 5 más antiguas.
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
  const limiteProteccion = ahora.getTime() - politica.diasProteccionEspecial * 24 * MS_HORA;

  ordenados.forEach((archivo, indice) => {
    if (indice < politica.ultimasCopias) {
      conservar.add(archivo.nombre);
    }
    const tiempo = archivo.fecha.getTime();
    if (TIPOS_PROTEGIDOS.has(archivo.tipo) && tiempo > limiteProteccion) {
      conservar.add(archivo.nombre);
    }
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

/**
 * Arma el texto corto de la pérdida al restaurar, para el diálogo.
 *
 * @param p - Resumen de la pérdida.
 * @returns Texto como «12 documentos (facturas de cliente 84796 a 84807)».
 *
 * @example
 * textoPerdidaAlRestaurar({
 *   total: 12,
 *   facturaDesde: 84796,
 *   facturaHasta: 84807,
 *   documentos: [],
 * });
 * // '12 documentos (facturas de cliente 84796 a 84807)'
 */
export function textoPerdidaAlRestaurar(p: PerdidaAlRestaurar): string {
  if (p.total === 0) {
    return 'ningún documento posterior a esa copia';
  }
  const n = `${p.total} documento${p.total === 1 ? '' : 's'}`;
  if (p.facturaDesde === null || p.facturaHasta === null) {
    return n;
  }
  if (p.facturaDesde === p.facturaHasta) {
    return `${n} (factura de cliente ${p.facturaDesde})`;
  }
  return `${n} (facturas de cliente ${p.facturaDesde} a ${p.facturaHasta})`;
}

/**
 * Calcula el estado de la carpeta de copia externa a partir de la última
 * escritura exitosa y si hoy se puede escribir.
 *
 * @param carpeta - Ruta configurada, o `null` si no hay.
 * @param ultimaCopia - ISO de la última copia externa exitosa, o `null`.
 * @param escribible - Si la carpeta existe y se puede escribir ahora.
 * @param motivoNoDisponible - Motivo si no es escribible.
 * @param ahora - Momento actual.
 * @returns Estado para la pantalla y la barra.
 */
export function estadoCopiaExterna(
  carpeta: string | null,
  ultimaCopia: string | null,
  escribible: boolean,
  motivoNoDisponible: string,
  ahora: Date = new Date(),
): EstadoCopiaExterna {
  if (carpeta === null || carpeta.trim() === '') {
    return { estado: 'sin_configurar' };
  }
  if (!escribible) {
    return {
      estado: 'no_disponible',
      carpeta,
      ultimaCopia,
      motivo: motivoNoDisponible,
    };
  }
  if (ultimaCopia === null) {
    return {
      estado: 'atrasada',
      carpeta,
      ultimaCopia: '',
      diasSinEscribir: DIAS_AVISO_COPIA_EXTERNA,
    };
  }
  const dias = diasEntre(new Date(ultimaCopia), ahora);
  if (dias >= DIAS_AVISO_COPIA_EXTERNA) {
    return { estado: 'atrasada', carpeta, ultimaCopia, diasSinEscribir: dias };
  }
  return { estado: 'ok', carpeta, ultimaCopia };
}

/**
 * Días calendario entre dos fechas locales (0 si son el mismo día).
 *
 * @param desde - Fecha anterior.
 * @param hasta - Fecha posterior.
 * @returns Días enteros no negativos.
 */
export function diasEntre(desde: Date, hasta: Date): number {
  const a = Date.UTC(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const b = Date.UTC(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  return Math.max(0, Math.round((b - a) / (24 * MS_HORA)));
}

/**
 * Indica si hoy ya hay una copia externa del día (no hace falta otra).
 *
 * @param ultimaCopia - ISO de la última copia externa, o `null`.
 * @param ahora - Momento actual.
 * @returns `true` si la última copia es de hoy.
 */
export function yaHayCopiaExternaHoy(ultimaCopia: string | null, ahora: Date = new Date()): boolean {
  if (ultimaCopia === null) return false;
  return diasEntre(new Date(ultimaCopia), ahora) === 0;
}

/**
 * Arma el resumen de pérdida a partir de la lista de documentos.
 *
 * @param documentos - Documentos posteriores a la copia.
 * @returns Resumen con totales y rango de facturas.
 */
export function resumirPerdida(documentos: readonly DocumentoPerdido[]): PerdidaAlRestaurar {
  const facturas = documentos
    .filter((d) => d.tipo === 'Factura de cliente')
    .map((d) => Number(d.documento))
    .filter((n) => Number.isSafeInteger(n));
  return {
    total: documentos.length,
    facturaDesde: facturas.length > 0 ? Math.min(...facturas) : null,
    facturaHasta: facturas.length > 0 ? Math.max(...facturas) : null,
    documentos: [...documentos],
  };
}
