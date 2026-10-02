import { ESCALA_RELATIVA, type RectRelativo } from '../../shared/interfaz';
import type { IdProceso } from '../../shared/procesos';

/**
 * Tamaño en píxeles.
 */
export interface Tamano {
  /** Ancho. */
  ancho: number;
  /** Alto. */
  alto: number;
}

/**
 * Rectángulo en píxeles, relativo a la esquina superior izquierda del escritorio.
 */
export interface Rect extends Tamano {
  /** Borde izquierdo. */
  x: number;
  /** Borde superior. */
  y: number;
}

/**
 * Diseños del menú «Organizar» (`DISENO.md` §11.3).
 */
export type DisenoOrganizar = 'dos-columnas' | 'tres-columnas' | 'dos-por-dos' | 'cascada';

/**
 * Diseños con celdas (los que se pueden usar al arrastrar o en el asistente).
 */
export type DisenoCeldas = Exclude<DisenoOrganizar, 'cascada'>;

/**
 * Ventana que participa en un cálculo de zonas.
 */
export interface VentanaZona {
  /** Proceso. */
  id: IdProceso;
  /** Título (para explicar por qué no cabe). */
  titulo: string;
  /** Tamaño mínimo del proceso. */
  minimo: Tamano;
  /** Tamaño con que abre (para la cascada); `null` si se ajusta a su contenido. */
  tamanoInicial: Tamano | null;
}

/**
 * Rectángulo asignado a una ventana.
 */
export interface Asignacion {
  /** Proceso. */
  id: IdProceso;
  /** Zona en píxeles. */
  rect: Rect;
}

/**
 * Resultado de organizar: las zonas de cada ventana, o la razón por la que
 * el diseño no cabe (para mostrarla en el menú desactivado).
 */
export type ResultadoOrganizar =
  { ok: true; asignaciones: Asignacion[] } | { ok: false; razon: string };

/**
 * Distancia al borde del escritorio (píxeles) a la que se activa el encaje al arrastrar.
 */
export const MARGEN_ENCAJE = 8;

/**
 * Alto de la franja de las esquinas: cerca del borde lateral y a menos de
 * esta distancia de arriba o de abajo, el encaje es de cuadrante.
 */
export const FRANJA_ESQUINA = 80;

/**
 * Desplazamiento entre ventanas en cascada.
 */
export const PASO_CASCADA = 28;

/**
 * Cuántas posiciones de cascada hay antes de volver al inicio.
 */
export const POSICIONES_CASCADA = 8;

/**
 * Margen de la primera posición de cascada.
 */
export const MARGEN_CASCADA = 16;

/**
 * Lo que debe quedar visible de una ventana suelta para poder agarrarla por el título.
 */
export const VISIBLE_MINIMO: Tamano = { ancho: 80, alto: 30 };

/**
 * Limita un mínimo al escritorio: una ventana nunca es más grande que el
 * escritorio; si su mínimo no cabe, el contenido se desplaza (D-111).
 *
 * @param minimo - Mínimo del proceso.
 * @param escritorio - Tamaño del escritorio.
 * @returns Mínimo efectivo.
 */
export function limitarMinimo(minimo: Tamano, escritorio: Tamano): Tamano {
  return {
    ancho: Math.min(minimo.ancho, escritorio.ancho),
    alto: Math.min(minimo.alto, escritorio.alto),
  };
}

/**
 * Reparte un largo entre varias zonas: empiezan iguales; las que quedan bajo
 * su mínimo crecen hasta él y las demás se achican sin bajar del suyo (D-112).
 *
 * @param total - Largo a repartir (píxeles).
 * @param minimos - Mínimo de cada zona.
 * @returns Largo de cada zona (enteros que suman `total`), o `null` si los mínimos no caben.
 *
 * @example
 * repartir(1366, [760, 560]); // [760, 606]
 * repartir(1366, [760, 700]); // null
 */
