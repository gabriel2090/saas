import type { GeometriaGuardada, RectRelativo } from '../../shared/interfaz';
import { obtenerProceso, type IdProceso } from '../../shared/procesos';
import { minimoDeProceso, tamanoInicialDeProceso } from './tamanos';
import {
  limitarMinimo,
  organizar,
  ordenDeLectura,
  posicionCascada,
  rectDeRelativa,
  relativaDeRect,
  VISIBLE_MINIMO,
  type Asignacion,
  type DisenoOrganizar,
  type Rect,
  type ResultadoOrganizar,
  type VentanaZona,
} from './zonas';

/**
 * Una ventana interna abierta. Como cada proceso abre una sola instancia
 * (D-04), el id de la ventana es el id del proceso.
 *
 * `x`, `y` y `tamano` son siempre la geometría en estado normal (suelta): se
 * conservan mientras la ventana está maximizada o encajada, y a ellos vuelve
 * al restaurarla.
 */
export interface VentanaAbierta {
  /** Proceso que muestra la ventana. */
  id: IdProceso;
  /** Posición horizontal en píxeles dentro del escritorio (estado normal). */
  x: number;
  /** Posición vertical en píxeles dentro del escritorio (estado normal). */
  y: number;
  /** Tamaño fijado (estado normal), o `null` para que se ajuste a su contenido. */
  tamano: TamanoVentana | null;
  /** Si ocupa todo el escritorio. */
  maximizada: boolean;
  /** Zona en que está encajada (en diezmilésimas del escritorio), o `null` si está suelta. */
  encaje: RectRelativo | null;
  /** Si tiene cambios sin guardar (se pide confirmación al cerrarla). */
  conCambios: boolean;
  /**
   * Trabajo pendiente que se conserva al cerrar (p. ej. los borradores de
   * Facturar, D-89), o `null`. Al cerrar se avisa sin hablar de descartar.
   */
  conservados: AvisoConservados | null;
}

/**
 * Aviso de una ventana con trabajo pendiente que no se pierde al cerrarla.
 */
export interface AvisoConservados {
  /** Texto corto para la barra de título, p. ej. «2 borradores pendientes». */
  resumen: string;
  /** Mensaje de la confirmación al cerrar. */
  mensaje: string;
}

/**
 * Tamaño de una ventana interna en píxeles.
 */
export interface TamanoVentana {
  /** Ancho. */
  ancho: number;
  /** Alto. */
  alto: number;
}

/**
 * Estado del gestor. El orden del arreglo es el orden de apilado: la última
 * ventana es la que está al frente y es la activa.
 */
export interface EstadoVentanas {
  /** Ventanas abiertas, de la de más atrás a la del frente. */
  ventanas: readonly VentanaAbierta[];
  /** Tamaño del escritorio, o `null` mientras no se ha medido. */
  escritorio: TamanoVentana | null;
}

/**
 * Acciones que modifican el estado del gestor.
 */
export type AccionVentanas =
  | {
      tipo: 'abrir';
      id: IdProceso;
      tamano?: TamanoVentana | null;
      guardada?: GeometriaGuardada | null;
    }
  | { tipo: 'enfocar'; id: IdProceso }
  | { tipo: 'cerrar'; id: IdProceso }
  | { tipo: 'cerrarTodas' }
  | { tipo: 'siguiente' }
  | { tipo: 'mover'; id: IdProceso; x: number; y: number }
  | { tipo: 'redimensionar'; id: IdProceso; rect: Rect }
  | { tipo: 'maximizar'; id: IdProceso }
  | { tipo: 'encajar'; id: IdProceso; rect: Rect }
  | { tipo: 'organizar'; diseno: DisenoOrganizar }
  | { tipo: 'restablecer'; id: IdProceso }
  | { tipo: 'restablecerTodas' }
  | { tipo: 'escritorio'; tamano: TamanoVentana }
  | { tipo: 'marcarCambios'; id: IdProceso; conCambios: boolean }
  | { tipo: 'marcarConservados'; id: IdProceso; aviso: AvisoConservados | null };

/**
 * Estado inicial: sin ventanas abiertas y sin medir el escritorio.
 */
export const ESTADO_INICIAL_VENTANAS: EstadoVentanas = { ventanas: [], escritorio: null };

/**
 * Distancia (píxeles) a la que dos bordes de ventanas encajadas se consideran
 * el mismo borde compartido; absorbe el redondeo de las zonas relativas.
 */
