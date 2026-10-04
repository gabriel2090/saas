import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ModoBarra } from '../../shared/interfaz';
import { ATAJOS, ATAJOS_PROCESOS } from '../../shared/keymap';
import { obtenerProceso, PROCESOS, type IdProceso } from '../../shared/procesos';
import { textoCombinacion } from '../atajos/combinacion';
import { useAtajos } from '../atajos/useAtajos';
import { ATRIBUTO_BOTON_ORGANIZAR } from '../ventanas/MenuOrganizar';
import { Icono } from './Icono';

/**
 * Propiedades de {@link BarraIconos}.
 */
interface PropiedadesBarraIconos {
  /** Modo de la barra (D-108). */
  modo: ModoBarra;
  /** Si el menú «Organizar» está abierto (resalta su botón). */
  organizarAbierto: boolean;
  /** Abre el proceso elegido. */
  alAbrir: (id: IdProceso) => void;
  /** Abre el buscador de procesos. */
  alBuscar: () => void;
  /** Abre o cierra el menú «Organizar». */
  alOrganizar: () => void;
  /** Cambia el modo de la barra (clic derecho sobre la barra). */
  alCambiarModo: (modo: ModoBarra) => void;
}

/**
 * Propiedades de {@link MenuModoBarra}.
 */
interface PropiedadesMenuModoBarra {
  /** Posición del clic derecho. */
  posicion: { x: number; y: number };
  /** Modo actual. */
  modo: ModoBarra;
  /** Elige un modo. */
  alElegir: (modo: ModoBarra) => void;
  /** Cierra el menú sin elegir. */
  alCerrar: () => void;
}

/**
 * Menú del clic derecho sobre la barra: elegir entre ícono y nombre o solo íconos.
 *
 * @param props - Propiedades del componente.
 * @returns El menú.
 */
