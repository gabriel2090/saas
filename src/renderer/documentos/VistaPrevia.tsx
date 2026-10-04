import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { DocumentoImprimible } from '../../shared/impresion';
import { useAtajos } from '../atajos/useAtajos';
import { Aviso, type TipoAviso } from '../componentes/Aviso';
import { invocar } from '../servicios/api';

/**
 * Propiedades de {@link VistaPrevia}.
 */
interface PropiedadesVistaPrevia {
  /** Documento a mostrar. */
  documento: DocumentoImprimible;
  /** Título del diálogo. */
  titulo: string;
  /** Se llama al cerrar. */
  alCerrar: () => void;
  /** Solo muestra el documento, sin «Imprimir» ni «Guardar PDF» (Reimpresiones, Ctrl+D). */
  soloVer?: boolean;
  /** Muestra el documento con el ancho de la tirilla de 80 mm. */
  tirilla?: boolean;
}

/**
 * Vista previa de un documento con «Imprimir» y «Guardar PDF» (D-52, D-72),
 * o solo para verlo. El HTML lo arma el proceso principal y se muestra en un
 * marco aislado, sin scripts. Esc cierra.
 *
 * @param props - Propiedades del componente.
 * @returns El diálogo modal.
 */
export function VistaPrevia({
  documento,
  titulo,
  alCerrar,
  soloVer = false,
  tirilla = false,
}: PropiedadesVistaPrevia): ReactNode {
  const [html, setHtml] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: TipoAviso; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const botonImprimir = useRef<HTMLButtonElement>(null);
  const botonCerrar = useRef<HTMLButtonElement>(null);
  const focoAnterior = useRef<Element | null>(null);

  useEffect(() => {
    focoAnterior.current = document.activeElement;
    return () => {
      if (focoAnterior.current instanceof HTMLElement && focoAnterior.current.isConnected) {
        focoAnterior.current.focus();
      }
    };
  }, []);

  useEffect(() => {
    let vigente = true;
    void invocar('impresion:html', documento).then((r) => {
      if (!vigente) return;
      if (r.ok) {
        setHtml(r.datos);
        (botonImprimir.current ?? botonCerrar.current)?.focus();
      } else {
        setAviso({ tipo: 'error', texto: r.error.mensaje });
      }
    });
    return () => {
      vigente = false;
    };
  }, [documento]);

  useAtajos({ retroceder: alCerrar }, { prioridad: 'modal' });

  const ejecutar = async (canal: 'impresion:imprimir' | 'impresion:pdf'): Promise<void> => {
    setOcupado(true);
    setAviso(null);
    const r = await invocar(canal, documento);
    setOcupado(false);
    if (!r.ok) {
      setAviso({ tipo: 'error', texto: r.error.mensaje });
    } else if (r.datos) {
      setAviso({
        tipo: 'exito',
        texto:
          canal === 'impresion:imprimir' ? 'Documento enviado a la impresora.' : 'PDF guardado.',
      });
    }
  };

  return (
    <div className="capa-modal" role="presentation">
      <div
        className={`dialogo vista-previa${tirilla ? ' vista-previa--tirilla' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vista-previa-titulo"
      >
        <div className="dialogo__titulo" id="vista-previa-titulo">
          {titulo}
        </div>
        <div className="vista-previa__hoja">
          {html === null ? (
            <p className="texto-tenue">Preparando el documento…</p>
          ) : (
            <iframe title={titulo} sandbox="" srcDoc={html} />
          )}
        </div>
        {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
        <div className="dialogo__botones">
          {!soloVer && (
            <>
              <button
                ref={botonImprimir}
                type="button"
                className="boton boton--primario"
                disabled={html === null || ocupado}
                onClick={() => void ejecutar('impresion:imprimir')}
              >
                Imprimir
              </button>
              <button
                type="button"
                className="boton"
                disabled={html === null || ocupado}
                onClick={() => void ejecutar('impresion:pdf')}
              >
                Guardar PDF
              </button>
            </>
          )}
          <button ref={botonCerrar} type="button" className="boton" onClick={alCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