export function repartir(total: number, minimos: readonly number[]): number[] | null {
  const suma = minimos.reduce((s, m) => s + m, 0);
  if (minimos.length === 0 || suma > total) {
    return null;
  }
  const fijos = minimos.map(() => false);
  let resto = total;
  let libres = minimos.length;
  let cambio = true;
  // Cada pasada fija las zonas cuyo mínimo supera la parte igual de lo que queda.
  while (cambio && libres > 0) {
    cambio = false;
    const parte = resto / libres;
    minimos.forEach((minimo, i) => {
      if (!fijos[i] && minimo > parte) {
        fijos[i] = true;
        resto -= minimo;
        libres -= 1;
        cambio = true;
      }
    });
  }
  const parte = libres > 0 ? Math.floor(resto / libres) : 0;
  const largos = minimos.map((minimo, i) => (fijos[i] ? minimo : parte));
  // El sobrante del redondeo (o todo lo que sobra si todas quedaron fijas) va a la última zona.
  const sobrante = total - largos.reduce((s, l) => s + l, 0);
  largos[largos.length - 1] = (largos[largos.length - 1] ?? 0) + sobrante;
  return largos;
}

/**
 * Celdas nominales (sin ajustar por mínimos) de un diseño, en diezmilésimas.
 * Con 3 ventanas, «2 × 2» deja la primera en la mitad izquierda (D-114).
 *
 * @param diseno - Diseño con celdas.
 * @param cantidad - Ventanas a ubicar (solo cambia «2 × 2»: 3 o 4).
 * @returns Celdas en el orden en que se llenan.
 */
export function celdasDeDiseno(diseno: DisenoCeldas, cantidad = 4): RectRelativo[] {
  const E = ESCALA_RELATIVA;
  const m = E / 2;
  switch (diseno) {
    case 'dos-columnas':
      return [
        { x: 0, y: 0, ancho: m, alto: E },
        { x: m, y: 0, ancho: m, alto: E },
      ];
    case 'tres-columnas': {
      const t = Math.round(E / 3);
      return [
        { x: 0, y: 0, ancho: t, alto: E },
        { x: t, y: 0, ancho: E - 2 * t, alto: E },
        { x: E - t, y: 0, ancho: t, alto: E },
      ];
    }
    case 'dos-por-dos':
      return cantidad === 3
        ? [
            { x: 0, y: 0, ancho: m, alto: E },
            { x: m, y: 0, ancho: m, alto: m },
            { x: m, y: m, ancho: m, alto: m },
          ]
        : [
            { x: 0, y: 0, ancho: m, alto: m },
            { x: m, y: 0, ancho: m, alto: m },
            { x: 0, y: m, ancho: m, alto: m },
            { x: m, y: m, ancho: m, alto: m },
          ];
  }
}

/**
 * Nombre de una celda para la vista previa, el aviso y el asistente.
 */
export interface NombreCelda {
  /** Nombre con mayúscula inicial, p. ej. «Mitad izquierda». */
  nombre: string;
  /** Nombre con su artículo, para usarlo en una frase: «la mitad izquierda». */
  conArticulo: string;
}

/**
 * Devuelve el nombre de una celda de un diseño.
 *
 * @param diseno - Diseño.
 * @param indice - Celda (orden de {@link celdasDeDiseno} con 4 ventanas).
 * @returns Nombre y nombre con artículo.
 *
 * @example
 * nombreCelda('tres-columnas', 1); // { nombre: 'Columna del centro', conArticulo: 'la columna del centro' }
 */
export function nombreCelda(diseno: DisenoCeldas, indice: number): NombreCelda {
  const nombres: Record<DisenoCeldas, readonly [string, string][]> = {
    'dos-columnas': [
      ['la', 'mitad izquierda'],
      ['la', 'mitad derecha'],
    ],
    'tres-columnas': [
      ['la', 'columna izquierda'],
      ['la', 'columna del centro'],
      ['la', 'columna derecha'],
    ],
    'dos-por-dos': [
      ['el', 'cuadrante superior izquierdo'],
      ['el', 'cuadrante superior derecho'],
      ['el', 'cuadrante inferior izquierdo'],
      ['el', 'cuadrante inferior derecho'],
    ],
  };
  const [articulo, texto] = nombres[diseno][indice] ?? ['la', 'zona'];
  return {
    nombre: texto.charAt(0).toUpperCase() + texto.slice(1),
    conArticulo: `${articulo} ${texto}`,
  };
}

/**
 * Convierte un rectángulo relativo a píxeles del escritorio.
 *
 * @param relativa - Rectángulo en diezmilésimas.
 * @param escritorio - Tamaño del escritorio.
 * @returns Rectángulo en píxeles (bordes redondeados, sin huecos entre zonas vecinas).
 */
