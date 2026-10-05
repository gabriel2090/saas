import { useState, type ReactNode } from 'react';
import type { DocumentoImprimible, TipoDocumentoImprimible } from '../../shared/impresion';
import { ATAJOS } from '../../shared/keymap';
import type { DocumentoVisible } from '../../shared/kardex';
import { REPORTES_CON_EXCEL, type PeticionReporte } from '../../shared/reportes';
import { textoCombinacion } from '../atajos/combinacion';
import { useAtajos } from '../atajos/useAtajos';
import { Aviso, type TipoAviso } from '../componentes/Aviso';
import { useCandado } from '../documentos/useCandado';
import { VistaPrevia } from '../documentos/VistaPrevia';
import { invocar } from '../servicios/api';
import { useVentana } from '../ventanas/ContextoVentana';

/**
 * Nombre de cada documento en el título de «Ver documento».
 */
export const NOMBRE_DOCUMENTO: Readonly<Record<TipoDocumentoImprimible, string>> = {
  'factura-cliente': 'Factura de cliente',
  'factura-proveedor': 'Factura de proveedor',
  'abono-cliente': 'Abono de cliente',
  'abono-proveedor': 'Abono a proveedor',
};

/**
 * Acción que abre otra ventana con el dato de la fila seleccionada (Ctrl+D).
 */
export interface AccionFila {
  /** Texto del botón, p. ej. «Ver kardex». */
  texto: string;
  /** Ejecuta la acción, o `null` si la fila seleccionada no la admite. */
  ejecutar: (() => void) | null;
  /** Aviso cuando no hay una fila que la admita, p. ej. «Elija en la tabla el producto.». */
  pedirFila: string;
}

/**
 * Propiedades de {@link MarcoReporte}.
 */
interface PropiedadesMarcoReporte {
  /** Título del reporte (vista previa). */
  titulo: string;
  /** Reporte y filtros actuales (estable entre renders si no cambian), o `null` si todavía no se puede pedir. */
  peticion: PeticionReporte | null;
  /** Texto a la derecha de la barra: corte y conteos. */
  resumen: string;
  /** Vuelve a calcular el reporte. */
  alActualizar: () => void;
  /** Aviso de la consulta (error al calcular). */
  aviso: { tipo: TipoAviso; texto: string } | null;
  /**
   * Documento de la fila seleccionada para «Ver documento» (Ctrl+D). Si se
   * omite, el botón no aparece; si es `null`, la fila no tiene documento.
   */
  documento?: DocumentoVisible | null;
  /**
   * Acción sobre la fila seleccionada con Ctrl+D: «Ver kardex» en el
   * inventario valorizado o «Estado de cuenta» en las cuentas por cobrar y
   * por pagar. Si se omite, el botón no aparece.
   */
  accionFila?: AccionFila;
  /** Filtros, indicadores y tabla. */
  children: ReactNode;
}

/**
 * Marco común de los reportes: barra con «Imprimir o guardar PDF» (Ctrl+P,
 * abre la vista previa en hoja carta), «Ver documento» (Ctrl+D, en el kardex
 * y el historial) o una acción sobre la fila (Ctrl+D: «Ver kardex» o
 * «Estado de cuenta»),
 * «Exportar a Excel» (Ctrl+E, solo los reportes que lo
 * admiten) y «Actualizar» (F5). El proceso principal vuelve a calcular el
 * reporte con los filtros al imprimir o exportar (D-145, D-146).
 *
 * @param props - Propiedades del componente.
 * @returns El contenido de la ventana.
 */
