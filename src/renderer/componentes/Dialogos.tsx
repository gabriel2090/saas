import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAtajos } from '../atajos/useAtajos';

/**
 * Opciones de un diálogo de confirmación.
 */
export interface OpcionesConfirmacion {
  /** Título del diálogo. */
  titulo: string;
  /** Mensaje (pregunta) a confirmar. */
  mensaje: string;
  /** Texto del botón afirmativo (por defecto «Sí»). */
  textoAceptar?: string;
  /** Texto del botón negativo (por defecto «No»). */
  textoCancelar?: string;
  /**
   * Si la acción es delicada (p. ej. descartar cambios). En ese caso el foco
   * inicial queda en «No», para que un Enter accidental no haga daño.
   */
  peligroso?: boolean;
}

/**
 * Función que muestra un diálogo y resuelve con la respuesta del usuario.
 */
export type Confirmar = (opciones: OpcionesConfirmacion) => Promise<boolean>;

/**
 * Contexto con la función de confirmación.
 */
const ContextoDialogos = createContext<Confirmar | null>(null);

/**
 * Diálogo pendiente de respuesta.
 */
interface DialogoPendiente extends OpcionesConfirmacion {
  /** Resuelve la promesa con la respuesta. */
  responder: (respuesta: boolean) => void;
}

/**
 * Devuelve la función para pedir confirmación al usuario.
 *
 * @returns Función `confirmar`.
 * @throws {Error} Si se usa fuera de `ProveedorDialogos`.
 */
export function useConfirmar(): Confirmar {
  const confirmar = useContext(ContextoDialogos);
  if (!confirmar) {
    throw new Error('useConfirmar debe usarse dentro de ProveedorDialogos.');
  }
  return confirmar;
}

/**
 * Propiedades de {@link ProveedorDialogos}.
 */
interface PropiedadesProveedorDialogos {
  /** Contenido de la aplicación. */
  children: ReactNode;
}

/**
 * Provee los diálogos de confirmación modales. Si se pide un diálogo
 * mientras hay otro abierto, el anterior se responde «No».
 *
 * @param props - Propiedades del componente.
 * @returns El proveedor y el diálogo activo.
 */
export function ProveedorDialogos({ children }: PropiedadesProveedorDialogos): ReactNode {
  const [pendiente, setPendiente] = useState<DialogoPendiente | null>(null);

  const confirmar = useCallback<Confirmar>(
    (opciones) =>
      new Promise<boolean>((resolver) => {
        setPendiente((anterior) => {
          anterior?.responder(false);
          return { ...opciones, responder: resolver };
        });
      }),
    [],
  );

  const responder = useCallback(
    (respuesta: boolean) => {
      pendiente?.responder(respuesta);
      setPendiente(null);
    },
    [pendiente],
  );

  const valor = useMemo(() => confirmar, [confirmar]);
  return (
    <ContextoDialogos.Provider value={valor}>
      {children}
      {pendiente && <DialogoConfirmacion dialogo={pendiente} alResponder={responder} />}
    </ContextoDialogos.Provider>
  );
}

/**
 * Propiedades de {@link DialogoConfirmacion}.
 */
interface PropiedadesDialogo {
  /** Diálogo a mostrar. */
  dialogo: OpcionesConfirmacion;
  /** Se llama con la respuesta del usuario. */
  alResponder: (respuesta: boolean) => void;
}

/**
 * Diálogo modal Sí/No manejable con teclado: Enter acepta el botón con el
 * foco, Esc responde «No» y las flechas izquierda/derecha cambian de botón.
 * Mientras está abierto, ningún otro atajo actúa.
 *
 * @param props - Propiedades del componente.
 * @returns El diálogo.
 */
function DialogoConfirmacion({ dialogo, alResponder }: PropiedadesDialogo): ReactNode {
  const botonSi = useRef<HTMLButtonElement>(null);
  const botonNo = useRef<HTMLButtonElement>(null);
  const focoAnterior = useRef<Element | null>(null);

  useEffect(() => {
    focoAnterior.current = document.activeElement;
    (dialogo.peligroso ? botonNo : botonSi).current?.focus();
    return () => {
      // Devuelve el foco a donde estaba, para seguir trabajando con el teclado.
      if (focoAnterior.current instanceof HTMLElement && focoAnterior.current.isConnected) {
        focoAnterior.current.focus();
      }
    };
  }, [dialogo]);

  const alternarFoco = (): void => {
    (document.activeElement === botonSi.current ? botonNo : botonSi).current?.focus();
  };

  useAtajos(
    {
      retroceder: () => alResponder(false),
      moverIzquierda: alternarFoco,
      moverDerecha: alternarFoco,
    },
    { prioridad: 'modal' },
  );

  return (
    <div className="capa-modal" role="presentation">
      <div
        className="dialogo"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialogo-titulo"
      >
        <div className="dialogo__titulo" id="dialogo-titulo">
          {dialogo.titulo}
        </div>
        <p className="dialogo__mensaje">{dialogo.mensaje}</p>
        <div className="dialogo__botones">
          <button
            ref={botonSi}
            type="button"
            className="boton boton--primario"
            onClick={() => alResponder(true)}
          >
            {dialogo.textoAceptar ?? 'Sí'}
          </button>
          <button ref={botonNo} type="button" className="boton" onClick={() => alResponder(false)}>
            {dialogo.textoCancelar ?? 'No'}
          </button>
        </div>
      </div>
    </div>
  );
}
