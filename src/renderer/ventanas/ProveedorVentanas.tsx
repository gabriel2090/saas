import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  MODO_BARRA_POR_DEFECTO,
  type GeometriaGuardada,
  type ModoBarra,
} from '../../shared/interfaz';
import { obtenerProceso, type IdProceso } from '../../shared/procesos';
import { useConfirmar } from '../componentes/Dialogos';
import { invocar } from '../servicios/api';
import { tamanoInicialDeProceso } from './tamanos';
import {
  ESTADO_INICIAL_VENTANAS,
  geometriaParaGuardar,
  reducirVentanas,
  ventanasConCambios,
  type AccionVentanas,
  type AvisoConservados,
  type EstadoVentanas,
  type TamanoVentana,
} from './gestor';
import type { DisenoOrganizar, Rect } from './zonas';

/**
 * Pausa antes de guardar la geometría: mover o agrandar una ventana dispara
 * un cambio por cada movimiento del ratón y solo interesa el resultado final.
 */
const PAUSA_GUARDADO_MS = 400;

/**
 * Estado del proveedor: el del gestor y qué ventanas cambió el sistema (no
 * el usuario) en la última acción, cuya geometría no se recuerda: el ajuste
 * a un escritorio más chico no debe pisar el tamaño elegido por el usuario.
 */
interface EstadoProveedor {
  /** Estado del gestor. */
  gestor: EstadoVentanas;
  /** Ventana cuyo cambio no se guarda, `todas`, o `null`. */
  sinGuardar: IdProceso | 'todas' | null;
}

/**
 * Reductor del proveedor: aplica la acción al gestor y anota si el cambio
 * vino del sistema.
 *
 * @param estado - Estado actual.
 * @param accion - Acción del gestor.
 * @returns Estado nuevo (el mismo si el gestor no cambió).
 */
function reducirProveedor(estado: EstadoProveedor, accion: AccionVentanas): EstadoProveedor {
  const gestor = reducirVentanas(estado.gestor, accion);
  if (gestor === estado.gestor) {
    return estado;
  }
  const sinGuardar =
    accion.tipo === 'escritorio' || accion.tipo === 'restablecerTodas'
      ? 'todas'
      : accion.tipo === 'restablecer'
        ? accion.id
        : null;
  return { gestor, sinGuardar };
}

/**
 * Operaciones disponibles sobre las ventanas internas.
 */
export interface ApiVentanas {
  /** Estado actual del gestor. */
  estado: EstadoVentanas;
  /**
   * Abre un proceso (o trae al frente su ventana si ya está abierta), con el
   * tamaño y la posición recordados si los hay (D-113).
   *
   * @param id - Proceso a abrir.
   */
  abrir: (id: IdProceso) => void;
  /**
   * Trae una ventana al frente.
   *
   * @param id - Ventana a enfocar.
   */
  enfocar: (id: IdProceso) => void;
  /** Pasa a la siguiente ventana (Ctrl+F6). */
  siguiente: () => void;
  /**
   * Mueve una ventana (si estaba maximizada o encajada, la suelta).
   *
   * @param id - Ventana a mover.
   * @param x - Nueva posición horizontal.
   * @param y - Nueva posición vertical.
   */
  mover: (id: IdProceso, x: number, y: number) => void;
  /**
   * Cambia el tamaño de una ventana desde un borde o una esquina.
   *
   * @param id - Ventana a redimensionar.
   * @param rect - Rectángulo pedido en píxeles del escritorio.
   */
  redimensionar: (id: IdProceso, rect: Rect) => void;
  /**
   * Maximiza o restaura una ventana.
   *
   * @param id - Ventana.
   */
  maximizar: (id: IdProceso) => void;
  /**
   * Encaja una ventana en una zona del escritorio.
   *
   * @param id - Ventana.
   * @param rect - Zona en píxeles (ya ajustada al mínimo).
   */
  encajar: (id: IdProceso, rect: Rect) => void;
  /**
   * Aplica un diseño de «Organizar».
   *
   * @param diseno - Diseño elegido.
   */
  organizar: (diseno: DisenoOrganizar) => void;
  /**
   * Devuelve una ventana a su tamaño y posición iniciales y olvida los recordados.
   *
   * @param id - Ventana.
   */
  restablecer: (id: IdProceso) => void;
  /** Restablece todas las ventanas y olvida todas las geometrías recordadas. */
  restablecerTodas: () => void;
  /**
   * Informa el tamaño del escritorio (al montar y cada vez que cambia).
   *
   * @param tamano - Tamaño en píxeles.
   */
  ajustarEscritorio: (tamano: TamanoVentana) => void;
  /** Modo de la barra superior (D-108). */
  modoBarra: ModoBarra;
  /**
   * Cambia y recuerda el modo de la barra superior.
   *
   * @param modo - Modo elegido.
   */
  cambiarModoBarra: (modo: ModoBarra) => void;
  /**
   * Marca si una ventana tiene cambios sin guardar.
   *
   * @param id - Ventana.
   * @param conCambios - Si tiene cambios.
   */
  marcarCambios: (id: IdProceso, conCambios: boolean) => void;
  /**
   * Marca el trabajo pendiente que se conserva al cerrar la ventana.
   *
   * @param id - Ventana.
   * @param aviso - Resumen y mensaje de cierre, o `null` si no hay.
   */
  marcarConservados: (id: IdProceso, aviso: AvisoConservados | null) => void;
  /**
   * Pide confirmación y cierra la ventana.
   *
   * @param id - Ventana a cerrar.
   * @returns `true` si se cerró.
   */
  solicitarCerrar: (id: IdProceso) => Promise<boolean>;
  /**
   * Pide confirmación y cierra todas las ventanas (Ctrl+0).
   *
   * @returns `true` si se cerraron (o no había ninguna).
   */
  solicitarCerrarTodas: () => Promise<boolean>;
}

