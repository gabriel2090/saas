import { useRef, useState, type ReactNode } from 'react';
import { useAtajos } from '../atajos/useAtajos';
import { Aviso } from '../componentes/Aviso';
import { useFocoDialogo } from './DialogosAbono';
import { useCandado } from './useCandado';

/**
 * Propiedades de {@link DialogoGuardado}.
 */
interface PropiedadesDialogoGuardado {
  /** Título, p. ej. «Factura 84772 corregida (versión 2)». */
  titulo: string;
  /** Resumen de lo que se hizo. */
  children: ReactNode;
  /** Texto del botón de imprimir, o `undefined` si no se imprime nada. */
  textoImprimir?: string;
  /**
   * Imprime el documento.
   *
   * @returns Mensaje de error, o `null` si se imprimió.
   */
  alImprimir?: () => Promise<string | null>;
  /** Cierra el diálogo. */
  alCerrar: () => void;
}

/**
 * Diálogo que confirma una operación guardada (corrección o devolución) y
 * ofrece imprimir. El foco inicial queda en «Imprimir» (o en «Cerrar» si no
 * hay nada que imprimir); si la impresión falla, el botón sirve para
 * reintentar. Esc cierra.
 *
 * @param props - Propiedades del componente.
 * @returns El diálogo modal.
 */
export function DialogoGuardado({
  titulo,
  children,
  textoImprimir,
  alImprimir,
  alCerrar,
}: PropiedadesDialogoGuardado): ReactNode {
  const botonImprimir = useRef<HTMLButtonElement>(null);
  const botonCerrar = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const conCandado = useCandado();
  useFocoDialogo(() => botonImprimir.current ?? botonCerrar.current);
  useAtajos({ retroceder: alCerrar }, { prioridad: 'modal' });

  const imprimir = (): void => {
    if (!alImprimir) return;
    void conCandado(async () => {
      setOcupado(true);
      const fallo = await alImprimir();
      setOcupado(false);
      setError(fallo);
    });
  };

  return (
    <div className="capa-modal" role="presentation">
      <div
        className="dialogo dialogo--formulario"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialogo-guardado-titulo"
      >
        <div className="dialogo__titulo" id="dialogo-guardado-titulo">
          {titulo}
        </div>
        <div className="dialogo__cuerpo">
          {children}
          {error && <Aviso tipo="error">{error}</Aviso>}
        </div>
        <div className="dialogo__botones">
          <button ref={botonCerrar} type="button" className="boton" onClick={alCerrar}>
            Cerrar
          </button>
          {textoImprimir && alImprimir && (
            <button
              ref={botonImprimir}
              type="button"
              className="boton boton--primario"
              disabled={ocupado}
              onClick={imprimir}
            >
              {textoImprimir}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
