import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ModoBarra } from '../../shared/interfaz';
import { ATAJOS, type IdAtajo } from '../../shared/keymap';
import { obtenerProceso } from '../../shared/procesos';
import { textoCombinacion } from '../atajos/combinacion';
import { useAtajos, type AccionAtajo } from '../atajos/useAtajos';
import { calcularOrganizacion, ventanaActiva } from './gestor';
import { Miniatura } from './Miniatura';
import { useVentanas } from './ProveedorVentanas';
import { minimoDeProceso } from './tamanos';
import {
  ajustarZona,
  celdasDeDiseno,
  nombreCelda,
  rectDeRelativa,
  type DisenoOrganizar,
} from './zonas';

/**
 * Atributo que marca el botón «Organizar» de la barra, para ubicar el menú debajo.
 */
export const ATRIBUTO_BOTON_ORGANIZAR = 'data-organizar';

/**
 * Opción del menú.
 */
interface OpcionMenu {
  /** Atajo del keymap que la elige. */
  atajo: IdAtajo;
  /** Sección a la que pertenece. */
  seccion: 'disenos' | 'activa' | 'barra';
  /** Texto. */
  texto: ReactNode;
  /** Diseño que dibuja su miniatura, si tiene. */
  diseno?: DisenoOrganizar;
  /** Por qué está desactivada, o `null` si se puede elegir. */
  razon: string | null;
  /** Ejecuta la opción. */
  ejecutar: () => void;
}

/**
 * Propiedades de {@link MenuOrganizar}.
 */
interface PropiedadesMenuOrganizar {
  /** Punto del clic derecho en un título; sin él, se abre bajo el botón «Organizar». */
  punto?: { x: number; y: number } | null;
  /** Cierra el menú. */
  alCerrar: () => void;
}

/** Ancho del menú en px (igual que `.menu-organizar` en la hoja de estilos). */
const ANCHO_MENU = 330;

/**
 * Menú «Organizar» (Ctrl+Shift+O, `DISENO.md` §11.3): diseños para todas las
 * ventanas, acciones sobre la activa y la preferencia de la barra superior.
 * Cada opción se elige con su tecla (definida en el keymap) o con ↑/↓ y
 * Enter; las que no caben salen en gris con la razón.
 *
 * @param props - Propiedades del componente.
 * @returns El menú.
 */
