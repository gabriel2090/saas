import { useContext, useEffect, useRef, type ContextType } from 'react';
import { ATAJOS, type IdAtajo } from '../../shared/keymap';
import type { ManejadorCapa, PrioridadCapa } from './capas';
import { normalizarCombinacion } from './combinacion';
import { ContextoAtajos } from './ProveedorAtajos';

/**
 * Acción de un atajo. Devolver `false` significa «no lo manejé».
 */
export type AccionAtajo = () => boolean | void;

/**
 * Opciones de {@link useAtajos}.
 */
export interface OpcionesAtajos {
  /** Prioridad de la capa (por defecto `ventana`). */
  prioridad?: PrioridadCapa;
  /** Si la capa está activa (p. ej. solo en la ventana con el foco). Por defecto `true`. */
  activo?: boolean;
}

/**
 * Obtiene el registro de atajos del contexto.
 *
 * @returns El registro.
 * @throws {Error} Si se usa fuera de `ProveedorAtajos`.
 */
function useRegistroAtajos(): NonNullable<ContextType<typeof ContextoAtajos>> {
  const registro = useContext(ContextoAtajos);
  if (!registro) {
    throw new Error('useAtajos debe usarse dentro de ProveedorAtajos.');
  }
  return registro;
}

/**
 * Registra una capa con combinaciones arbitrarias (se usa para los atajos de
 * los íconos, que vienen de `ATAJOS_PROCESOS`).
 *
 * @param acciones - Combinación (formato keymap) → acción.
 * @param opciones - Prioridad y si está activa.
 */
export function useAtajosPorCombinacion(
  acciones: Readonly<Record<string, AccionAtajo>>,
  opciones: OpcionesAtajos = {},
): void {
  const registro = useRegistroAtajos();
  const accionesRef = useRef(acciones);
  const prioridad = opciones.prioridad ?? 'ventana';
  const activo = opciones.activo ?? true;
  const combinaciones = Object.keys(acciones).sort().join('|');

  useEffect(() => {
    accionesRef.current = acciones;
  });

  useEffect(() => {
    if (!activo || combinaciones === '') {
      return undefined;
    }
    const manejadores = new Map<string, ManejadorCapa>();
    for (const combinacion of combinaciones.split('|')) {
      manejadores.set(normalizarCombinacion(combinacion), {
        accion: () => accionesRef.current[combinacion]?.(),
        permitirEnCampoTexto: true,
      });
    }
    return registro.registrar(prioridad, manejadores);
  }, [registro, prioridad, activo, combinaciones]);
}

/**
 * Registra acciones para atajos del keymap mientras el componente esté montado.
 *
 * Las acciones se leen siempre en su versión más reciente (no hace falta
 * memorizarlas); la capa solo se vuelve a registrar si cambian los atajos
 * usados, la prioridad o `activo`.
 *
 * @param acciones - Atajo del keymap → acción.
 * @param opciones - Prioridad y si está activa.
 *
 * @example
 * useAtajos({ retroceder: () => cerrarDialogo() }, { prioridad: 'modal' });
 */
export function useAtajos(
  acciones: Partial<Readonly<Record<IdAtajo, AccionAtajo>>>,
  opciones: OpcionesAtajos = {},
): void {
  const registro = useRegistroAtajos();
  const accionesRef = useRef(acciones);
  const prioridad = opciones.prioridad ?? 'ventana';
  const activo = opciones.activo ?? true;
  const ids = (Object.keys(acciones) as IdAtajo[]).sort().join('|');

  useEffect(() => {
    accionesRef.current = acciones;
  });

  useEffect(() => {
    if (!activo || ids === '') {
      return undefined;
    }
    const manejadores = new Map<string, ManejadorCapa>();
    for (const id of ids.split('|') as IdAtajo[]) {
      const definicion = ATAJOS[id];
      manejadores.set(normalizarCombinacion(definicion.combinacion), {
        accion: () => accionesRef.current[id]?.(),
        permitirEnCampoTexto: definicion.permitirEnCampoTexto,
      });
    }
    return registro.registrar(prioridad, manejadores);
  }, [registro, prioridad, activo, ids]);
}