export function rectDeRelativa(relativa: RectRelativo, escritorio: Tamano): Rect {
  const x = Math.round((relativa.x * escritorio.ancho) / ESCALA_RELATIVA);
  const y = Math.round((relativa.y * escritorio.alto) / ESCALA_RELATIVA);
  const derecha = Math.round(((relativa.x + relativa.ancho) * escritorio.ancho) / ESCALA_RELATIVA);
  const abajo = Math.round(((relativa.y + relativa.alto) * escritorio.alto) / ESCALA_RELATIVA);
  return { x, y, ancho: derecha - x, alto: abajo - y };
}

/**
 * Convierte un rectángulo en píxeles a diezmilésimas del escritorio.
 *
 * @param rect - Rectángulo en píxeles.
 * @param escritorio - Tamaño del escritorio (no vacío).
 * @returns Rectángulo relativo.
 */
export function relativaDeRect(rect: Rect, escritorio: Tamano): RectRelativo {
  const rx = (v: number): number =>
    Math.round((v * ESCALA_RELATIVA) / Math.max(1, escritorio.ancho));
  const ry = (v: number): number =>
    Math.round((v * ESCALA_RELATIVA) / Math.max(1, escritorio.alto));
  // Se convierten los bordes (no los largos) para que dos vecinas compartan el mismo borde relativo.
  const x = rx(rect.x);
  const y = ry(rect.y);
  return { x, y, ancho: rx(rect.x + rect.ancho) - x, alto: ry(rect.y + rect.alto) - y };
}

/**
 * Posición de la cascada número `indice`.
 *
 * @param indice - Orden de la ventana (0 = la de más atrás).
 * @returns Desplazamiento desde la esquina superior izquierda.
 */
export function posicionCascada(indice: number): number {
  return MARGEN_CASCADA + (indice % POSICIONES_CASCADA) * PASO_CASCADA;
}

/**
 * La ventana cuyo mínimo es el más grande en un eje (para explicar la razón).
 *
 * @param ventanas - Ventanas.
 * @param eje - `ancho` o `alto`.
 * @returns La ventana más exigente.
 */
function masExigente(ventanas: readonly VentanaZona[], eje: keyof Tamano): VentanaZona {
  return ventanas.reduce((a, b) => (b.minimo[eje] > a.minimo[eje] ? b : a));
}

/**
 * Calcula la cascada: cada ventana con su tamaño inicial (o su mínimo si se
 * ajusta a su contenido), sin salirse del escritorio.
 *
 * @param escritorio - Tamaño del escritorio.
 * @param ventanas - Ventanas, la activa primero.
 * @returns Asignaciones; la activa queda en la última posición (al frente).
 */
function cascada(escritorio: Tamano, ventanas: readonly VentanaZona[]): Asignacion[] {
  return ventanas.map((v, k) => {
    const pos = posicionCascada(ventanas.length - 1 - k);
    const minimo = limitarMinimo(v.minimo, escritorio);
    const base = v.tamanoInicial ?? v.minimo;
    const ancho = Math.max(minimo.ancho, Math.min(base.ancho, escritorio.ancho - pos));
    const alto = Math.max(minimo.alto, Math.min(base.alto, escritorio.alto - pos));
    return {
      id: v.id,
      rect: {
        x: Math.max(0, Math.min(pos, escritorio.ancho - ancho)),
        y: Math.max(0, Math.min(pos, escritorio.alto - alto)),
        ancho,
        alto,
      },
    };
  });
}

/**
 * Calcula cómo quedan las ventanas con un diseño de «Organizar» (D-112,
 * D-114). Las ventanas van en orden de uso (la activa primero); si hay más
 * que celdas, solo se ubican las primeras.
 *
 * @param diseno - Diseño elegido.
 * @param escritorio - Tamaño del escritorio.
 * @param ventanas - Ventanas abiertas, la activa primero.
 * @returns Las zonas de cada ventana, o la razón por la que no caben.
 *
 * @example
 * // 1366 px: Facturar (760) y un abono (560) caben ajustados: 760 + 606.
 * organizar('dos-columnas', { ancho: 1366, alto: 634 }, [facturar, abono]);
 */
