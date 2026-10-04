import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { LARGO_MAXIMO_OBSERVACION } from '../../domain/abonos';
import { useAtajos } from '../atajos/useAtajos';
import { Aviso } from '../componentes/Aviso';
import { useFocoDialogo } from './DialogosAbono';
import { useCandado } from './useCandado';

/**
 * Propiedades de {@link DialogoMotivo}.
 */
interface PropiedadesDialogoMotivo {
  /** Título, p. ej. «¿Anular la factura 84772?». */
  titulo: string;
  /** Explicación de lo que pasa al confirmar. */
  children: ReactNode;
  /** Texto del botón rojo, p. ej. «Anular factura». */
  textoAceptar: string;
  /** Ejemplo que se muestra en el campo del motivo. */
  ejemploMotivo: string;
  /**
   * Hace la operación con el motivo escrito.
   *
   * @param motivo - Motivo (puede ser vacío).
   * @returns Mensaje de error para mostrar en el diálogo, o `null` si se hizo.
   */
  alAceptar: (motivo: string) => Promise<string | null>;
  /** Cierra sin hacer nada. */
  alCancelar: () => void;
}

/**
 * Diálogo de confirmación con un motivo opcional, para anular facturas,
 * devoluciones, reintegros y ajustes. El foco inicial queda en «Cancelar»
 * para que un Enter accidental no anule; Esc cancela; el botón rojo no se
 * puede pulsar dos veces mientras la operación está en curso.
 *
 * @param props - Propiedades del componente.
 * @returns El diálogo modal.
 */
export function DialogoMotivo({
  titulo,
  children,
  textoAceptar,
  ejemploMotivo,
  alAceptar,
  alCancelar,
}: PropiedadesDialogoMotivo): ReactNode {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const botonCancelar = useRef<HTMLButtonElement>(null);
  const conCandado = useCandado();
  useFocoDialogo(() => botonCancelar.current);
  useAtajos({ retroceder: alCancelar }, { prioridad: 'modal' });

  const aceptar = (evento: FormEvent): void => {
    evento.preventDefault();
    void conCandado(async () => {
      setOcupado(true);
      const fallo = await alAceptar(motivo);
      setOcupado(false);
      setError(fallo);
    });
  };

  return (
    <div className="capa-modal" role="presentation">
      <form
        className="dialogo dialogo--formulario"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialogo-motivo-titulo"
        onSubmit={aceptar}
      >
        <div className="dialogo__titulo" id="dialogo-motivo-titulo">
          {titulo}
        </div>
        <div className="dialogo__cuerpo">
          {children}
          <label className="campo">
            <span>Motivo (opcional)</span>
            <input
              value={motivo}
              maxLength={LARGO_MAXIMO_OBSERVACION}
              placeholder={`Por ejemplo: ${ejemploMotivo}`}
              onChange={(e) => {
                setMotivo(e.target.value);
                setError(null);
              }}
            />
          </label>
          {error && <Aviso tipo="error">{error}</Aviso>}
        </div>
        <div className="dialogo__botones">
          <button ref={botonCancelar} type="button" className="boton" onClick={alCancelar}>
            Cancelar
          </button>
          <button type="submit" className="boton boton--peligro" disabled={ocupado}>
            {textoAceptar}
          </button>
        </div>
      </form>
    </div>
  );
}