function MenuModoBarra({
  posicion,
  modo,
  alElegir,
  alCerrar,
}: PropiedadesMenuModoBarra): ReactNode {
  useAtajos({ retroceder: alCerrar }, { prioridad: 'modal' });
  const opciones: [ModoBarra, string][] = [
    ['linea', 'Ícono y nombre'],
    ['iconos', 'Solo íconos'],
  ];
  return (
    <div
      className="capa-menu"
      role="presentation"
      onPointerDown={(e) => e.target === e.currentTarget && alCerrar()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="menu-organizar menu-organizar--chico"
        role="menu"
        aria-label="Barra superior"
        style={{ left: posicion.x, top: posicion.y }}
      >
        <div className="menu-organizar__seccion">Barra superior</div>
        {opciones.map(([valor, texto]) => (
          <div
            key={valor}
            role="menuitemradio"
            aria-checked={valor === modo}
            className="menu-organizar__opcion"
            onClick={() => alElegir(valor)}
          >
            <span>{valor === modo ? '●' : ''}</span>
            <span>{texto}</span>
            <span />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Ventanas que abre el botón «Correcciones», en el orden del menú.
 */
const PROCESOS_CORRECCIONES: readonly IdProceso[] = [
  'correccion-cliente',
  'correccion-proveedor',
  'devolucion-venta',
  'devolucion-compra',
];

/**
 * Trazo del ícono del botón «Correcciones» (lápiz).
 */
const TRAZO_CORRECCIONES = 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4';

/**
 * Propiedades de {@link MenuCorrecciones}.
 */
interface PropiedadesMenuCorrecciones {
  /** Esquina inferior izquierda del botón. */
  posicion: { x: number; y: number };
  /** Abre la ventana elegida. */
  alElegir: (id: IdProceso) => void;
  /** Cierra el menú sin elegir. */
  alCerrar: () => void;
}

/**
 * Menú del botón «Correcciones»: las ventanas de corrección y de devolución
 * (no se anclan a la barra). El foco va a la primera opción; las flechas
 * recorren las opciones, Enter abre y Esc cierra.
 *
 * @param props - Propiedades del componente.
 * @returns El menú.
 */
function MenuCorrecciones({
  posicion,
  alElegir,
  alCerrar,
}: PropiedadesMenuCorrecciones): ReactNode {
  const primera = useRef<HTMLButtonElement>(null);
  useAtajos({ retroceder: alCerrar }, { prioridad: 'modal' });
  useEffect(() => {
    primera.current?.focus();
  }, []);
  return (
    <div
      className="capa-menu"
      role="presentation"
      onPointerDown={(e) => e.target === e.currentTarget && alCerrar()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="menu-organizar menu-correcciones"
        role="menu"
        aria-label="Correcciones"
        style={{ left: posicion.x, top: posicion.y }}
      >
        <div className="menu-organizar__titulo">Correcciones</div>
        {PROCESOS_CORRECCIONES.map((id, i) => (
          <button
            key={id}
            ref={i === 0 ? primera : undefined}
            type="button"
            role="menuitem"
            className="menu-organizar__opcion"
            onClick={() => alElegir(id)}
          >
            <Icono proceso={id} />
            <span>{obtenerProceso(id).titulo}</span>
            <span />
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Barra superior con los procesos anclados (§10, `DISENO.md` §11.4): ícono
 * y nombre en una línea (por defecto) o solo íconos con ayuda emergente que
 * muestra el nombre y el atajo. A la derecha, «Organizar» y «Buscar». El
 * modo se cambia con clic derecho sobre la barra o desde «Organizar».
 *
 * Los botones no reciben el foco con Tab (`tabIndex=-1`) para no estorbar la
 * navegación por teclado dentro de las ventanas: se usan con el ratón o
 * con sus atajos.
 *
 * @param props - Propiedades del componente.
 * @returns La barra de iconos.
 */
export function BarraIconos({
  modo,
  organizarAbierto,
  alAbrir,
  alBuscar,
  alOrganizar,
  alCambiarModo,
}: PropiedadesBarraIconos): ReactNode {
  const [menuModo, setMenuModo] = useState<{ x: number; y: number } | null>(null);
  const [menuCorrecciones, setMenuCorrecciones] = useState<{ x: number; y: number } | null>(null);
  const anclados = PROCESOS.filter((p) => p.anclado);
  const soloIconos = modo === 'iconos';

  /**
   * Texto de ayuda de un botón: nombre y, si tiene, su atajo.
   *
   * @param nombre - Nombre del proceso o acción.
   * @param atajo - Combinación del keymap, o `null`.
   * @returns Atributos de ayuda según el modo.
   */
  const ayuda = (nombre: string, atajo: string | null): Record<string, string> => {
    const texto = atajo ? `${nombre} (${textoCombinacion(atajo)})` : nombre;
    return soloIconos ? { 'data-ayuda': texto, 'aria-label': nombre } : { title: texto };
  };

  return (
    <nav
      className={`barra-iconos${soloIconos ? ' barra-iconos--iconos' : ''}`}
      aria-label="Procesos frecuentes"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuModo({ x: e.clientX, y: e.clientY });
      }}
    >
      {anclados.map((proceso) => (
        <button
          key={proceso.id}
          type="button"
          className="barra-iconos__boton"
          tabIndex={-1}
          {...ayuda(proceso.titulo, ATAJOS_PROCESOS[proceso.id])}
          onClick={() => alAbrir(proceso.id)}
        >
          <Icono proceso={proceso.id} />
          <span>{proceso.titulo}</span>
        </button>
      ))}
      <button
        type="button"
        className={`barra-iconos__boton${menuCorrecciones ? ' barra-iconos__boton--abierto' : ''}`}
        tabIndex={-1}
        aria-haspopup="menu"
        {...ayuda('Correcciones y devoluciones', null)}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenuCorrecciones((abierto) => (abierto ? null : { x: r.left, y: r.bottom + 2 }));
        }}
      >
        <svg
          className="icono"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={TRAZO_CORRECCIONES} />
        </svg>
        <span>Correcciones</span>
      </button>
      <button
        type="button"
        className={`barra-iconos__boton barra-iconos__organizar${organizarAbierto ? ' barra-iconos__boton--abierto' : ''}`}
        tabIndex={-1}
        {...{ [ATRIBUTO_BOTON_ORGANIZAR]: '' }}
        {...ayuda('Organizar ventanas', ATAJOS.organizarVentanas.combinacion)}
        onClick={alOrganizar}
      >
        <svg
          className="icono"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          aria-hidden="true"
        >
          <path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z" />
        </svg>
        <span>Organizar</span>
      </button>
      <button
        type="button"
        className="barra-iconos__boton barra-iconos__buscar"
        tabIndex={-1}
        {...ayuda('Buscar proceso', ATAJOS.buscarProceso.combinacion)}
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
        <span>Buscar ({textoCombinacion(ATAJOS.buscarProceso.combinacion)})</span>
      </button>
      {menuModo && (
        <MenuModoBarra
          posicion={menuModo}
          modo={modo}
          alElegir={(m) => {
            setMenuModo(null);
            alCambiarModo(m);
          }}
          alCerrar={() => setMenuModo(null)}
        />
      )}
      {menuCorrecciones && (
        <MenuCorrecciones
          posicion={menuCorrecciones}
          alElegir={(id) => {
            setMenuCorrecciones(null);
            alAbrir(id);
          }}
          alCerrar={() => setMenuCorrecciones(null)}
        />
      )}
    </nav>
  );
}