export function organizar(
  diseno: DisenoOrganizar,
  escritorio: Tamano,
  ventanas: readonly VentanaZona[],
): ResultadoOrganizar {
  if (diseno === 'cascada') {
    return ventanas.length === 0
      ? { ok: false, razon: 'No hay ventanas abiertas.' }
      : { ok: true, asignaciones: cascada(escritorio, ventanas) };
  }
  const necesarias = diseno === 'dos-columnas' ? 2 : 3;
  if (ventanas.length < necesarias) {
    return { ok: false, razon: `Necesita al menos ${necesarias} ventanas abiertas.` };
  }
  const columnas = diseno === 'tres-columnas' ? 3 : 2;
  const cantidad =
    diseno === 'dos-columnas' ? 2 : diseno === 'tres-columnas' ? 3 : Math.min(4, ventanas.length);
  const usadas = ventanas.slice(0, cantidad);
  const minimos = usadas.map((v) => ({ ...v, minimo: limitarMinimo(v.minimo, escritorio) }));
  const [m0, m1, m2, m3] = minimos.map((v) => v.minimo);

  const razonColumnas = (): ResultadoOrganizar => {
    const v = masExigente(minimos, 'ancho');
    return {
      ok: false,
      razon: `No caben: cada columna mediría ${Math.floor(escritorio.ancho / columnas)} px y ${v.titulo} necesita ${v.minimo.ancho}.`,
    };
  };
  const razonFilas = (candidatas: readonly VentanaZona[]): ResultadoOrganizar => {
    const v = masExigente(candidatas, 'alto');
    return {
      ok: false,
      razon: `No caben: cada fila mediría ${Math.floor(escritorio.alto / 2)} px y ${v.titulo} necesita ${v.minimo.alto} de alto.`,
    };
  };

  if (diseno !== 'dos-por-dos') {
    const anchos = repartir(
      escritorio.ancho,
      minimos.map((v) => v.minimo.ancho),
    );
    if (!anchos) {
      return razonColumnas();
    }
    let x = 0;
    return {
      ok: true,
      asignaciones: usadas.map((v, i) => {
        const ancho = anchos[i] ?? 0;
        const rect = { x, y: 0, ancho, alto: escritorio.alto };
        x += ancho;
        return { id: v.id, rect };
      }),
    };
  }

  if (!m0 || !m1 || !m2) {
    return { ok: false, razon: 'Necesita al menos 3 ventanas abiertas.' };
  }
  const anchos = repartir(escritorio.ancho, [
    m3 ? Math.max(m0.ancho, m2.ancho) : m0.ancho,
    m3 ? Math.max(m1.ancho, m3.ancho) : Math.max(m1.ancho, m2.ancho),
  ]);
  if (!anchos) {
    return razonColumnas();
  }
  const [anchoIzq = 0, anchoDer = 0] = anchos;
  const altos = m3
    ? repartir(escritorio.alto, [Math.max(m0.alto, m1.alto), Math.max(m2.alto, m3.alto)])
    : repartir(escritorio.alto, [m1.alto, m2.alto]);
  if (!altos) {
    return razonFilas(m3 ? minimos : minimos.slice(1));
  }
  const [altoArriba = 0, altoAbajo = 0] = altos;
  const zonas: Rect[] = m3
    ? [
        { x: 0, y: 0, ancho: anchoIzq, alto: altoArriba },
        { x: anchoIzq, y: 0, ancho: anchoDer, alto: altoArriba },
        { x: 0, y: altoArriba, ancho: anchoIzq, alto: altoAbajo },
        { x: anchoIzq, y: altoArriba, ancho: anchoDer, alto: altoAbajo },
      ]
    : [
        { x: 0, y: 0, ancho: anchoIzq, alto: escritorio.alto },
        { x: anchoIzq, y: 0, ancho: anchoDer, alto: altoArriba },
        { x: anchoIzq, y: altoArriba, ancho: anchoDer, alto: altoAbajo },
      ];
  return {
    ok: true,
    asignaciones: zonas.flatMap((rect, i) => {
      const v = usadas[i];
      return v ? [{ id: v.id, rect }] : [];
    }),
  };
}

/**
 * Zona propuesta al arrastrar una ventana cerca de un borde.
 */
export interface ZonaArrastre {
  /** Qué se hará al soltar. */
  tipo: 'mitad' | 'cuadrante' | 'maximizar';
  /** Diseño al que pertenece la zona (para el asistente), si no es maximizar. */
  diseno: DisenoCeldas | null;
  /** Celda dentro del diseño. */
  indice: number;
  /** Zona en diezmilésimas. */
  relativa: RectRelativo;
  /** Nombre de la zona («Mitad izquierda»…). */
  etiqueta: string;
}