const TOLERANCIA_BORDE = 2;

/**
 * Lleva al frente la ventana indicada.
 *
 * @param ventanas - Ventanas actuales.
 * @param id - Ventana a enfocar.
 * @returns Nuevo arreglo con la ventana al final (o el mismo si ya estaba al frente).
 */
function alFrente(ventanas: readonly VentanaAbierta[], id: IdProceso): readonly VentanaAbierta[] {
  const ventana = ventanas.find((v) => v.id === id);
  if (!ventana || ventanas[ventanas.length - 1] === ventana) {
    return ventanas;
  }
  return [...ventanas.filter((v) => v !== ventana), ventana];
}

/**
 * Cambia una ventana del estado.
 *
 * @param estado - Estado actual.
 * @param id - Ventana a cambiar.
 * @param cambio - Función que devuelve la ventana nueva.
 * @returns Estado nuevo, o el mismo si la ventana no existe.
 */
function cambiarVentana(
  estado: EstadoVentanas,
  id: IdProceso,
  cambio: (v: VentanaAbierta) => VentanaAbierta,
): EstadoVentanas {
  if (!estado.ventanas.some((v) => v.id === id)) {
    return estado;
  }
  return { ...estado, ventanas: estado.ventanas.map((v) => (v.id === id ? cambio(v) : v)) };
}

/**
 * Ajusta la geometría normal de una ventana para que quepa en el escritorio:
 * sin bajar de su mínimo, sin pasar del escritorio y con la barra de título
 * al alcance (D-113).
 *
 * @param v - Ventana.
 * @param escritorio - Tamaño del escritorio, o `null` si no se conoce.
 * @returns La ventana ajustada (la misma si no cambió).
 */
function ajustarAlEscritorio(v: VentanaAbierta, escritorio: TamanoVentana | null): VentanaAbierta {
  if (!escritorio) {
    return v;
  }
  const minimo = limitarMinimo(minimoDeProceso(v.id), escritorio);
  const tamano = v.tamano && {
    ancho: Math.min(escritorio.ancho, Math.max(minimo.ancho, v.tamano.ancho)),
    alto: Math.min(escritorio.alto, Math.max(minimo.alto, v.tamano.alto)),
  };
  const x = Math.max(0, Math.min(v.x, escritorio.ancho - (tamano?.ancho ?? VISIBLE_MINIMO.ancho)));
  const y = Math.max(0, Math.min(v.y, escritorio.alto - (tamano?.alto ?? VISIBLE_MINIMO.alto)));
  const igual =
    x === v.x && y === v.y && tamano?.ancho === v.tamano?.ancho && tamano?.alto === v.tamano?.alto;
  return igual ? v : { ...v, x, y, tamano };
}

/**
 * Rectángulo en pantalla de una ventana: todo el escritorio si está
 * maximizada, su zona si está encajada o su geometría normal.
 *
 * @param v - Ventana.
 * @param escritorio - Tamaño del escritorio, o `null` si no se conoce.
 * @returns El rectángulo; `ancho`/`alto` son `null` si se ajusta a su contenido.
 */
export function rectDeVentana(
  v: VentanaAbierta,
  escritorio: TamanoVentana | null,
): { x: number; y: number; ancho: number | null; alto: number | null } {
  if (escritorio && v.maximizada) {
    return { x: 0, y: 0, ancho: escritorio.ancho, alto: escritorio.alto };
  }
  if (escritorio && v.encaje) {
    return rectDeRelativa(v.encaje, escritorio);
  }
  return { x: v.x, y: v.y, ancho: v.tamano?.ancho ?? null, alto: v.tamano?.alto ?? null };
}

/**
 * Zonas en píxeles de las ventanas encajadas (no maximizadas).
 *
 * @param estado - Estado del gestor.
 * @returns Zona de cada ventana encajada, en orden de apilado; vacío si no se conoce el escritorio.
 */
export function zonasEncajadas(estado: EstadoVentanas): Asignacion[] {
  const escritorio = estado.escritorio;
  if (!escritorio) {
    return [];
  }
  return estado.ventanas.flatMap((v) =>
    v.encaje && !v.maximizada ? [{ id: v.id, rect: rectDeRelativa(v.encaje, escritorio) }] : [],
  );
}

