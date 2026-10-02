import type { IdProceso } from '../../shared/procesos';

/**
 * Una ventana interna abierta. Como cada proceso abre una sola instancia
 * (D-04), el id de la ventana es el id del proceso.
 */
export interface VentanaAbierta {
  /** Proceso que muestra la ventana. */
  id: IdProceso;
  /** Posición horizontal en píxeles dentro del escritorio. */
  x: number;
  /** Posición vertical en píxeles dentro del escritorio. */
  y: number;
  /** Tamaño fijado, o `null` para que se ajuste a su contenido. */
  tamano: TamanoVentana | null;
  /** Si tiene cambios sin guardar (se pide confirmación al cerrarla). */
  conCambios: boolean;
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
 * Tamaño mínimo al agrandar o achicar una ventana con el asa.
 */
export const TAMANO_MINIMO: TamanoVentana = { ancho: 360, alto: 200 };

/**
 * Estado del gestor. El orden del arreglo es el orden de apilado: la última
 * ventana es la que está al frente y es la activa.
 */
export interface EstadoVentanas {
  /** Ventanas abiertas, de la de más atrás a la del frente. */
  ventanas: readonly VentanaAbierta[];
}

/**
 * Acciones que modifican el estado del gestor.
 */
export type AccionVentanas =
  | { tipo: 'abrir'; id: IdProceso; tamano?: TamanoVentana | null }
  | { tipo: 'enfocar'; id: IdProceso }
  | { tipo: 'cerrar'; id: IdProceso }
  | { tipo: 'cerrarTodas' }
  | { tipo: 'siguiente' }
  | { tipo: 'mover'; id: IdProceso; x: number; y: number }
  | { tipo: 'redimensionar'; id: IdProceso; tamano: TamanoVentana }
  | { tipo: 'marcarCambios'; id: IdProceso; conCambios: boolean };

/**
 * Estado inicial: sin ventanas abiertas.
 */
export const ESTADO_INICIAL_VENTANAS: EstadoVentanas = { ventanas: [] };

/**
 * Desplazamiento entre ventanas nuevas para dejarlas en cascada.
 */
const PASO_CASCADA = 28;

/**
 * Cuántas posiciones de cascada hay antes de volver al inicio.
 */
const POSICIONES_CASCADA = 8;

/**
 * Margen inicial de la primera ventana.
 */
const MARGEN_INICIAL = 16;

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
        return { ventanas: alFrente(estado.ventanas, accion.id) };
      }
      const desplazamiento = (estado.ventanas.length % POSICIONES_CASCADA) * PASO_CASCADA;
      const nueva: VentanaAbierta = {
        id: accion.id,
        x: MARGEN_INICIAL + desplazamiento,
        y: MARGEN_INICIAL + desplazamiento,
        tamano: accion.tamano ?? null,
        conCambios: false,
      };
      return { ventanas: [...estado.ventanas, nueva] };
    }
    case 'enfocar': {
      const ventanas = alFrente(estado.ventanas, accion.id);
      return ventanas === estado.ventanas ? estado : { ventanas };
    }
    case 'cerrar': {
      if (!estado.ventanas.some((v) => v.id === accion.id)) {
        return estado;
      }
      return { ventanas: estado.ventanas.filter((v) => v.id !== accion.id) };
    }
    case 'cerrarTodas':
      return estado.ventanas.length === 0 ? estado : ESTADO_INICIAL_VENTANAS;
    case 'siguiente': {
      // Rota: la ventana de más atrás pasa al frente; repetir recorre todas.
      const [primera, ...resto] = estado.ventanas;
      if (!primera || resto.length === 0) {
        return estado;
      }
      return { ventanas: [...resto, primera] };
    }
    case 'mover':
      return {
        ventanas: estado.ventanas.map((v) =>
          v.id === accion.id ? { ...v, x: Math.max(0, accion.x), y: Math.max(0, accion.y) } : v,
        ),
      };
    case 'redimensionar':
      return {
        ventanas: estado.ventanas.map((v) =>
          v.id === accion.id
            ? {
                ...v,
                tamano: {
                  ancho: Math.max(TAMANO_MINIMO.ancho, Math.round(accion.tamano.ancho)),
                  alto: Math.max(TAMANO_MINIMO.alto, Math.round(accion.tamano.alto)),
                },
              }
            : v,
        ),
      };
    case 'marcarCambios': {
      const ventana = estado.ventanas.find((v) => v.id === accion.id);
      if (!ventana || ventana.conCambios === accion.conCambios) {
        return estado;
      }
      return {
        ventanas: estado.ventanas.map((v) =>
          v === ventana ? { ...v, conCambios: accion.conCambios } : v,
        ),
      };
    }
  }
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