/**
 * Contexto del gestor de ventanas.
 */
const ContextoVentanas = createContext<ApiVentanas | null>(null);

/**
 * Devuelve las operaciones del gestor de ventanas.
 *
 * @returns API del gestor.
 * @throws {Error} Si se usa fuera de `ProveedorVentanas`.
 */
export function useVentanas(): ApiVentanas {
  const api = useContext(ContextoVentanas);
  if (!api) {
    throw new Error('useVentanas debe usarse dentro de ProveedorVentanas.');
  }
  return api;
}

/**
 * Propiedades de {@link ProveedorVentanas}.
 */
interface PropiedadesProveedorVentanas {
  /** Contenido (escritorio y barras). */
  children: ReactNode;
}

/**
 * Provee el gestor de ventanas internas con las confirmaciones de cierre
 * (cerrar una ventana siempre pregunta, y con más énfasis si tiene cambios
 * sin guardar, §10) y recuerda el tamaño y la posición de cada ventana y el
 * modo de la barra entre sesiones (D-108, D-113).
 *
 * @param props - Propiedades del componente.
 * @returns El proveedor.
 */
export function ProveedorVentanas({ children }: PropiedadesProveedorVentanas): ReactNode {
  const [proveedor, despachar] = useReducer(reducirProveedor, {
    gestor: ESTADO_INICIAL_VENTANAS,
    sinGuardar: null,
  });
  const estado = proveedor.gestor;
  const [modoBarra, setModoBarra] = useState<ModoBarra>(MODO_BARRA_POR_DEFECTO);
  const confirmar = useConfirmar();
  // Las confirmaciones son asíncronas: se lee el estado más reciente al responder.
  const estadoRef = useRef(estado);
  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);

  // Geometrías recordadas y la última conocida de cada ventana abierta (en JSON).
  const guardadas = useRef<Partial<Record<IdProceso, GeometriaGuardada>>>({});
  const conocidas = useRef(new Map<IdProceso, string>());
  const pendientes = useRef(new Set<IdProceso>());
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void invocar('interfaz:preferencias', undefined).then((resultado) => {
      if (resultado.ok) {
        guardadas.current = resultado.datos.ventanas;
        setModoBarra(resultado.datos.barra);
      }
    });
  }, []);

  useEffect(() => {
    const { gestor, sinGuardar } = proveedor;
    for (const ventana of gestor.ventanas) {
      const json = JSON.stringify(geometriaParaGuardar(ventana));
      const anterior = conocidas.current.get(ventana.id);
      conocidas.current.set(ventana.id, json);
      if (anterior === undefined || anterior === json) {
        continue;
      }
      if (sinGuardar === 'todas' || sinGuardar === ventana.id) {
        pendientes.current.delete(ventana.id);
      } else {
        pendientes.current.add(ventana.id);
      }
    }
    for (const id of conocidas.current.keys()) {
      if (!gestor.ventanas.some((v) => v.id === id)) {
        conocidas.current.delete(id);
      }
    }
    if (pendientes.current.size === 0) {
      return;
    }
    if (temporizador.current) {
      clearTimeout(temporizador.current);
    }
    temporizador.current = setTimeout(() => {
      temporizador.current = null;
      for (const id of pendientes.current) {
        const ventana = estadoRef.current.ventanas.find((v) => v.id === id);
        if (ventana) {
          const geometria = geometriaParaGuardar(ventana);
          guardadas.current[id] = geometria;
          void invocar('interfaz:guardarVentana', { id, geometria });
        }
      }
      pendientes.current.clear();
    }, PAUSA_GUARDADO_MS);
  }, [proveedor]);

  const ajustarEscritorio = useCallback(
    (tamano: TamanoVentana) => despachar({ tipo: 'escritorio', tamano }),
    [],
  );

  const solicitarCerrar = useCallback(
    async (id: IdProceso): Promise<boolean> => {
      const ventana = estadoRef.current.ventanas.find((v) => v.id === id);
      if (!ventana) {
        return false;
      }
      const titulo = obtenerProceso(id).titulo;
      const aceptado = await confirmar(
        ventana.conCambios
          ? {
              titulo: 'Cambios sin guardar',
              mensaje: `La ventana «${titulo}» tiene cambios sin guardar. ¿Desea cerrarla y descartar los cambios?`,
              peligroso: true,
            }
          : {
              titulo: 'Cerrar ventana',
              mensaje: ventana.conservados
                ? `${ventana.conservados.mensaje} ¿Desea cerrar la ventana «${titulo}»?`
                : `¿Desea cerrar la ventana «${titulo}»?`,
            },
      );
      if (aceptado) {
        despachar({ tipo: 'cerrar', id });
      }
      return aceptado;
    },
    [confirmar, despachar],
  );

  const solicitarCerrarTodas = useCallback(async (): Promise<boolean> => {
    const actual = estadoRef.current;
    if (actual.ventanas.length === 0) {
      return true;
    }
    const conPendientes = ventanasConCambios(actual).map((v) => `«${obtenerProceso(v.id).titulo}»`);
    const conservados = actual.ventanas
      .flatMap((v) => (v.conservados ? [v.conservados.mensaje] : []))
      .join(' ');
    const aceptado = await confirmar(
      conPendientes.length > 0
        ? {
            titulo: 'Cambios sin guardar',
            mensaje: `Hay cambios sin guardar en ${conPendientes.join(', ')}. ¿Desea cerrar todas las ventanas y descartarlos?${conservados ? ` ${conservados}` : ''}`,
            peligroso: true,
          }
        : {
            titulo: 'Cerrar todas las ventanas',
            mensaje: `${conservados ? `${conservados} ` : ''}¿Desea cerrar las ${actual.ventanas.length} ventanas abiertas?`,
          },
    );
    if (aceptado) {
      despachar({ tipo: 'cerrarTodas' });
    }
    return aceptado;
  }, [confirmar, despachar]);

  const api = useMemo<ApiVentanas>(
    () => ({
      estado,
      abrir: (id) =>
        despachar({
          tipo: 'abrir',
          id,
          tamano: tamanoInicialDeProceso(id),
          guardada: guardadas.current[id] ?? null,
        }),
      enfocar: (id) => despachar({ tipo: 'enfocar', id }),
      siguiente: () => despachar({ tipo: 'siguiente' }),
      mover: (id, x, y) => despachar({ tipo: 'mover', id, x, y }),
      redimensionar: (id, rect) => despachar({ tipo: 'redimensionar', id, rect }),
      maximizar: (id) => despachar({ tipo: 'maximizar', id }),
      encajar: (id, rect) => despachar({ tipo: 'encajar', id, rect }),
      organizar: (diseno) => despachar({ tipo: 'organizar', diseno }),
      restablecer: (id) => {
        delete guardadas.current[id];
        pendientes.current.delete(id);
        despachar({ tipo: 'restablecer', id });
        void invocar('interfaz:restablecerVentanas', id);
      },
      restablecerTodas: () => {
        guardadas.current = {};
        pendientes.current.clear();
        despachar({ tipo: 'restablecerTodas' });
        void invocar('interfaz:restablecerVentanas', null);
      },
      ajustarEscritorio,
      modoBarra,
      cambiarModoBarra: (modo) => {
        setModoBarra(modo);
        void invocar('interfaz:guardarBarra', modo);
      },
      marcarCambios: (id, conCambios) => despachar({ tipo: 'marcarCambios', id, conCambios }),
      marcarConservados: (id, aviso) => despachar({ tipo: 'marcarConservados', id, aviso }),
      solicitarCerrar,
      solicitarCerrarTodas,
    }),
    [estado, modoBarra, ajustarEscritorio, solicitarCerrar, solicitarCerrarTodas],
  );

  return <ContextoVentanas.Provider value={api}>{children}</ContextoVentanas.Provider>;
}