/**
 * Aplica un cambio de tamaño a una ventana encajada y mueve el borde
 * compartido de sus vecinas encajadas, sin bajar del mínimo de ninguna
 * (`DISENO.md` §11.3).
 *
 * @param estado - Estado con el escritorio medido.
 * @param ventana - Ventana encajada que se redimensiona.
 * @param escritorio - Tamaño del escritorio.
 * @param actual - Zona actual de la ventana en píxeles.
 * @param pedido - Rectángulo pedido (ya limitado a su mínimo).
 * @returns Estado nuevo.
 */
function redimensionarEncajada(
  estado: EstadoVentanas,
  ventana: VentanaAbierta,
  escritorio: TamanoVentana,
  actual: Rect,
  pedido: Rect,
): EstadoVentanas {
  const vecinas = zonasEncajadas(estado)
    .filter((a) => a.id !== ventana.id)
    .map((a) => ({
      id: a.id,
      rect: a.rect,
      minimo: limitarMinimo(minimoDeProceso(a.id), escritorio),
    }));
  const cruzaVertical = (r: Rect): boolean =>
    Math.min(r.y + r.alto, actual.y + actual.alto) - Math.max(r.y, actual.y) > 0;
  const cruzaHorizontal = (r: Rect): boolean =>
    Math.min(r.x + r.ancho, actual.x + actual.ancho) - Math.max(r.x, actual.x) > 0;
  const cerca = (a: number, b: number): boolean => Math.abs(a - b) <= TOLERANCIA_BORDE;

  let izquierda = pedido.x;
  let derecha = pedido.x + pedido.ancho;
  let arriba = pedido.y;
  let abajo = pedido.y + pedido.alto;
  const deDerecha = vecinas.filter(
    (n) => cruzaVertical(n.rect) && cerca(n.rect.x, actual.x + actual.ancho),
  );
  const deIzquierda = vecinas.filter(
    (n) => cruzaVertical(n.rect) && cerca(n.rect.x + n.rect.ancho, actual.x),
  );
  const deAbajo = vecinas.filter(
    (n) => cruzaHorizontal(n.rect) && cerca(n.rect.y, actual.y + actual.alto),
  );
  const deArriba = vecinas.filter(
    (n) => cruzaHorizontal(n.rect) && cerca(n.rect.y + n.rect.alto, actual.y),
  );
  // El borde compartido no puede dejar a una vecina por debajo de su mínimo.
  for (const n of deDerecha) {
    derecha = Math.min(derecha, n.rect.x + n.rect.ancho - n.minimo.ancho);
  }
  for (const n of deIzquierda) {
    izquierda = Math.max(izquierda, n.rect.x + n.minimo.ancho);
  }
  for (const n of deAbajo) {
    abajo = Math.min(abajo, n.rect.y + n.rect.alto - n.minimo.alto);
  }
  for (const n of deArriba) {
    arriba = Math.max(arriba, n.rect.y + n.minimo.alto);
  }
  const propia = limitarMinimo(minimoDeProceso(ventana.id), escritorio);
  if (derecha - izquierda < propia.ancho || abajo - arriba < propia.alto) {
    return estado;
  }

  const nuevos = new Map<IdProceso, Rect>([
    [ventana.id, { x: izquierda, y: arriba, ancho: derecha - izquierda, alto: abajo - arriba }],
  ]);
  for (const n of deDerecha) {
    nuevos.set(n.id, { ...n.rect, x: derecha, ancho: n.rect.x + n.rect.ancho - derecha });
  }
  for (const n of deIzquierda) {
    nuevos.set(n.id, { ...n.rect, ancho: izquierda - n.rect.x });
  }
  for (const n of deAbajo) {
    const r = nuevos.get(n.id) ?? n.rect;
    nuevos.set(n.id, { ...r, y: abajo, alto: n.rect.y + n.rect.alto - abajo });
  }
  for (const n of deArriba) {
    nuevos.set(n.id, { ...(nuevos.get(n.id) ?? n.rect), alto: arriba - n.rect.y });
  }
  return {
    ...estado,
    ventanas: estado.ventanas.map((v) => {
      const rect = nuevos.get(v.id);
      return rect ? { ...v, encaje: relativaDeRect(rect, escritorio) } : v;
    }),
  };
}

/**
 * Limita un rectángulo pedido al escritorio y al mínimo del proceso. Si el
 * borde izquierdo (o el superior) se movió, el mínimo se aplica dejando fijo
 * el borde opuesto.
 *
 * @param pedido - Rectángulo pedido.
 * @param anterior - Posición anterior (para saber qué borde se movió).
 * @param anterior.x - Borde izquierdo anterior.
 * @param anterior.y - Borde superior anterior.
 * @param id - Proceso (para su mínimo).
 * @param escritorio - Tamaño del escritorio, o `null`.
 * @returns Rectángulo válido.
 */
