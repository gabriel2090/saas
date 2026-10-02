import { useEffect, useMemo, useRef, type PointerEvent, type ReactNode } from 'react';
import { obtenerProceso } from '../../shared/procesos';
import { useNavegacionFlechas } from '../atajos/navegacion';
import type { VentanaAbierta } from './gestor';
import { ContextoVentana, type DatosVentana } from './ContextoVentana';
import { useVentanas } from './ProveedorVentanas';

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
  /** Contenido del proceso. */
  children: ReactNode;
}

/**
 * Ventana interna apilable (estilo MDI) dentro del escritorio: se arrastra
 * por la barra de título, se agranda desde la esquina inferior derecha, se
 * trae al frente con un clic y se cierra con su botón o con Esc (ambos
 * piden confirmación).
 *
 * @param props - Propiedades del componente.
 * @returns La ventana.
 */
export function VentanaInterna({
  ventana,
  indice,
  activa,
  children,
}: PropiedadesVentanaInterna): ReactNode {
  const { enfocar, mover, redimensionar, marcarCambios, solicitarCerrar } = useVentanas();
  const marco = useRef<HTMLElement>(null);
  const contenido = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{ dx: number; dy: number } | null>(null);
  const cambioTamano = useRef<{ x: number; y: number; ancho: number; alto: number } | null>(null);
  const titulo = obtenerProceso(ventana.id).titulo;

  useNavegacionFlechas(contenido, activa);

  // Al pasar al frente, el foco entra a la ventana para seguir con el teclado.
  useEffect(() => {
    const elemento = contenido.current;
    if (activa && elemento && !elemento.contains(document.activeElement)) {
      const primero = elemento.querySelector<HTMLElement>(
        'input, select, textarea, button, [tabindex="0"]',
      );
      (primero ?? elemento).focus();
    }
  }, [activa]);

  const datos = useMemo<DatosVentana>(
    () => ({
      id: ventana.id,
      activa,
      marcarCambios: (conCambios) => marcarCambios(ventana.id, conCambios),
      cerrar: () => void solicitarCerrar(ventana.id),
    }),
    [ventana.id, activa, marcarCambios, solicitarCerrar],
  );

  const iniciarArrastre = (evento: PointerEvent<HTMLDivElement>): void => {
    if (evento.button !== 0 || (evento.target as HTMLElement).closest('button')) {
      return;
    }
    evento.currentTarget.setPointerCapture(evento.pointerId);
    arrastre.current = { dx: evento.clientX - ventana.x, dy: evento.clientY - ventana.y };
  };

  const arrastrar = (evento: PointerEvent<HTMLDivElement>): void => {
    if (arrastre.current) {
      mover(ventana.id, evento.clientX - arrastre.current.dx, evento.clientY - arrastre.current.dy);
    }
  };

  const terminarArrastre = (): void => {
    arrastre.current = null;
  };

  const iniciarCambioTamano = (evento: PointerEvent<HTMLDivElement>): void => {
    const elemento = marco.current;
    if (evento.button !== 0 || !elemento) {
      return;
    }
    evento.currentTarget.setPointerCapture(evento.pointerId);
    // Parte del tamaño real en pantalla, también si la ventana se ajustaba a su contenido.
    cambioTamano.current = {
      x: evento.clientX,
      y: evento.clientY,
      ancho: elemento.offsetWidth,
      alto: elemento.offsetHeight,
    };
  };

  const cambiarTamano = (evento: PointerEvent<HTMLDivElement>): void => {
    const inicio = cambioTamano.current;
    if (inicio) {
      redimensionar(ventana.id, {
        ancho: inicio.ancho + evento.clientX - inicio.x,
        alto: inicio.alto + evento.clientY - inicio.y,
      });
    }
  };

  const terminarCambioTamano = (): void => {
    cambioTamano.current = null;
  };

  return (
    <section
      ref={marco}
      className={`ventana${activa ? ' ventana--activa' : ''}`}
      style={{
        left: ventana.x,
        top: ventana.y,
        zIndex: 10 + indice,
        ...(ventana.tamano ? { width: ventana.tamano.ancho, height: ventana.tamano.alto } : {}),
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
      >
        <span>
          {titulo}
          {ventana.conCambios && <span className="ventana__cambios"> • sin guardar</span>}
        </span>
        <button
          type="button"
          className="ventana__cerrar"
          title="Cerrar (Esc)"
          tabIndex={-1}
          onClick={() => void solicitarCerrar(ventana.id)}
        >
          ×
        </button>
      </div>
      <div className="ventana__contenido" ref={contenido} tabIndex={-1}>
        <ContextoVentana.Provider value={datos}>{children}</ContextoVentana.Provider>
      </div>
      <div
        className="ventana__redimensionar"
        title="Arrastre para cambiar el tamaño"
        onPointerDown={iniciarCambioTamano}
        onPointerMove={cambiarTamano}
        onPointerUp={terminarCambioTamano}
        onPointerCancel={terminarCambioTamano}
      />
    </section>
  );
}