/**
 * Decide la zona de encaje según dónde está el puntero al arrastrar: borde
 * izquierdo o derecho = mitad; esquinas = cuadrante; borde superior =
 * maximizar (`DISENO.md` §11.3).
 *
 * @param punto - Puntero relativo al escritorio.
 * @param punto.x - Posición horizontal.
 * @param punto.y - Posición vertical.
 * @param escritorio - Tamaño del escritorio.
 * @returns La zona, o `null` si el puntero no está cerca de un borde.
 */
export function zonaDeArrastre(
  punto: { x: number; y: number },
  escritorio: Tamano,
): ZonaArrastre | null {
  const izquierda = punto.x <= MARGEN_ENCAJE;
  const derecha = punto.x >= escritorio.ancho - MARGEN_ENCAJE;
  const arriba = punto.y <= MARGEN_ENCAJE;
  if (izquierda || derecha) {
    const lado = izquierda ? 0 : 1;
    if (punto.y <= FRANJA_ESQUINA || punto.y >= escritorio.alto - FRANJA_ESQUINA) {
      const abajo = punto.y > FRANJA_ESQUINA ? 1 : 0;
      const indice = abajo * 2 + lado;
      return {
        tipo: 'cuadrante',
        diseno: 'dos-por-dos',
        indice,
        relativa: celdasDeDiseno('dos-por-dos', 4)[indice] ?? { x: 0, y: 0, ancho: 0, alto: 0 },
        etiqueta: nombreCelda('dos-por-dos', indice).nombre,
      };
    }
    return {
      tipo: 'mitad',
      diseno: 'dos-columnas',
      indice: lado,
      relativa: celdasDeDiseno('dos-columnas')[lado] ?? { x: 0, y: 0, ancho: 0, alto: 0 },
      etiqueta: nombreCelda('dos-columnas', lado).nombre,
    };
  }
  if (arriba) {
    return {
      tipo: 'maximizar',
      diseno: null,
      indice: 0,
      relativa: { x: 0, y: 0, ancho: ESCALA_RELATIVA, alto: ESCALA_RELATIVA },
      etiqueta: 'Maximizar',
    };
  }
  return null;
}

/**
 * Resultado de ajustar una zona al mínimo de la ventana.
 */
export interface ZonaAjustada {
  /** Zona final en píxeles. */
  rect: Rect;
  /** Aviso en ámbar si la zona creció (D-112), o `null`. */
  aviso: string | null;
}

/**
 * Agranda una zona hasta el mínimo de la ventana, creciendo hacia el centro
 * del escritorio (una zona pegada a la derecha crece hacia la izquierda), y
 * explica cómo quedará (D-112).
 *
 * @param zona - Zona nominal en píxeles.
 * @param minimo - Mínimo del proceso.
 * @param escritorio - Tamaño del escritorio.
 * @param titulo - Título de la ventana.
 * @param etiqueta - Nombre de la zona («Mitad izquierda»…), para el aviso.
 * @returns La zona ajustada y el aviso.
 *
 * @example
 * // «La mitad izquierda mide 683 px y Facturar necesita al menos 760 px de ancho: quedará de 760 px y lo demás, de 606 px.»
 * ajustarZona({ x: 0, y: 0, ancho: 683, alto: 634 }, { ancho: 760, alto: 480 }, { ancho: 1366, alto: 634 }, 'Facturar', 'Mitad izquierda');
 */
export function ajustarZona(
  zona: Rect,
  minimo: Tamano,
  escritorio: Tamano,
  titulo: string,
  etiqueta: string,
): ZonaAjustada {
  const m = limitarMinimo(minimo, escritorio);
  const rect = { ...zona };
  const partes: string[] = [];
  if (rect.ancho < m.ancho) {
    partes.push(
      `${etiqueta} mide ${zona.ancho} px y ${titulo} necesita al menos ${m.ancho} px de ancho: quedará de ${m.ancho} px y lo demás, de ${escritorio.ancho - m.ancho} px`,
    );
    const pegadaDerecha = zona.x + zona.ancho >= escritorio.ancho && zona.x > 0;
    rect.ancho = m.ancho;
    rect.x = pegadaDerecha
      ? escritorio.ancho - m.ancho
      : Math.min(zona.x, escritorio.ancho - m.ancho);
  }
  if (rect.alto < m.alto) {
    partes.push(
      `${etiqueta} mide ${zona.alto} px de alto y ${titulo} necesita al menos ${m.alto} px: quedará de ${m.alto} px`,
    );
    const pegadaAbajo = zona.y + zona.alto >= escritorio.alto && zona.y > 0;
    rect.alto = m.alto;
    rect.y = pegadaAbajo ? escritorio.alto - m.alto : Math.min(zona.y, escritorio.alto - m.alto);
  }
  return { rect, aviso: partes.length > 0 ? `${partes.join('. ')}.` : null };
}