function limitarPedido(
  pedido: Rect,
  anterior: { x: number; y: number },
  id: IdProceso,
  escritorio: TamanoVentana | null,
): Rect {
  const minimo = escritorio ? limitarMinimo(minimoDeProceso(id), escritorio) : minimoDeProceso(id);
  let izquierda = Math.round(pedido.x);
  let arriba = Math.round(pedido.y);
  let derecha = Math.round(pedido.x + pedido.ancho);
  let abajo = Math.round(pedido.y + pedido.alto);
  if (escritorio) {
    izquierda = Math.max(0, izquierda);
    arriba = Math.max(0, arriba);
    derecha = Math.min(escritorio.ancho, derecha);
    abajo = Math.min(escritorio.alto, abajo);
  }
  if (derecha - izquierda < minimo.ancho) {
    if (izquierda !== anterior.x) {
      izquierda = derecha - minimo.ancho;
    } else {
      derecha = izquierda + minimo.ancho;
    }
  }
  if (abajo - arriba < minimo.alto) {
    if (arriba !== anterior.y) {
      arriba = abajo - minimo.alto;
    } else {
      abajo = arriba + minimo.alto;
    }
  }
  return { x: izquierda, y: arriba, ancho: derecha - izquierda, alto: abajo - arriba };
}

/**
 * Datos de una ventana para los cálculos de zonas.
 *
 * @param v - Ventana.
 * @returns Ventana con su título, su mínimo y su tamaño actual.
 */
function ventanaZona(v: VentanaAbierta): VentanaZona {
  return {
    id: v.id,
    titulo: obtenerProceso(v.id).titulo,
    minimo: minimoDeProceso(v.id),
    tamanoInicial: v.tamano,
  };
}

/**
 * Calcula cómo quedarían las ventanas con un diseño de «Organizar», sin
 * aplicarlo (el menú lo usa para desactivar las opciones que no caben).
 *
 * @param estado - Estado del gestor.
 * @param diseno - Diseño.
 * @returns Las zonas en orden de uso (la activa primero), o la razón por la que no caben.
 */
export function calcularOrganizacion(
  estado: EstadoVentanas,
  diseno: DisenoOrganizar,
): ResultadoOrganizar {
  if (!estado.escritorio) {
    return { ok: false, razon: 'El escritorio aún no está listo.' };
  }
  return organizar(diseno, estado.escritorio, [...estado.ventanas].reverse().map(ventanaZona));
}

/**
 * Aplica un diseño de «Organizar»: las ventanas ubicadas quedan al frente
 * (la activa encima) y las que no caben, detrás.
 *
 * @param estado - Estado del gestor.
 * @param diseno - Diseño.
 * @returns Estado nuevo, o el mismo si el diseño no cabe.
 */
function aplicarOrganizacion(estado: EstadoVentanas, diseno: DisenoOrganizar): EstadoVentanas {
  const resultado = calcularOrganizacion(estado, diseno);
  const escritorio = estado.escritorio;
  if (!resultado.ok || !escritorio) {
    return estado;
  }
  const porId = new Map(resultado.asignaciones.map((a) => [a.id, a.rect]));
  const ubicar = (v: VentanaAbierta): VentanaAbierta => {
    const rect = porId.get(v.id);
    if (!rect) {
      return v;
    }
    if (diseno === 'cascada') {
      return {
        ...v,
        x: rect.x,
        y: rect.y,
        tamano: v.tamano && { ancho: rect.ancho, alto: rect.alto },
        maximizada: false,
        encaje: null,
      };
    }
    return { ...v, maximizada: false, encaje: relativaDeRect(rect, escritorio) };
  };
  const sobrantes = estado.ventanas.filter((v) => !porId.has(v.id));
  const ubicadas = [...resultado.asignaciones]
    .reverse()
    .flatMap((a) => estado.ventanas.filter((v) => v.id === a.id));
  return { ...estado, ventanas: [...sobrantes, ...ubicadas].map(ubicar) };
}

/**
 * Geometría normal con que abre (o vuelve) una ventana.
 *
 * @param indice - Posición en la cascada.
 * @param tamano - Tamaño inicial, o `null` si se ajusta a su contenido.
 * @returns Posición y tamaño iniciales, suelta y sin maximizar.
 */
