import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ATAJOS } from '../../shared/keymap';
import type { IdProceso } from '../../shared/procesos';
import { textoCombinacion } from '../atajos/combinacion';
import { useAtajos } from '../atajos/useAtajos';
import type { Rect } from './zonas';

/**
 * Ventana que se puede elegir para la zona libre.
 */
export interface CandidataEncaje {
  /** Proceso. */
  id: IdProceso;
  /** Título de la ventana. */
  titulo: string;
  /** Texto corto a la derecha (p. ej. «2 borradores pendientes»), o `null`. */
  detalle: string | null;
  /** Por qué no cabe en la zona, o `null` si cabe. */
  razon: string | null;
}

/**
 * Propiedades de {@link AsistenteEncaje}.
 */
interface PropiedadesAsistenteEncaje {
  /** Zona libre en píxeles del escritorio. */
  zona: Rect;
  /** Nombre de la zona con su artículo («la mitad derecha»). */
  nombreZona: string;
  /** Ventanas abiertas que no están encajadas. */
  candidatas: readonly CandidataEncaje[];
  /**
   * Encaja la ventana elegida en la zona.
   *
   * @param id - Ventana elegida.
   */
  alElegir: (id: IdProceso) => void;
  /** Deja la zona libre. */
  alCerrar: () => void;
}

/**
 * Asistente de encaje (`DISENO.md` §11.3): al encajar una ventana, la zona
 * libre ofrece las demás ventanas abiertas. ↑/↓ y Enter eligen; Esc o un
 * clic fuera la dejan libre. Las que no caben salen en gris con la razón.
 *
 * @param props - Propiedades del componente.
 * @returns El asistente, sobre la zona libre.
 */
export function AsistenteEncaje({
  zona,
  nombreZona,
  candidatas,
  alElegir,
  alCerrar,
}: PropiedadesAsistenteEncaje): ReactNode {
  const habilitadas = candidatas.flatMap((c, i) => (c.razon === null ? [i] : []));
  const [posicion, setPosicion] = useState(0);
  const seleccion = habilitadas[Math.min(posicion, habilitadas.length - 1)] ?? -1;
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const anterior = document.activeElement;
    panel.current?.focus();
    return () => {
      if (anterior instanceof HTMLElement && anterior.isConnected) {
        anterior.focus();
      }
    };
  }, []);

  const elegir = (indice: number): void => {
    const candidata = candidatas[indice];
    if (candidata && candidata.razon === null) {
      alElegir(candidata.id);
    }
  };

  useAtajos(
    {
      retroceder: alCerrar,
      moverAbajo: () => setPosicion(Math.min(posicion + 1, habilitadas.length - 1)),
      moverArriba: () => setPosicion(Math.max(posicion - 1, 0)),
      aceptar: () => elegir(seleccion),
    },
    { prioridad: 'modal' },
  );

  return (
    <>
      <div className="asistente-encaje__fondo" role="presentation" onPointerDown={alCerrar} />
      <div
        className="asistente-encaje"
        style={{ left: zona.x, top: zona.y, width: zona.ancho, height: zona.alto }}
        role="presentation"
        onPointerDown={(e) => e.target === e.currentTarget && alCerrar()}
      >
        <div
          ref={panel}
          className="asistente-encaje__panel"
          role="dialog"
          aria-label={`¿Qué ventana va en ${nombreZona}?`}
          tabIndex={-1}
        >
          <div className="asistente-encaje__titulo">¿Qué ventana va en {nombreZona}?</div>
          <ul className="asistente-encaje__lista" role="listbox">
            {candidatas.map((c, i) => (
              <li
                key={c.id}
                role="option"
                aria-selected={i === seleccion}
                aria-disabled={c.razon !== null}
                className={[
                  'asistente-encaje__opcion',
                  i === seleccion && 'asistente-encaje__opcion--activa',
                  c.razon !== null && 'asistente-encaje__opcion--inactiva',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onPointerEnter={() => {
                  const p = habilitadas.indexOf(i);
                  if (p >= 0) {
                    setPosicion(p);
                  }
                }}
                onClick={() => elegir(i)}
              >
                <span>
                  {c.titulo}
                  {c.razon && <span className="asistente-encaje__razon">{c.razon}</span>}
                </span>
                <span>{c.detalle}</span>
              </li>
            ))}
          </ul>
          <div className="asistente-encaje__ayuda">
            {textoCombinacion(ATAJOS.moverArriba.combinacion)}/
            {textoCombinacion(ATAJOS.moverAbajo.combinacion)} y{' '}
            {textoCombinacion(ATAJOS.aceptar.combinacion)} para elegir ·{' '}
            {textoCombinacion(ATAJOS.retroceder.combinacion)} la deja libre
          </div>
        </div>
      </div>
    </>
  );
}
