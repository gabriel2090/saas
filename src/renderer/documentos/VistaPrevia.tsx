import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DocumentoImprimible } from '../../shared/impresion';
import type { PeticionReporte } from '../../shared/reportes';
import type { Resultado } from '../../shared/resultado';
import { useAtajos } from '../atajos/useAtajos';
import { Aviso, type TipoAviso } from '../componentes/Aviso';
import { invocar } from '../servicios/api';

/**
 * Qué se muestra: un documento (factura, abono) o un reporte de la Fase 5.
 */
type OrigenVistaPrevia =
  | { documento: DocumentoImprimible; reporte?: undefined }
  | { reporte: PeticionReporte; documento?: undefined };

/**
 * Propiedades de {@link VistaPrevia}.
 */
type PropiedadesVistaPrevia = OrigenVistaPrevia & {
  /** Título del diálogo. */
  titulo: string;
  /** Se llama al cerrar. */
  alCerrar: () => void;
  /** Solo muestra el documento, sin «Imprimir» ni «Guardar PDF» (Reimpresiones, Ctrl+D). */
  soloVer?: boolean;
  /** Muestra el documento con el ancho de la tirilla de 80 mm. */
  tirilla?: boolean;
};

/**
 * Arma el origen de la vista previa con lo que llegó en las propiedades.
 *
 * @param documento - Documento, si es uno.
 * @param reporte - Reporte, si es uno.
 * @returns Origen.
 * @throws {Error} Si no llegó ninguno (error de programación).
 */
function elegirOrigen(
  documento: DocumentoImprimible | undefined,
  reporte: PeticionReporte | undefined,
): OrigenVistaPrevia {
  if (reporte) return { reporte };
  if (documento) return { documento };
  throw new Error('La vista previa necesita un documento o un reporte.');
}

/**
 * Pide al proceso principal el HTML, la impresión o el PDF del documento o
 * del reporte.
 *
 * @param origen - Documento o reporte.
 * @param accion - Qué se pide.
 * @returns Resultado del canal.
 */
function invocarImpresion(
  origen: OrigenVistaPrevia,
  accion: 'html' | 'imprimir' | 'pdf',
): Promise<Resultado<string | boolean>> {
  if (origen.reporte) {
    return accion === 'html'
      ? invocar('reportes:html', origen.reporte)
      : invocar(accion === 'imprimir' ? 'reportes:imprimir' : 'reportes:pdf', origen.reporte);
  }
  return accion === 'html'
    ? invocar('impresion:html', origen.documento)
    : invocar(accion === 'imprimir' ? 'impresion:imprimir' : 'impresion:pdf', origen.documento);
}

/**
 * Vista previa de un documento con «Imprimir» y «Guardar PDF» (D-52, D-72),
 * o solo para verlo. El HTML lo arma el proceso principal y se muestra en un
 * marco aislado, sin scripts. Esc cierra.
 *
 * @param props - Propiedades del componente.
 * @returns El diálogo modal.
 */
export function VistaPrevia(props: PropiedadesVistaPrevia): ReactNode {
  const { documento, reporte, titulo, alCerrar, soloVer = false, tirilla = false } = props;
  const origen = useMemo(() => elegirOrigen(documento, reporte), [documento, reporte]);
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
    void invocarImpresion(origen, 'html').then((r) => {
      if (!vigente) return;
      if (r.ok) {
        setHtml(String(r.datos));
        (botonImprimir.current ?? botonCerrar.current)?.focus();
      } else {
        setAviso({ tipo: 'error', texto: r.error.mensaje });
      }
    });
    return () => {
      vigente = false;
    };
  }, [origen]);

  useAtajos({ retroceder: alCerrar }, { prioridad: 'modal' });

  const ejecutar = async (accion: 'imprimir' | 'pdf'): Promise<void> => {
    setOcupado(true);
    setAviso(null);
    const r = await invocarImpresion(origen, accion);
    setOcupado(false);
    if (!r.ok) {
      setAviso({ tipo: 'error', texto: r.error.mensaje });
    } else if (r.datos) {
      setAviso({
        tipo: 'exito',
        texto: accion === 'imprimir' ? 'Documento enviado a la impresora.' : 'PDF guardado.',
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
                onClick={() => void ejecutar('imprimir')}
              >
                Imprimir
              </button>
              <button
                type="button"
                className="boton"
                disabled={html === null || ocupado}
                onClick={() => void ejecutar('pdf')}
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
