import type { ComponentType } from 'react';
import type { IdProceso } from '../../shared/procesos';
import { CambiarContrasena } from '../pantallas/CambiarContrasena';
import { PendienteFase } from '../pantallas/PendienteFase';

/**
 * Componente que se muestra dentro de la ventana de cada proceso. Los
 * procesos de fases futuras usan {@link PendienteFase} hasta que se entreguen.
 */
const CONTENIDOS: Partial<Record<IdProceso, ComponentType>> = {
  'cambiar-contrasena': CambiarContrasena,
};

/**
 * Devuelve el componente de contenido de un proceso.
 *
 * @param id - Proceso.
 * @returns Componente a mostrar en su ventana.
 */
export function contenidoDeProceso(id: IdProceso): ComponentType {
  return CONTENIDOS[id] ?? PendienteFase;
}