export function MarcoReporte(props: PropiedadesMarcoReporte): ReactNode {
  const { activa } = useVentana();
  const [viendo, setViendo] = useState(false);
  const [documentoAbierto, setDocumentoAbierto] = useState<{
    imprimible: DocumentoImprimible;
    titulo: string;
  } | null>(null);
  const [aviso, setAviso] = useState<{ tipo: TipoAviso; texto: string } | null>(null);
  const conCandado = useCandado();
  const { peticion } = props;
  const conExcel = peticion !== null && REPORTES_CON_EXCEL.includes(peticion.reporte);
  const conDocumento = props.documento !== undefined;

  const exportar = async (): Promise<void> => {
    if (!peticion || !conExcel) return;
    setAviso(null);
    const r = await invocar('reportes:excel', peticion);
    if (!r.ok) {
      setAviso({ tipo: 'error', texto: r.error.mensaje });
    } else if (r.datos) {
      setAviso({ tipo: 'exito', texto: 'Libro de Excel guardado.' });
    }
  };

  const actualizar = (): void => {
    setAviso(null);
    props.alActualizar();
  };

  const imprimir = (): void => {
    if (peticion) setViendo(true);
  };

  const verDocumento = (): void => {
    const { accionFila } = props;
    if (accionFila) {
      if (accionFila.ejecutar) accionFila.ejecutar();
      else setAviso({ tipo: 'alerta', texto: accionFila.pedirFila });
      return;
    }
    if (!conDocumento) return;
    const d = props.documento;
    if (d) {
      setAviso(null);
      setDocumentoAbierto({
        imprimible: { tipo: d.tipo, id: d.id, reimpresion: true, tirilla: true },
        titulo: `${NOMBRE_DOCUMENTO[d.tipo]} ${d.numero} (reimpresión)`,
      });
    } else {
      setAviso({ tipo: 'alerta', texto: 'Esta fila no tiene un documento para ver.' });
    }
  };

  useAtajos(
    {
      imprimirReporte: imprimir,
      exportarExcel: () => void conCandado(exportar),
      actualizarReporte: actualizar,
      verDocumentoReporte: verDocumento,
    },
    { activo: activa && !viendo && documentoAbierto === null },
  );

  return (
    <div className="reporte">
      <div className="barra-herramientas">
        <button
          type="button"
          className="boton boton--primario"
          tabIndex={-1}
          disabled={!peticion}
          onClick={imprimir}
        >
          Imprimir o guardar PDF
          <span className="atajo">{textoCombinacion(ATAJOS.imprimirReporte.combinacion)}</span>
        </button>
        {conDocumento && (
          <button
            type="button"
            className="boton"
            tabIndex={-1}
            disabled={!props.documento}
            onClick={verDocumento}
          >
            Ver documento
            <span className="atajo">
              {textoCombinacion(ATAJOS.verDocumentoReporte.combinacion)}
            </span>
          </button>
        )}
        {props.accionFila && (
          <button
            type="button"
            className="boton"
            tabIndex={-1}
            disabled={!props.accionFila.ejecutar}
            onClick={verDocumento}
          >
            {props.accionFila.texto}
            <span className="atajo">
              {textoCombinacion(ATAJOS.verDocumentoReporte.combinacion)}
            </span>
          </button>
        )}
        {conExcel && (
          <button
            type="button"
            className="boton"
            tabIndex={-1}
            onClick={() => void conCandado(exportar)}
          >
            Exportar a Excel
            <span className="atajo">{textoCombinacion(ATAJOS.exportarExcel.combinacion)}</span>
          </button>
        )}
        <button type="button" className="boton" tabIndex={-1} onClick={actualizar}>
          Actualizar
          <span className="atajo">{textoCombinacion(ATAJOS.actualizarReporte.combinacion)}</span>
        </button>
        <span className="barra-herramientas__separador" />
        <span className="barra-herramientas__resumen">{props.resumen}</span>
      </div>
      {props.aviso && <Aviso tipo={props.aviso.tipo}>{props.aviso.texto}</Aviso>}
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      {props.children}
      {viendo && peticion && (
        <VistaPrevia reporte={peticion} titulo={props.titulo} alCerrar={() => setViendo(false)} />
      )}
      {documentoAbierto && (
        <VistaPrevia
          documento={documentoAbierto.imprimible}
          titulo={documentoAbierto.titulo}
          soloVer
          tirilla
          alCerrar={() => setDocumentoAbierto(null)}
        />
      )}
    </div>
  );
}
