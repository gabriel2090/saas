import { useEffect, useRef, type ReactNode } from 'react';
import { ATRIBUTO_FLECHAS_PROPIAS, ATRIBUTO_FOCO_INICIAL } from '../atajos/navegacion';
import { useAtajos } from '../atajos/useAtajos';
import { useVentana } from '../ventanas/ContextoVentana';

/**
 * Celda de una fila del reporte.
 */
export interface CeldaReporte {
  /** Contenido. */
  contenido: ReactNode;
  /** Clases (`num`, `dias`, `negativo`…). */
  clase?: string;
  /** Columnas que ocupa. */
  columnas?: number;
}

/**
 * Fila del reporte: de datos (seleccionable), encabezado de grupo, subtotal o total.
 */
export interface FilaReporte {
  /** Clave única. */
  clave: string;
  /** Tipo de fila. */
  tipo: 'dato' | 'grupo' | 'subtotal' | 'total';
  /** Clases adicionales de la fila (`vencida`, `fila--error`…). */
  clase?: string;
  /** Celdas. */
  celdas: readonly CeldaReporte[];
}

/**
 * Encabezado de una columna.
 */
export interface ColumnaReporte {
  /** Título. */
  titulo: string;
  /** Clases (`num`…). */
  clase?: string;
}

/**
 * Propiedades de {@link TablaReporte}.
 */
interface PropiedadesTablaReporte {
  /** Encabezados. */
  columnas: readonly ColumnaReporte[];
  /** Filas en orden. */
  filas: readonly FilaReporte[];
  /** Clave de la fila de datos seleccionada. */
  seleccionada: string | null;
  /** Cambia la fila seleccionada. */
  alSeleccionar: (clave: string) => void;
  /** Texto cuando no hay filas. */
  textoVacio: string;
}

/**
 * Tabla de un reporte con encabezados de grupo, subtotales y total. Con el
 * foco en la tabla, flecha arriba/abajo recorren solo las filas de datos.
 *
 * @param props - Propiedades del componente.
 * @returns La tabla.
 */
export function TablaReporte(props: PropiedadesTablaReporte): ReactNode {
  const { activa } = useVentana();
  const contenedor = useRef<HTMLDivElement>(null);
  const filaSeleccionada = useRef<HTMLTableRowElement>(null);
  const datos = props.filas.filter((f) => f.tipo === 'dato');
  // Si la fila elegida ya no está (cambió un filtro), se toma la primera.
  const elegida = datos.some((f) => f.clave === props.seleccionada)
    ? props.seleccionada
    : (datos[0]?.clave ?? null);

  useEffect(() => {
    filaSeleccionada.current?.scrollIntoView({ block: 'nearest' });
  }, [elegida]);

  /**
   * Mueve la selección si el foco está en la tabla.
   *
   * @param direccion - `1` abajo, `-1` arriba.
   * @returns Manejador del atajo.
   */
  const mover =
    (direccion: 1 | -1): (() => boolean) =>
    () => {
      if (!contenedor.current?.contains(document.activeElement) || datos.length === 0) {
        return false;
      }
      const indice = datos.findIndex((f) => f.clave === elegida);
      const destino = datos[Math.min(Math.max(indice + direccion, 0), datos.length - 1)];
      if (destino) props.alSeleccionar(destino.clave);
      return true;
    };

  useAtajos({ moverAbajo: mover(1), moverArriba: mover(-1) }, { activo: activa });

  return (
    <div
      className="tabla-contenedor reporte__tabla"
      ref={contenedor}
      tabIndex={0}
      {...{ [ATRIBUTO_FLECHAS_PROPIAS]: '', [ATRIBUTO_FOCO_INICIAL]: '' }}
    >
      <table className="tabla tabla--seleccionable">
        <thead>
          <tr>
            {props.columnas.map((c) => (
              <th key={c.titulo} className={c.clase}>
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.filas.length === 0 && (
            <tr>
              <td className="tabla__vacia" colSpan={props.columnas.length}>
                {props.textoVacio}
              </td>
            </tr>
          )}
          {props.filas.map((f) => {
            const seleccionada = f.tipo === 'dato' && f.clave === elegida;
            const clases = [
              f.tipo === 'grupo' ? 'fila-grupo' : '',
              f.tipo === 'subtotal' || f.tipo === 'total' ? f.tipo : '',
              f.clase ?? '',
              seleccionada ? 'fila--seleccionada' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <tr
                key={f.clave}
                ref={seleccionada ? filaSeleccionada : undefined}
                className={clases || undefined}
                onClick={f.tipo === 'dato' ? () => props.alSeleccionar(f.clave) : undefined}
              >
                {f.celdas.map((c, i) => (
                  <td key={i} className={c.clase} colSpan={c.columnas}>
                    {c.contenido}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
