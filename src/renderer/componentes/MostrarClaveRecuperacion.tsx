import { useEffect, useRef, useState, type ReactNode } from 'react';
import { invocar } from '../servicios/api';
import { Aviso } from './Aviso';

/**
 * Propiedades de {@link MostrarClaveRecuperacion}.
 */
interface PropiedadesMostrarClave {
  /** Clave recién generada. */
  clave: string;
  /** Se llama cuando el usuario confirma que la guardó. */
  alConfirmar: () => void;
}

/**
 * Muestra la clave de recuperación una sola vez (D-22): botón «Copiar» y una
 * casilla obligatoria «Ya la guardé» antes de continuar.
 *
 * @param props - Propiedades del componente.
 * @returns El bloque con la clave.
 */
export function MostrarClaveRecuperacion({
  clave,
  alConfirmar,
}: PropiedadesMostrarClave): ReactNode {
  const [guardada, setGuardada] = useState(false);
  const [copiada, setCopiada] = useState(false);
  const botonCopiar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    botonCopiar.current?.focus();
  }, []);

  const copiar = async (): Promise<void> => {
    const resultado = await invocar('sistema:copiarTexto', clave);
    setCopiada(resultado.ok);
  };

  return (
    <>
      <p>
        Guarde esta clave en un lugar seguro, fuera del computador (por ejemplo, escrita en papel).
        Sirve para poner una contraseña nueva si olvida la actual.{' '}
        <strong>No se volverá a mostrar.</strong>
      </p>
      <div className="clave-recuperacion">{clave}</div>
      <div className="formulario__acciones">
        <button ref={botonCopiar} type="button" className="boton" onClick={() => void copiar()}>
          Copiar
        </button>
      </div>
      {copiada && <Aviso tipo="exito">Clave copiada al portapapeles.</Aviso>}
      <Aviso tipo="alerta">
        La clave sirve una sola vez: al usarla se genera y se muestra una nueva.
      </Aviso>
      <label className="casilla">
        <input type="checkbox" checked={guardada} onChange={(e) => setGuardada(e.target.checked)} />
        Ya la guardé en un lugar seguro
      </label>
      <button
        type="button"
        className="boton boton--primario boton--ancho"
        disabled={!guardada}
        onClick={alConfirmar}
      >
        Continuar
      </button>
    </>
  );
}
