import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { obtenerProceso, type IdProceso } from '../../shared/procesos';
import { useConfirmar } from '../componentes/Dialogos';
import { tamanoInicialDeProceso } from './tamanos';
import {
  ESTADO_INICIAL_VENTANAS,
  reducirVentanas,
  ventanasConCambios,
  type AvisoConservados,
  type EstadoVentanas,
  type TamanoVentana,
} from './gestor';

/**
 * Operaciones disponibles sobre las ventanas internas.
 */
export interface ApiVentanas {
  /** Estado actual del gestor. */
  estado: EstadoVentanas;
  /**
   * Abre un proceso (o trae al frente su ventana si ya está abierta).
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
   * Mueve una ventana.
   *
   * @param id - Ventana a mover.
   * @param x - Nueva posición horizontal.
   * @param y - Nueva posición vertical.
   */
  mover: (id: IdProceso, x: number, y: number) => void;
  /**
   * Cambia el tamaño de una ventana (asa de la esquina inferior derecha).
   *
   * @param id - Ventana a redimensionar.
   * @param tamano - Tamaño nuevo.
   */
  redimensionar: (id: IdProceso, tamano: TamanoVentana) => void;
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
 * Provee el gestor de ventanas internas con las confirmaciones de cierre:
 * cerrar una ventana siempre pregunta, y con más énfasis si tiene cambios
 * sin guardar (§10).
 *
 * @param props - Propiedades del componente.
 * @returns El proveedor.
 */
export function ProveedorVentanas({ children }: PropiedadesProveedorVentanas): ReactNode {
  const [estado, despachar] = useReducer(reducirVentanas, ESTADO_INICIAL_VENTANAS);
  const confirmar = useConfirmar();
  // Las confirmaciones son asíncronas: se lee el estado más reciente al responder.
  const estadoRef = useRef(estado);
  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);

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
    [confirmar],
  );

  const solicitarCerrarTodas = useCallback(async (): Promise<boolean> => {
    const actual = estadoRef.current;
    if (actual.ventanas.length === 0) {
      return true;
    }
    const pendientes = ventanasConCambios(actual).map((v) => `«${obtenerProceso(v.id).titulo}»`);
    const conservados = actual.ventanas
      .flatMap((v) => (v.conservados ? [v.conservados.mensaje] : []))
      .join(' ');
    const aceptado = await confirmar(
      pendientes.length > 0
        ? {
            titulo: 'Cambios sin guardar',
            mensaje: `Hay cambios sin guardar en ${pendientes.join(', ')}. ¿Desea cerrar todas las ventanas y descartarlos?${conservados ? ` ${conservados}` : ''}`,
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
  }, [confirmar]);

  const api = useMemo<ApiVentanas>(
    () => ({
      estado,
      abrir: (id) => despachar({ tipo: 'abrir', id, tamano: tamanoInicialDeProceso(id) }),
      enfocar: (id) => despachar({ tipo: 'enfocar', id }),
      siguiente: () => despachar({ tipo: 'siguiente' }),
      mover: (id, x, y) => despachar({ tipo: 'mover', id, x, y }),
      redimensionar: (id, tamano) => despachar({ tipo: 'redimensionar', id, tamano }),
      marcarCambios: (id, conCambios) => despachar({ tipo: 'marcarCambios', id, conCambios }),
      marcarConservados: (id, aviso) => despachar({ tipo: 'marcarConservados', id, aviso }),
      solicitarCerrar,
      solicitarCerrarTodas,
    }),
    [estado, solicitarCerrar, solicitarCerrarTodas],
  );

  return <ContextoVentanas.Provider value={api}>{children}</ContextoVentanas.Provider>;
}
