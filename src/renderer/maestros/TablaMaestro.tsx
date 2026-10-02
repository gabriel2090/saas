import { useEffect, useRef, type ReactNode } from 'react';
import { ATRIBUTO_FLECHAS_PROPIAS, ATRIBUTO_FOCO_INICIAL } from '../atajos/navegacion';
import { useAtajos } from '../atajos/useAtajos';
import { useVentana } from '../ventanas/ContextoVentana';

/**
 * Columna de la lista de un maestro.
 *
 * @template R - Registro de la lista.
 */
export interface ColumnaMaestro<R> {
  /** Encabezado. */
  titulo: string;
  /** Contenido de la celda. */
  valor: (registro: R) => ReactNode;
  /** Clases de la celda y el encabezado (`num`, `col-nombre`…). */
  clase?: string;
  /** Solo se muestra si la ventana se agranda (D-36). */
  extra?: boolean;
  /** Clase adicional de la celda según el registro (p. ej. `texto-error`). */
  claseCelda?: (registro: R) => string;
}

/**
 * Propiedades de {@link TablaMaestro}.
 *
 * @template R - Registro de la lista.
 */
interface PropiedadesTablaMaestro<R> {
  /** Columnas. */
  columnas: readonly ColumnaMaestro<R>[];
  /** Registros visibles. */
  registros: readonly R[];
  /** Clave de cada registro. */
  clave: (registro: R) => number;
  /** Si el registro está activo (los inactivos se ven atenuados). */
  estaActivo: (registro: R) => boolean;
  /** Clave seleccionada. */
  seleccionada: number | null;
  /** Selecciona un registro con el ratón. */
  alSeleccionar: (clave: number) => void;
  /** Mueve la selección con las flechas. */
  alMover: (direccion: 1 | -1) => void;
  /** Enter sobre la lista: pasa a editar la ficha. */
  alAceptar: () => void;
  /** Texto cuando no hay registros. */
  textoVacio: string;
}

/**
 * Lista de un maestro. Con el foco en la lista, flecha arriba/abajo mueven
 * la fila seleccionada y Enter pasa a la ficha (§10).
 *
 * @param props - Propiedades del componente.
 * @returns La tabla.
 */
export function TablaMaestro<R>(props: PropiedadesTablaMaestro<R>): ReactNode {
  const { activa } = useVentana();
  const contenedor = useRef<HTMLDivElement>(null);
  const filaSeleccionada = useRef<HTMLTableRowElement>(null);
  const columnas = props.columnas;

  useEffect(() => {
    filaSeleccionada.current?.scrollIntoView({ block: 'nearest' });
  }, [props.seleccionada]);

  /**
   * Ejecuta la acción solo si el foco está en la lista.
   *
   * @param accion - Acción a ejecutar.
   * @returns `false` si el foco no está en la lista (la tecla sigue su curso).
   */
  const enLista =
    (accion: () => void): (() => boolean) =>
    () => {
      if (!contenedor.current?.contains(document.activeElement)) {
        return false;
      }
      accion();
      return true;
    };

  useAtajos(
    {
      moverAbajo: enLista(() => props.alMover(1)),
      moverArriba: enLista(() => props.alMover(-1)),
      aceptar: enLista(props.alAceptar),
    },
    { activo: activa },
  );

  return (
    <div
      className="tabla-contenedor"
      ref={contenedor}
      tabIndex={0}
      {...{ [ATRIBUTO_FLECHAS_PROPIAS]: '', [ATRIBUTO_FOCO_INICIAL]: '' }}
    >
      <table className="tabla tabla--seleccionable">
        <thead>
          <tr>
            {columnas.map((c) => (
              <th key={c.titulo} className={claseColumna(c)}>
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.registros.length === 0 && (
            <tr>
              <td className="tabla__vacia" colSpan={columnas.length}>
                {props.textoVacio}
              </td>
            </tr>
          )}
          {props.registros.map((registro) => {
            const clave = props.clave(registro);
            const seleccionada = clave === props.seleccionada;
            const clases = [
              seleccionada ? 'fila--seleccionada' : '',
              props.estaActivo(registro) ? '' : 'fila--inactiva',
            ].join(' ');
            return (
              <tr
                key={clave}
                ref={seleccionada ? filaSeleccionada : undefined}
                className={clases.trim()}
                onClick={() => props.alSeleccionar(clave)}
              >
                {columnas.map((c) => (
                  <td
                    key={c.titulo}
                    className={`${claseColumna(c)} ${c.claseCelda?.(registro) ?? ''}`.trim()}
                  >
                    {c.valor(registro)}
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

/**
 * Clases de una columna (incluida la de columna extra).
 *
 * @param columna - Columna.
 * @returns Clases CSS.
 */
function claseColumna<R>(columna: ColumnaMaestro<R>): string {
  return [columna.clase ?? '', columna.extra ? 'col-extra' : ''].join(' ').trim();
}
