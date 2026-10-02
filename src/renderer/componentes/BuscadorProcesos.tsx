import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buscarProcesos, type IdProceso } from '../../shared/procesos';
import { useAtajos } from '../atajos/useAtajos';

/**
 * Propiedades de {@link BuscadorProcesos}.
 */
interface PropiedadesBuscador {
  /** Abre el proceso elegido. */
  alElegir: (id: IdProceso) => void;
  /** Cierra el buscador sin elegir. */
  alCerrar: () => void;
}

/**
 * Buscador de procesos (Ctrl+K): se escribe «abono», «factura», etc., se
 * mueve la selección con las flechas y se abre con Enter. Esc lo cierra.
 *
 * @param props - Propiedades del componente.
 * @returns El buscador modal.
 */
export function BuscadorProcesos({ alElegir, alCerrar }: PropiedadesBuscador): ReactNode {
  const [consulta, setConsulta] = useState('');
  const [seleccion, setSeleccion] = useState(0);
  const campo = useRef<HTMLInputElement>(null);
  const resultados = useMemo(() => buscarProcesos(consulta), [consulta]);
  const indice = Math.min(seleccion, Math.max(resultados.length - 1, 0));

  useEffect(() => {
    campo.current?.focus();
  }, []);

  const elegir = (posicion: number): void => {
    const proceso = resultados[posicion];
    if (proceso) {
      alElegir(proceso.id);
    }
  };

  useAtajos(
    {
      retroceder: alCerrar,
      moverAbajo: () => setSeleccion(Math.min(indice + 1, resultados.length - 1)),
      moverArriba: () => setSeleccion(Math.max(indice - 1, 0)),
      aceptar: () => elegir(indice),
    },
    { prioridad: 'modal' },
  );

  return (
    <div
      className="capa-modal"
      role="presentation"
      onPointerDown={(e) => e.target === e.currentTarget && alCerrar()}
    >
      <div className="buscador" role="dialog" aria-modal="true" aria-label="Buscar proceso">
        <input
          ref={campo}
          className="buscador__campo"
          type="text"
          placeholder="Escriba el proceso: factura, abono, productos…"
          value={consulta}
          onChange={(e) => {
            setConsulta(e.target.value);
            setSeleccion(0);
          }}
        />
        <ul className="buscador__lista" role="listbox">
          {resultados.length === 0 && (
            <li className="buscador__vacio">No hay procesos que coincidan.</li>
          )}
          {resultados.map((proceso, posicion) => (
            <li
              key={proceso.id}
              role="option"
              aria-selected={posicion === indice}
              className={`buscador__opcion${posicion === indice ? ' buscador__opcion--activa' : ''}`}
              onPointerEnter={() => setSeleccion(posicion)}
              onClick={() => elegir(posicion)}
            >
              <span>{proceso.titulo}</span>
              {proceso.fase > 0 && <span className="buscador__fase">Fase {proceso.fase}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