/**
 * Área común de dos rectángulos.
 *
 * @param a - Primer rectángulo.
 * @param b - Segundo rectángulo.
 * @returns Área de la intersección (0 si no se tocan).
 */
function areaComun(a: Rect, b: Rect): number {
  const ancho = Math.min(a.x + a.ancho, b.x + b.ancho) - Math.max(a.x, b.x);
  const alto = Math.min(a.y + a.alto, b.y + b.alto) - Math.max(a.y, b.y);
  return ancho > 0 && alto > 0 ? ancho * alto : 0;
}

/**
 * Recorta una zona para que no tape las ventanas encajadas que la invaden
 * por un lado (p. ej. la mitad derecha cuando Facturar creció a 760 px).
 *
 * @param zona - Zona nominal.
 * @param ocupadas - Zonas de las ventanas ya encajadas.
 * @returns Zona recortada.
 */
export function recortarZona(zona: Rect, ocupadas: readonly Rect[]): Rect {
  let izquierda = zona.x;
  let derecha = zona.x + zona.ancho;
  let arriba = zona.y;
  let abajo = zona.y + zona.alto;
  for (const o of ocupadas) {
    if (
      areaComun(
        { x: izquierda, y: arriba, ancho: derecha - izquierda, alto: abajo - arriba },
        o,
      ) === 0
    ) {
      continue;
    }
    const cubreAlto = o.y <= arriba && o.y + o.alto >= abajo;
    const cubreAncho = o.x <= izquierda && o.x + o.ancho >= derecha;
    if (cubreAlto) {
      if (o.x + o.ancho / 2 < (izquierda + derecha) / 2) {
        izquierda = Math.max(izquierda, o.x + o.ancho);
      } else {
        derecha = Math.min(derecha, o.x);
      }
    } else if (cubreAncho) {
      if (o.y + o.alto / 2 < (arriba + abajo) / 2) {
        arriba = Math.max(arriba, o.y + o.alto);
      } else {
        abajo = Math.min(abajo, o.y);
      }
    }
  }
  return {
    x: izquierda,
    y: arriba,
    ancho: Math.max(0, derecha - izquierda),
    alto: Math.max(0, abajo - arriba),
  };
}

/**
 * Busca la primera celda de un diseño que ninguna ventana encajada ocupa
 * (más de la mitad cubierta cuenta como ocupada), para el asistente de encaje.
 *
 * @param diseno - Diseño de la celda que se acaba de llenar.
 * @param escritorio - Tamaño del escritorio.
 * @param ocupadas - Zonas de las ventanas encajadas.
 * @returns La celda libre (recortada para no tapar a las vecinas) y su índice, o `null`.
 */
export function celdaLibre(
  diseno: DisenoCeldas,
  escritorio: Tamano,
  ocupadas: readonly Rect[],
): { indice: number; rect: Rect } | null {
  const celdas = celdasDeDiseno(diseno, 4);
  for (const [indice, relativa] of celdas.entries()) {
    const celda = rectDeRelativa(relativa, escritorio);
    const cubierta = ocupadas.some((o) => areaComun(celda, o) * 2 > celda.ancho * celda.alto);
    if (!cubierta) {
      const rect = recortarZona(celda, ocupadas);
      if (rect.ancho > 0 && rect.alto > 0) {
        return { indice, rect };
      }
    }
  }
  return null;
}

/**
 * Ordena ventanas en orden de lectura: por filas de arriba abajo y, en cada
 * fila, de izquierda a derecha (Ctrl+F6 con el escritorio organizado, D-115).
 *
 * @param asignaciones - Ventanas con su zona.
 * @returns Ids en orden de lectura.
 */
export function ordenDeLectura(asignaciones: readonly Asignacion[]): IdProceso[] {
  // Dos ventanas cuyo borde superior difiere menos que esto están en la misma fila.
  const tolerancia = 40;
  return [...asignaciones]
    .sort((a, b) =>
      Math.abs(a.rect.y - b.rect.y) < tolerancia ? a.rect.x - b.rect.x : a.rect.y - b.rect.y,
    )
    .map((a) => a.id);
}
