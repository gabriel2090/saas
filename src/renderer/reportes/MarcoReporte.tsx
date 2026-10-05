import { useState, type ReactNode } from 'react';
import { ATAJOS } from '../../shared/keymap';
import type { PeticionReporte } from '../../shared/reportes';
import { textoCombinacion } from '../atajos/combinacion';
import { useAtajos } from '../atajos/useAtajos';
import { Aviso, type TipoAviso } from '../componentes/Aviso';
import { useCandado } from '../documentos/useCandado';
import { VistaPrevia } from '../documentos/VistaPrevia';
import { invocar } from '../servicios/api';
import { useVentana } from '../ventanas/ContextoVentana';

/**
 * Propiedades de {@link MarcoReporte}.
 */
interface PropiedadesMarcoReporte {
  /** Título del reporte (vista previa). */
  titulo: string;
  /** Reporte y filtros actuales (estable entre renders si no cambian). */
  peticion: PeticionReporte;
  /** Texto a la derecha de la barra: corte y conteos. */
  resumen: string;
  /** Vuelve a calcular el reporte. */
  alActualizar: () => void;
  /** Aviso de la consulta (error al calcular). */
  aviso: { tipo: TipoAviso; texto: string } | null;
  /** Filtros, indicadores y tabla. */
  children: ReactNode;
}

/**
 * Marco común de los reportes: barra con «Imprimir o guardar PDF» (Ctrl+P,
 * abre la vista previa en hoja carta), «Exportar a Excel» (Ctrl+E) y
 * «Actualizar» (F5). El proceso principal vuelve a calcular el reporte con
 * los filtros al imprimir o exportar (D-145, D-146).
 *
 * @param props - Propiedades del componente.
 * @returns El contenido de la ventana.
 */
export function MarcoReporte(props: PropiedadesMarcoReporte): ReactNode {
  const { activa } = useVentana();
  const [viendo, setViendo] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: TipoAviso; texto: string } | null>(null);
  const conCandado = useCandado();

  const exportar = async (): Promise<void> => {
    setAviso(null);
    const r = await invocar('reportes:excel', props.peticion);
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

  useAtajos(
    {
      imprimirReporte: () => setViendo(true),
      exportarExcel: () => void conCandado(exportar),
      actualizarReporte: actualizar,
    },
    { activo: activa && !viendo },
  );

  return (
    <div className="reporte">
      <div className="barra-herramientas">
        <button
          type="button"
          className="boton boton--primario"
          tabIndex={-1}
          onClick={() => setViendo(true)}
        >
          Imprimir o guardar PDF
          <span className="atajo">{textoCombinacion(ATAJOS.imprimirReporte.combinacion)}</span>
        </button>
        <button
          type="button"
          className="boton"
          tabIndex={-1}
          onClick={() => void conCandado(exportar)}
        >
          Exportar a Excel
          <span className="atajo">{textoCombinacion(ATAJOS.exportarExcel.combinacion)}</span>
        </button>
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
      {viendo && (
        <VistaPrevia
          reporte={props.peticion}
          titulo={props.titulo}
          alCerrar={() => setViendo(false)}
        />
      )}
    </div>
  );
}
