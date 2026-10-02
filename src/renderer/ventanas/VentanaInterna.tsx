import { useEffect, useMemo, useRef, type PointerEvent, type ReactNode } from 'react';
import { obtenerProceso } from '../../shared/procesos';
import { ATRIBUTO_FOCO_INICIAL, useNavegacionFlechas } from '../atajos/navegacion';
import { rectDeVentana, type VentanaAbierta } from './gestor';
import { ContextoVentana, type DatosVentana } from './ContextoVentana';
import { useVentanas } from './ProveedorVentanas';
import type { Rect } from './zonas';

/**
 * Borde o esquina desde el que se redimensiona (puntos cardinales).
 */
type Borde = 'n' | 's' | 'e' | 'o' | 'ne' | 'no' | 'se' | 'so';

/**
 * Bordes y esquinas sensibles (`DISENO.md` §11.2).
 */
const BORDES: readonly Borde[] = ['n', 's', 'e', 'o', 'ne', 'no', 'se', 'so'];

/**
 * Distancia (píxeles) que hay que mover el puntero para que un clic en el
 * título cuente como arrastre (y suelte una ventana encajada).
 */
const UMBRAL_ARRASTRE = 4;

/**
 * Punto del puntero en coordenadas de la pantalla de la app.
 */
export interface PuntoPuntero {
  /** `clientX` del evento. */
  x: number;
  /** `clientY` del evento. */
  y: number;
}

/**
 * Propiedades de {@link VentanaInterna}.
 */
interface PropiedadesVentanaInterna {
  /** Ventana a mostrar. */
  ventana: VentanaAbierta;
  /** Posición en la pila (define el `z-index`). */
  indice: number;
  /** Si es la ventana activa. */
  activa: boolean;
  /**
   * Avisa dónde está el puntero mientras se arrastra la ventana por el
   * título (para la vista previa del encaje).
   *
   * @param punto - Posición del puntero.
   */
  alArrastrar: (punto: PuntoPuntero) => void;
  /** Avisa que se soltó la ventana después de arrastrarla. */
  alSoltar: () => void;
  /**
   * Abre el menú de la ventana (clic derecho en el título).
   *
   * @param punto - Posición del clic.
   */
  alMenu: (punto: PuntoPuntero) => void;
  /** Contenido del proceso. */
  children: ReactNode;
}

/**
 * Ventana interna apilable (estilo MDI) dentro del escritorio: se arrastra
 * por la barra de título (y se encaja al soltarla en un borde), se agranda
 * desde cualquier borde o esquina, se maximiza con doble clic en el título o
 * con su botón, se trae al frente con un clic, abre el menú Organizar con
 * clic derecho en el título y se cierra con su botón o con Esc (ambos piden
 * confirmación).
 *
 * @param props - Propiedades del componente.
 * @returns La ventana.
 */
