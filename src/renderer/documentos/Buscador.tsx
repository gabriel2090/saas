import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { claveComparacion } from '../../domain/texto';
import { ATRIBUTO_FLECHAS_PROPIAS } from '../atajos/navegacion';
import { useAtajos } from '../atajos/useAtajos';
import { useVentana } from '../ventanas/ContextoVentana';

/**
 * Máximo de sugerencias visibles: más no se alcanzan a leer y el usuario
 * sigue escribiendo para afinar.
 */
const MAXIMO_SUGERENCIAS = 8;

/**
 * Propiedades de {@link Buscador}.
 *
 * @template R - Registro que se busca.
 */
interface PropiedadesBuscador<R> {
  /** Registros entre los que se busca. */
  registros: readonly R[];
  /** Clave única de cada registro. */
  clave: (registro: R) => number;
  /** Texto del registro en la lista y en el campo una vez elegido. */
  texto: (registro: R) => string;
  /**
   * Si el registro coincide con lo escrito.
   *
   * @param registro - Registro.
   * @param busqueda - Lo escrito, ya pasado por `claveComparacion`.
   */
  coincide: (registro: R, busqueda: string) => boolean;
  /**
   * Si lo escrito identifica exactamente al registro (p. ej. el código):
   * con Enter se elige ese aunque no sea la sugerencia resaltada.
   */
  exacto?: (registro: R, escrito: string) => boolean;
  /** Registro elegido, o `null`. */
  seleccionado: R | null;
  /** Se llama al elegir un registro. */
  alElegir: (registro: R) => void;
  /** Texto de ayuda del campo vacío. */
  ayuda: string;
  /** Si el campo se vacía después de elegir (para agregar líneas una tras otra). */
  vaciarAlElegir?: boolean;
  /** Si la lista se abre hacia arriba (cuando el campo está al pie de una tabla). */
  haciaArriba?: boolean;
  /** Referencia al campo, para enfocarlo desde fuera. */
  campo?: Ref<HTMLInputElement>;
  /** Etiqueta accesible del campo. */
  etiqueta: string;
}

/**
 * Campo de búsqueda con sugerencias: se escribe parte del código o del
 * nombre, flecha arriba/abajo recorren las sugerencias, Enter elige y Esc
 * cierra la lista sin elegir.
 *
 * @template R - Registro que se busca.
 * @param props - Propiedades del componente.
 * @returns El campo con su lista.
 */
export function Buscador<R>({ campo, ...props }: PropiedadesBuscador<R>): ReactNode {
  const { activa } = useVentana();
  const [escrito, setEscrito] = useState<string | null>(null);
  const [resaltada, setResaltada] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);
  const filaResaltada = useRef<HTMLLIElement>(null);

  const busqueda = escrito === null ? '' : claveComparacion(escrito);
  const sugerencias =
    escrito === null || busqueda === ''
      ? []
      : props.registros.filter((r) => props.coincide(r, busqueda)).slice(0, MAXIMO_SUGERENCIAS);
  const abierta = sugerencias.length > 0;

  useEffect(() => {
    filaResaltada.current?.scrollIntoView({ block: 'nearest' });
  }, [resaltada]);

  const elegir = (registro: R): void => {
    setEscrito(props.vaciarAlElegir ? '' : null);
    setResaltada(0);
    props.alElegir(registro);
  };

  /**
   * Ejecuta la acción solo si el foco está en este buscador.
   *
   * @param accion - Acción; devuelve `false` si no hizo nada.
   * @returns Manejador del atajo.
   */
  const conFoco =
    (accion: () => boolean): (() => boolean) =>
    () =>
      contenedor.current?.contains(document.activeElement) === true && accion();

  useAtajos(
    {
      moverAbajo: conFoco(() => {
        if (!abierta) return false;
        setResaltada((i) => Math.min(i + 1, sugerencias.length - 1));
        return true;
      }),
      moverArriba: conFoco(() => {
        if (!abierta) return false;
        setResaltada((i) => Math.max(i - 1, 0));
        return true;
      }),
      aceptar: conFoco(() => {
        const texto = (escrito ?? '').trim();
        const exacto =
          texto !== '' && props.exacto
            ? props.registros.find((r) => props.exacto?.(r, texto))
            : undefined;
        const elegido = exacto ?? sugerencias[resaltada];
        if (!elegido) return false;
        elegir(elegido);
        return true;
      }),
      retroceder: conFoco(() => {
        if (escrito === null || escrito === '') return false;
        setEscrito(props.vaciarAlElegir ? '' : null);
        return true;
      }),
    },
    { activo: activa },
  );

  const valor = escrito ?? (props.seleccionado ? props.texto(props.seleccionado) : '');

  return (
    <div
      className="sugerencias"
      ref={contenedor}
      {...(abierta ? { [ATRIBUTO_FLECHAS_PROPIAS]: '' } : {})}
    >
      <input
        ref={campo}
        value={valor}
        placeholder={props.ayuda}
        aria-label={props.etiqueta}
        aria-expanded={abierta}
        autoComplete="off"
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          setEscrito(e.target.value);
          setResaltada(0);
        }}
        onBlur={() => setEscrito(props.vaciarAlElegir ? '' : null)}
      />
      {abierta && (
        <ul
          className={`sugerencias__lista${props.haciaArriba ? ' sugerencias__lista--arriba' : ''}`}
          role="listbox"
        >
          {sugerencias.map((r, i) => (
            <li
              key={props.clave(r)}
              ref={i === resaltada ? filaResaltada : undefined}
              role="option"
              aria-selected={i === resaltada}
              className={i === resaltada ? 'sugerencias__opcion--resaltada' : undefined}
              // Con mousedown (antes del blur del campo) el clic alcanza a elegir.
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(r);
              }}
            >
              {props.texto(r)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
