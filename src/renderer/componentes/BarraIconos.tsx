import type { ReactNode } from 'react';
import { ATAJOS, ATAJOS_PROCESOS } from '../../shared/keymap';
import { PROCESOS, type IdProceso } from '../../shared/procesos';
import { Icono } from './Icono';

/**
 * Propiedades de {@link BarraIconos}.
 */
interface PropiedadesBarraIconos {
  /** Abre el proceso elegido. */
  alAbrir: (id: IdProceso) => void;
  /** Abre el buscador de procesos. */
  alBuscar: () => void;
}

/**
 * Barra superior con los procesos anclados (§10). Cada botón muestra su
 * atajo (si está definido en el keymap) en la ayuda emergente.
 *
 * Los botones no reciben el foco con Tab (`tabIndex=-1`) para no estorbar la
 * navegación por teclado dentro de las ventanas: se usan con el ratón o
 * con sus atajos.
 *
 * @param props - Propiedades del componente.
 * @returns La barra de iconos.
 */
export function BarraIconos({ alAbrir, alBuscar }: PropiedadesBarraIconos): ReactNode {
  const anclados = PROCESOS.filter((p) => p.anclado);
  return (
    <nav className="barra-iconos" aria-label="Procesos frecuentes">
      {anclados.map((proceso) => {
        const atajo = ATAJOS_PROCESOS[proceso.id];
        return (
          <button
            key={proceso.id}
            type="button"
            className="barra-iconos__boton"
            tabIndex={-1}
            title={atajo ? `${proceso.titulo} (${atajo})` : proceso.titulo}
            onClick={() => alAbrir(proceso.id)}
          >
            <Icono proceso={proceso.id} />
            <span>{proceso.titulo}</span>
          </button>
        );
      })}
      <button
        type="button"
        className="barra-iconos__boton barra-iconos__buscar"
        tabIndex={-1}
        title={`Buscar proceso (${ATAJOS.buscarProceso.combinacion})`}
        onClick={alBuscar}
      >
        <svg
          className="icono"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          aria-hidden="true"
        >
          <path d="M10 10m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0M15 15l6 6" />
        </svg>
        <span>Buscar ({ATAJOS.buscarProceso.combinacion})</span>
      </button>
    </nav>
  );
}