export function VentanaInterna({
  ventana,
  indice,
  activa,
  alArrastrar,
  alSoltar,
  alMenu,
  children,
}: PropiedadesVentanaInterna): ReactNode {
  const {
    estado,
    enfocar,
    mover,
    redimensionar,
    maximizar,
    marcarCambios,
    marcarConservados,
    solicitarCerrar,
  } = useVentanas();
  const marco = useRef<HTMLElement>(null);
  const contenido = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{
    inicioX: number;
    inicioY: number;
    dx: number;
    dy: number;
    movida: boolean;
  } | null>(null);
  const cambioTamano = useRef<{ x: number; y: number; rect: Rect; borde: Borde } | null>(null);
  const titulo = obtenerProceso(ventana.id).titulo;
  const rect = rectDeVentana(ventana, estado.escritorio);
  const encajada = ventana.maximizada || ventana.encaje !== null;

  useNavegacionFlechas(contenido, activa);

  // Al pasar al frente, el foco entra a la ventana para seguir con el teclado.
  useEffect(() => {
    const elemento = contenido.current;
    if (activa && elemento && !elemento.contains(document.activeElement)) {
      const primero =
        elemento.querySelector<HTMLElement>(`[${ATRIBUTO_FOCO_INICIAL}]`) ??
        elemento.querySelector<HTMLElement>(
          'input:not([tabindex="-1"]), select, textarea, button:not([tabindex="-1"]), [tabindex="0"]',
        );
      (primero ?? elemento).focus();
    }
  }, [activa]);

  const datos = useMemo<DatosVentana>(
    () => ({
      id: ventana.id,
      activa,
      marcarCambios: (conCambios) => marcarCambios(ventana.id, conCambios),
      marcarConservados: (aviso) => marcarConservados(ventana.id, aviso),
      cerrar: () => void solicitarCerrar(ventana.id),
    }),
    [ventana.id, activa, marcarCambios, marcarConservados, solicitarCerrar],
  );

  const iniciarArrastre = (evento: PointerEvent<HTMLDivElement>): void => {
    if (evento.button !== 0 || (evento.target as HTMLElement).closest('button')) {
      return;
    }
    evento.currentTarget.setPointerCapture(evento.pointerId);
    arrastre.current = {
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      dx: evento.clientX - rect.x,
      dy: evento.clientY - rect.y,
      movida: false,
    };
  };

  const arrastrar = (evento: PointerEvent<HTMLDivElement>): void => {
    const a = arrastre.current;
    if (!a) {
      return;
    }
    if (!a.movida) {
      const distancia = Math.hypot(evento.clientX - a.inicioX, evento.clientY - a.inicioY);
      if (distancia < UMBRAL_ARRASTRE) {
        return;
      }
      a.movida = true;
      // Al soltar una encajada vuelve a su ancho normal: el puntero queda en la misma proporción del título.
      const anchoActual = marco.current?.offsetWidth ?? 0;
      const anchoNormal = ventana.tamano?.ancho ?? anchoActual;
      if (encajada && anchoActual > 0) {
        a.dx = Math.round((a.dx * anchoNormal) / anchoActual);
      }
    }
    mover(ventana.id, evento.clientX - a.dx, evento.clientY - a.dy);
    alArrastrar({ x: evento.clientX, y: evento.clientY });
  };

  const terminarArrastre = (): void => {
    const movida = arrastre.current?.movida ?? false;
    arrastre.current = null;
    if (movida) {
      alSoltar();
    }
  };

  const iniciarCambioTamano = (evento: PointerEvent<HTMLDivElement>, borde: Borde): void => {
    const elemento = marco.current;
    if (evento.button !== 0 || !elemento) {
      return;
    }
    evento.stopPropagation();
    evento.currentTarget.setPointerCapture(evento.pointerId);
    // Parte del tamaño real en pantalla, también si la ventana se ajustaba a su contenido.
    cambioTamano.current = {
      x: evento.clientX,
      y: evento.clientY,
      borde,
      rect: {
        x: elemento.offsetLeft,
        y: elemento.offsetTop,
        ancho: elemento.offsetWidth,
        alto: elemento.offsetHeight,
      },
    };
  };

  const cambiarTamano = (evento: PointerEvent<HTMLDivElement>): void => {
    const inicio = cambioTamano.current;
    if (!inicio) {
      return;
    }
    const dx = evento.clientX - inicio.x;
    const dy = evento.clientY - inicio.y;
    const { borde, rect: r } = inicio;
    const nuevo = { ...r };
    if (borde.includes('e')) {
      nuevo.ancho = r.ancho + dx;
    }
    if (borde.includes('o')) {
      nuevo.x = r.x + dx;
      nuevo.ancho = r.ancho - dx;
    }
    if (borde.includes('s')) {
      nuevo.alto = r.alto + dy;
    }
    if (borde.includes('n')) {
      nuevo.y = r.y + dy;
      nuevo.alto = r.alto - dy;
    }
    redimensionar(ventana.id, nuevo);
  };

  const terminarCambioTamano = (): void => {
    cambioTamano.current = null;
  };

  const clases = [
    'ventana',
    activa && 'ventana--activa',
    encajada && 'ventana--encajada',
    rect.ancho !== null && 'ventana--con-tamano',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section
      ref={marco}
      className={clases}
      style={{
        left: rect.x,
        top: rect.y,
        zIndex: 10 + indice,
        ...(rect.ancho !== null && rect.alto !== null
          ? { width: rect.ancho, height: rect.alto }
          : // Ajustada a su contenido: no pasa del borde inferior y el contenido se desplaza.
            estado.escritorio && { maxHeight: estado.escritorio.alto - rect.y }),
      }}
      onPointerDownCapture={() => enfocar(ventana.id)}
      aria-label={titulo}
    >
      <div
        className="ventana__titulo"
        onPointerDown={iniciarArrastre}
        onPointerMove={arrastrar}
        onPointerUp={terminarArrastre}
        onPointerCancel={terminarArrastre}
        // Si el sistema quita la captura (otro programa al frente), se suelta donde iba para no dejar el arrastre colgado.
        onLostPointerCapture={terminarArrastre}
        onContextMenu={(e) => {
          e.preventDefault();
          alMenu({ x: e.clientX, y: e.clientY });
        }}
        onDoubleClick={(e) => {
          if (!(e.target as HTMLElement).closest('button')) {
            maximizar(ventana.id);
          }
        }}
      >
        <span className="ventana__nombre">
          {titulo}
          {ventana.conCambios && <span className="ventana__cambios"> • sin guardar</span>}
          {!ventana.conCambios && ventana.conservados && (
            <span className="ventana__cambios"> • {ventana.conservados.resumen}</span>
          )}
        </span>
        <span className="ventana__botones">
          <button
            type="button"
            className="ventana__maximizar"
            title={
              ventana.maximizada
                ? 'Restaurar (doble clic en el título)'
                : 'Maximizar (doble clic en el título)'
            }
            tabIndex={-1}
            onClick={() => maximizar(ventana.id)}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 11 11"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.3}
              aria-hidden="true"
            >
              {ventana.maximizada ? (
                <path d="M3 1h7v7M1 3h7v7H1z" />
              ) : (
                <rect x="1" y="1" width="9" height="9" />
              )}
            </svg>
          </button>
          <button
            type="button"
            className="ventana__cerrar"
            title="Cerrar (Esc)"
            tabIndex={-1}
            onClick={() => void solicitarCerrar(ventana.id)}
          >
            ×
          </button>
        </span>
      </div>
      <div className="ventana__contenido" ref={contenido} tabIndex={-1}>
        <ContextoVentana.Provider value={datos}>{children}</ContextoVentana.Provider>
      </div>
      {!ventana.maximizada && (
        <>
          {BORDES.map((borde) => (
            <div
              key={borde}
              className={`ventana__borde ventana__borde--${borde}`}
              onPointerDown={(e) => iniciarCambioTamano(e, borde)}
              onPointerMove={cambiarTamano}
              onPointerUp={terminarCambioTamano}
              onPointerCancel={terminarCambioTamano}
              onLostPointerCapture={terminarCambioTamano}
            />
          ))}
          <div
            className="ventana__redimensionar"
            title="Arrastre para cambiar el tamaño"
            onPointerDown={(e) => iniciarCambioTamano(e, 'se')}
            onPointerMove={cambiarTamano}
            onPointerUp={terminarCambioTamano}
            onPointerCancel={terminarCambioTamano}
            onLostPointerCapture={terminarCambioTamano}
          />
        </>
      )}
    </section>
  );
}