function geometriaInicial(
  indice: number,
  tamano: TamanoVentana | null,
): Pick<VentanaAbierta, 'x' | 'y' | 'tamano' | 'maximizada' | 'encaje'> {
  const pos = posicionCascada(indice);
  return { x: pos, y: pos, tamano, maximizada: false, encaje: null };
}

/**
 * Siguiente ventana para Ctrl+F6. Con el escritorio organizado (todas
 * encajadas o maximizadas, al menos dos encajadas) sigue el orden de
 * lectura (D-115); si no, rota la pila: la de más atrás pasa al frente.
 *
 * @param estado - Estado del gestor.
 * @returns Id de la ventana a enfocar, o `null` si no hay a cuál pasar.
 */
function siguienteVentana(estado: EstadoVentanas): IdProceso | null {
  const { ventanas } = estado;
  if (ventanas.length < 2) {
    return null;
  }
  const encajadas = zonasEncajadas(estado);
  const organizado =
    encajadas.length >= 2 && ventanas.every((v) => v.maximizada || v.encaje !== null);
  if (!organizado) {
    return ventanas[0]?.id ?? null;
  }
  const orden = ordenDeLectura(encajadas);
  const activa = ventanas[ventanas.length - 1]?.id;
  const posicion = activa ? orden.indexOf(activa) : -1;
  return orden[(posicion + 1) % orden.length] ?? null;
}

/**
 * Reductor del gestor de ventanas internas (estilo MDI).
 *
 * @param estado - Estado actual.
 * @param accion - Acción a aplicar.
 * @returns Estado nuevo (o el mismo objeto si no hubo cambios).
 *
 * @example
 * let e = reducirVentanas(ESTADO_INICIAL_VENTANAS, { tipo: 'abrir', id: 'productos' });
 * e = reducirVentanas(e, { tipo: 'abrir', id: 'clientes' });   // clientes al frente
 * e = reducirVentanas(e, { tipo: 'abrir', id: 'productos' });  // no duplica: trae productos al frente
 */