export function MenuOrganizar({ punto = null, alCerrar }: PropiedadesMenuOrganizar): ReactNode {
  const api = useVentanas();
  const { estado } = api;
  const activa = ventanaActiva(estado);
  const panel = useRef<HTMLDivElement>(null);
  // Se ubica en el clic derecho o debajo del botón «Organizar», y devuelve el foco al cerrarse.
  const [posicion] = useState<{ top: number; right: number }>(() => {
    if (punto) {
      const izquierda = Math.min(punto.x, window.innerWidth - ANCHO_MENU - 4);
      return { top: punto.y, right: window.innerWidth - izquierda - ANCHO_MENU };
    }
    const boton = document.querySelector(`[${ATRIBUTO_BOTON_ORGANIZAR}]`);
    if (!boton) {
      return { top: 40, right: 8 };
    }
    const r = boton.getBoundingClientRect();
    return { top: r.bottom + 2, right: Math.max(4, window.innerWidth - r.right) };
  });
  useEffect(() => {
    const anterior = document.activeElement;
    const elemento = panel.current;
    elemento?.focus();
    // Abierto con clic derecho cerca del borde inferior: se sube para que se vea completo.
    const caja = elemento?.getBoundingClientRect();
    if (elemento && caja && caja.bottom > window.innerHeight - 4) {
      elemento.style.top = `${Math.max(4, window.innerHeight - caja.height - 4)}px`;
    }
    return () => {
      if (anterior instanceof HTMLElement) {
        anterior.focus();
      }
    };
  }, []);

  const razonDiseno = (diseno: DisenoOrganizar): string | null => {
    const r = calcularOrganizacion(estado, diseno);
    return r.ok ? null : r.razon;
  };
  const sinActiva = activa ? null : 'No hay ventanas abiertas.';
  const mitad = (indice: number): void => {
    const escritorio = estado.escritorio;
    if (!activa || !escritorio) {
      return;
    }
    const zona = rectDeRelativa(
      celdasDeDiseno('dos-columnas')[indice] ?? { x: 0, y: 0, ancho: 0, alto: 0 },
      escritorio,
    );
    const nombre = nombreCelda('dos-columnas', indice).conArticulo;
    api.encajar(
      activa.id,
      ajustarZona(
        zona,
        minimoDeProceso(activa.id),
        escritorio,
        obtenerProceso(activa.id).titulo,
        nombre,
      ).rect,
    );
  };
  const otroModo: ModoBarra = api.modoBarra === 'linea' ? 'iconos' : 'linea';

  const opciones: OpcionMenu[] = [
    {
      atajo: 'organizarDosColumnas',
      seccion: 'disenos',
      texto: '2 columnas',
      diseno: 'dos-columnas',
      razon: razonDiseno('dos-columnas'),
      ejecutar: () => api.organizar('dos-columnas'),
    },
    {
      atajo: 'organizarTresColumnas',
      seccion: 'disenos',
      texto: '3 columnas',
      diseno: 'tres-columnas',
      razon: razonDiseno('tres-columnas'),
      ejecutar: () => api.organizar('tres-columnas'),
    },
    {
      atajo: 'organizarDosPorDos',
      seccion: 'disenos',
      texto: '2 × 2',
      diseno: 'dos-por-dos',
      razon: razonDiseno('dos-por-dos'),
      ejecutar: () => api.organizar('dos-por-dos'),
    },
    {
      atajo: 'organizarCascada',
      seccion: 'disenos',
      texto: 'Cascada',
      diseno: 'cascada',
      razon: razonDiseno('cascada'),
      ejecutar: () => api.organizar('cascada'),
    },
    {
      atajo: 'organizarMaximizar',
      seccion: 'activa',
      texto: (
        <>
          {activa?.maximizada ? 'Restaurar' : 'Maximizar'}{' '}
          <span className="texto-tenue">(doble clic en el título)</span>
        </>
      ),
      razon: sinActiva,
      ejecutar: () => activa && api.maximizar(activa.id),
    },
    {
      atajo: 'organizarMitadIzquierda',
      seccion: 'activa',
      texto: 'Mitad izquierda',
      razon: sinActiva,
      ejecutar: () => mitad(0),
    },
    {
      atajo: 'organizarMitadDerecha',
      seccion: 'activa',
      texto: 'Mitad derecha',
      razon: sinActiva,
      ejecutar: () => mitad(1),
    },
    {
      atajo: 'organizarRestablecer',
      seccion: 'activa',
      texto: 'Restablecer su tamaño y posición',
      razon: sinActiva,
      ejecutar: () => activa && api.restablecer(activa.id),
    },
    {
      atajo: 'organizarRestablecerTodas',
      seccion: 'activa',
      texto: 'Restablecer todas las ventanas',
      razon: estado.ventanas.length === 0 ? 'No hay ventanas abiertas.' : null,
      ejecutar: () => api.restablecerTodas(),
    },
    {
      atajo: 'organizarBarra',
      seccion: 'barra',
      texto: api.modoBarra === 'linea' ? 'Cambiar a solo íconos' : 'Cambiar a ícono y nombre',
      razon: null,
      ejecutar: () => api.cambiarModoBarra(otroModo),
    },
  ];

  const primeraHabilitada = Math.max(
    0,
    opciones.findIndex((o) => o.razon === null),
  );
  const [seleccion, setSeleccion] = useState(primeraHabilitada);

  const elegir = (opcion: OpcionMenu | undefined): void => {
    if (opcion && opcion.razon === null) {
      opcion.ejecutar();
      alCerrar();
    }
  };
  const mover = (paso: 1 | -1): void => {
    for (let i = 1; i <= opciones.length; i++) {
      const siguiente = (seleccion + paso * i + opciones.length) % opciones.length;
      if (opciones[siguiente]?.razon === null) {
        setSeleccion(siguiente);
        return;
      }
    }
  };

  const porTecla: Partial<Record<IdAtajo, AccionAtajo>> = {};
  for (const opcion of opciones) {
    porTecla[opcion.atajo] = () => elegir(opcion);
  }
  useAtajos(
    {
      ...porTecla,
      retroceder: alCerrar,
      organizarVentanas: alCerrar,
      moverAbajo: () => mover(1),
      moverArriba: () => mover(-1),
      aceptar: () => elegir(opciones[seleccion]),
    },
    { prioridad: 'modal' },
  );

  const fila = (opcion: OpcionMenu, indice: number): ReactNode => (
    <div
      key={opcion.atajo}
      role="menuitem"
      aria-disabled={opcion.razon !== null}
      className={[
        'menu-organizar__opcion',
        indice === seleccion && 'menu-organizar__opcion--activa',
        opcion.razon !== null && 'menu-organizar__opcion--inactiva',
      ]
        .filter(Boolean)
        .join(' ')}
      onPointerEnter={() => opcion.razon === null && setSeleccion(indice)}
      onClick={() => elegir(opcion)}
    >
      {opcion.diseno ? <Miniatura diseno={opcion.diseno} enMenu /> : <span />}
      <span>
        {opcion.texto}
        {opcion.razon && <span className="menu-organizar__razon">{opcion.razon}</span>}
      </span>
      <span className="menu-organizar__tecla">{ATAJOS[opcion.atajo].combinacion}</span>
    </div>
  );

  return (
    <div
      className="capa-menu"
      role="presentation"
      onPointerDown={(e) => e.target === e.currentTarget && alCerrar()}
    >
      <div
        ref={panel}
        className="menu-organizar"
        role="menu"
        aria-label="Organizar ventanas"
        tabIndex={-1}
        style={{ top: posicion.top, right: posicion.right }}
      >
        <div className="menu-organizar__titulo">
          <span>Organizar ventanas</span>
          <span className="texto-tenue">
            {textoCombinacion(ATAJOS.organizarVentanas.combinacion)}
          </span>
        </div>
        {opciones.map((o, i) => (o.seccion === 'disenos' ? fila(o, i) : null))}
        <div className="menu-organizar__seccion">
          Ventana activa{activa ? `: ${obtenerProceso(activa.id).titulo}` : ''}
        </div>
        {opciones.map((o, i) => (o.seccion === 'activa' ? fila(o, i) : null))}
        <div className="menu-organizar__seccion">
          Barra superior: {api.modoBarra === 'linea' ? 'ícono y nombre' : 'solo íconos'}
        </div>
        {opciones.map((o, i) => (o.seccion === 'barra' ? fila(o, i) : null))}
      </div>
    </div>
  );
}
