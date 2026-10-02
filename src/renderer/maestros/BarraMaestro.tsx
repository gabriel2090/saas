import type { ReactNode } from 'react';
import { ATAJOS } from '../../shared/keymap';
import { textoCombinacion } from '../atajos/combinacion';

/**
 * Propiedades de {@link BarraMaestro}.
 */
interface PropiedadesBarraMaestro {
  /** Crea un registro nuevo. */
  alNuevo: () => void;
  /** Guarda la ficha. */
  alGuardar: () => void;
  /** Inactiva o reactiva el registro seleccionado. */
  alCambiarEstado: () => void;
  /** Si «Guardar» está disponible. */
  puedeGuardar: boolean;
  /**
   * Estado del registro seleccionado: define si el botón dice «Inactivar» o
   * «Reactivar». `null` deshabilita el botón (nuevo, sin selección o bloqueado).
   */
  activoSeleccionado: boolean | null;
  /** Texto de búsqueda. */
  busqueda: string;
  /** Cambia el texto de búsqueda. */
  alBuscar: (texto: string) => void;
  /** Texto de ayuda del campo de búsqueda. */
  ayudaBusqueda: string;
  /** Si se muestran los inactivos. */
  mostrarInactivos: boolean;
  /** Cambia si se muestran los inactivos. */
  alMostrarInactivos: (mostrar: boolean) => void;
  /** Resumen a la derecha, p. ej. «12 productos · 1 inactivo». */
  resumen: string;
}

/**
 * Barra de herramientas de las ventanas de maestros: Nuevo, Guardar,
 * Inactivar/Reactivar (con su atajo del keymap), búsqueda e inactivos.
 *
 * Los botones no reciben el foco con flechas ni Tab (`tabIndex={-1}`): se
 * usan con su atajo, y así las flechas recorren solo la lista y la ficha.
 *
 * @param props - Propiedades del componente.
 * @returns La barra.
 */
export function BarraMaestro(props: PropiedadesBarraMaestro): ReactNode {
  const reactivar = props.activoSeleccionado === false;
  return (
    <div className="barra-herramientas">
      <button type="button" className="boton" tabIndex={-1} onClick={props.alNuevo}>
        Nuevo<span className="atajo">{textoCombinacion(ATAJOS.nuevoRegistro.combinacion)}</span>
      </button>
      <button
        type="button"
        className="boton boton--primario"
        tabIndex={-1}
        disabled={!props.puedeGuardar}
        onClick={props.alGuardar}
      >
        Guardar
        <span className="atajo">{textoCombinacion(ATAJOS.guardarRegistro.combinacion)}</span>
      </button>
      <button
        type="button"
        className="boton"
        tabIndex={-1}
        disabled={props.activoSeleccionado === null}
        onClick={props.alCambiarEstado}
      >
        {reactivar ? 'Reactivar' : 'Inactivar'}
        <span className="atajo">{textoCombinacion(ATAJOS.cambiarEstadoRegistro.combinacion)}</span>
      </button>
      <span className="barra-herramientas__separador" />
      <input
        className="barra-herramientas__busqueda"
        placeholder={props.ayudaBusqueda}
        value={props.busqueda}
        onChange={(e) => props.alBuscar(e.target.value)}
      />
      <label className="casilla">
        <input
          type="checkbox"
          checked={props.mostrarInactivos}
          onChange={(e) => props.alMostrarInactivos(e.target.checked)}
        />{' '}
        Mostrar inactivos
      </label>
      <span className="barra-herramientas__resumen">{props.resumen}</span>
    </div>
  );
}

/**
 * Arma el resumen de la barra: «12 productos · 1 inactivo».
 *
 * @param total - Registros cargados.
 * @param inactivos - Registros inactivos.
 * @param singular - Nombre en singular.
 * @param plural - Nombre en plural.
 * @returns Texto del resumen.
 */
export function resumenMaestro(
  total: number,
  inactivos: number,
  singular: string,
  plural: string,
): string {
  const base = `${total} ${total === 1 ? singular : plural}`;
  if (inactivos === 0) {
    return base;
  }
  return `${base} · ${inactivos} ${inactivos === 1 ? 'inactivo' : 'inactivos'}`;
}