export function reducirVentanas(estado: EstadoVentanas, accion: AccionVentanas): EstadoVentanas {
  switch (accion.tipo) {
    case 'abrir': {
      if (estado.ventanas.some((v) => v.id === accion.id)) {
        return { ...estado, ventanas: alFrente(estado.ventanas, accion.id) };
      }
      const g = accion.guardada;
      const base: VentanaAbierta = {
        id: accion.id,
        ...geometriaInicial(estado.ventanas.length, accion.tamano ?? null),
        conCambios: false,
        conservados: null,
      };
      const nueva: VentanaAbierta = g
        ? {
            ...base,
            x: g.x,
            y: g.y,
            tamano: g.ancho !== null && g.alto !== null ? { ancho: g.ancho, alto: g.alto } : null,
            maximizada: g.maximizada,
            encaje: g.encaje,
          }
        : base;
      return {
        ...estado,
        ventanas: [...estado.ventanas, ajustarAlEscritorio(nueva, estado.escritorio)],
      };
    }
    case 'enfocar': {
      const ventanas = alFrente(estado.ventanas, accion.id);
      return ventanas === estado.ventanas ? estado : { ...estado, ventanas };
    }
    case 'cerrar': {
      if (!estado.ventanas.some((v) => v.id === accion.id)) {
        return estado;
      }
      return { ...estado, ventanas: estado.ventanas.filter((v) => v.id !== accion.id) };
    }
    case 'cerrarTodas':
      return estado.ventanas.length === 0 ? estado : { ...estado, ventanas: [] };
    case 'siguiente': {
      const id = siguienteVentana(estado);
      return id ? { ...estado, ventanas: alFrente(estado.ventanas, id) } : estado;
    }
    case 'mover':
      // Arrastrar por el título suelta la ventana: vuelve a su tamaño normal (§11.2).
      return cambiarVentana(estado, accion.id, (v) =>
        ajustarAlEscritorio(
          {
            ...v,
            x: Math.max(0, Math.round(accion.x)),
            y: Math.max(0, Math.round(accion.y)),
            maximizada: false,
            encaje: null,
          },
          estado.escritorio,
        ),
      );
    case 'redimensionar': {
      const ventana = estado.ventanas.find((v) => v.id === accion.id);
      if (!ventana || (ventana.maximizada && estado.escritorio)) {
        return estado;
      }
      const escritorio = estado.escritorio;
      if (escritorio && ventana.encaje) {
        const actual = rectDeRelativa(ventana.encaje, escritorio);
        const pedido = limitarPedido(accion.rect, actual, ventana.id, escritorio);
        return redimensionarEncajada(estado, ventana, escritorio, actual, pedido);
      }
      const rect = limitarPedido(accion.rect, ventana, ventana.id, escritorio);
      return cambiarVentana(estado, accion.id, (v) => ({
        ...v,
        x: rect.x,
        y: rect.y,
        tamano: { ancho: rect.ancho, alto: rect.alto },
      }));
    }
    case 'maximizar':
      return cambiarVentana(estado, accion.id, (v) => ({ ...v, maximizada: !v.maximizada }));
    case 'encajar': {
      const escritorio = estado.escritorio;
      if (!escritorio) {
        return estado;
      }
      return cambiarVentana(estado, accion.id, (v) => ({
        ...v,
        maximizada: false,
        encaje: relativaDeRect(accion.rect, escritorio),
      }));
    }
    case 'organizar':
      return aplicarOrganizacion(estado, accion.diseno);
    case 'restablecer': {
      const indice = estado.ventanas.findIndex((v) => v.id === accion.id);
      return cambiarVentana(estado, accion.id, (v) =>
        ajustarAlEscritorio(
          { ...v, ...geometriaInicial(indice, tamanoInicialDeProceso(v.id)) },
          estado.escritorio,
        ),
      );
    }
    case 'restablecerTodas':
      if (estado.ventanas.length === 0) {
        return estado;
      }
      return {
        ...estado,
        ventanas: estado.ventanas.map((v, indice) =>
          ajustarAlEscritorio(
            { ...v, ...geometriaInicial(indice, tamanoInicialDeProceso(v.id)) },
            estado.escritorio,
          ),
        ),
      };
    case 'escritorio': {
      const tamano = {
        ancho: Math.max(0, Math.round(accion.tamano.ancho)),
        alto: Math.max(0, Math.round(accion.tamano.alto)),
      };
      if (estado.escritorio?.ancho === tamano.ancho && estado.escritorio.alto === tamano.alto) {
        return estado;
      }
      // Las encajadas siguen su zona relativa sin tocarlas; las sueltas se ajustan para seguir visibles.
      return {
        escritorio: tamano,
        ventanas: estado.ventanas.map((v) => ajustarAlEscritorio(v, tamano)),
      };
    }
    case 'marcarCambios': {
      const ventana = estado.ventanas.find((v) => v.id === accion.id);
      if (!ventana || ventana.conCambios === accion.conCambios) {
        return estado;
      }
      return cambiarVentana(estado, accion.id, (v) => ({ ...v, conCambios: accion.conCambios }));
    }
    case 'marcarConservados': {
      const ventana = estado.ventanas.find((v) => v.id === accion.id);
      if (
        !ventana ||
        (ventana.conservados?.resumen === accion.aviso?.resumen &&
          ventana.conservados?.mensaje === accion.aviso?.mensaje)
      ) {
        return estado;
      }
      return cambiarVentana(estado, accion.id, (v) => ({ ...v, conservados: accion.aviso }));
    }
  }
}

/**
 * Geometría de una ventana tal como se recuerda entre sesiones (D-113).
 *
 * @param v - Ventana.
 * @returns Geometría a guardar.
 */
export function geometriaParaGuardar(v: VentanaAbierta): GeometriaGuardada {
  return {
    x: v.x,
    y: v.y,
    ancho: v.tamano?.ancho ?? null,
    alto: v.tamano?.alto ?? null,
    maximizada: v.maximizada,
    encaje: v.encaje,
  };
}

/**
 * Devuelve la ventana activa (la del frente).
 *
 * @param estado - Estado del gestor.
 * @returns La ventana activa o `null` si no hay ventanas.
 */
export function ventanaActiva(estado: EstadoVentanas): VentanaAbierta | null {
  return estado.ventanas[estado.ventanas.length - 1] ?? null;
}

/**
 * Devuelve las ventanas que tienen cambios sin guardar.
 *
 * @param estado - Estado del gestor.
 * @returns Ventanas con cambios pendientes.
 */
export function ventanasConCambios(estado: EstadoVentanas): VentanaAbierta[] {
  return estado.ventanas.filter((v) => v.conCambios);
}
