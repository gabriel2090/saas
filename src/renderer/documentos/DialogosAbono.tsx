import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { LARGO_MAXIMO_OBSERVACION } from '../../domain/abonos';
import type { AbonoResumen } from '../../shared/abonos';
import { formatearFecha } from '../../shared/formato/fechas';
import { formatearPesos } from '../../shared/formato/moneda';
import { useAtajos } from '../atajos/useAtajos';
import { Aviso } from '../componentes/Aviso';
import { invocar } from '../servicios/api';

/**
 * Guarda el elemento con el foco al abrir un diálogo y lo devuelve al cerrar.
 *
 * @param enfocar - Elemento que recibe el foco al abrir.
 */
function useFocoDialogo(enfocar: () => HTMLElement | null): void {
  const enfocarRef = useRef(enfocar);
  useEffect(() => {
    const anterior = document.activeElement;
    enfocarRef.current()?.focus();
    return () => {
      if (anterior instanceof HTMLElement && anterior.isConnected) {
        anterior.focus();
      }
    };
  }, []);
}

/**
 * Propiedades de {@link DialogoAbonoGuardado}.
 */
interface PropiedadesAbonoGuardado {
  /** Número del abono. */
  numero: number;
  /** Valor del abono. */
  valor: number;
  /** Imprime el recibo original. */
  alImprimir: () => Promise<string | null>;
  /** Cierra el diálogo. */
  alCerrar: () => void;
}

/**
 * Diálogo «Abono N guardado» con «Imprimir recibo» y «Cerrar» (D-63). El
 * recibo que se imprime desde aquí es el original. Esc cierra.
 *
 * @param props - Propiedades del componente.
 * @returns El diálogo modal.
 */
export function DialogoAbonoGuardado({
  numero,
  valor,
  alImprimir,
  alCerrar,
}: PropiedadesAbonoGuardado): ReactNode {
  const botonImprimir = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useFocoDialogo(() => botonImprimir.current);
  useAtajos({ retroceder: alCerrar }, { prioridad: 'modal' });

  const imprimir = async (): Promise<void> => {
    setOcupado(true);
    const fallo = await alImprimir();
    setOcupado(false);
    setError(fallo);
  };

  return (
    <div className="capa-modal" role="presentation">
      <div
        className="dialogo"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="abono-guardado-titulo"
      >
        <div className="dialogo__titulo" id="abono-guardado-titulo">
          Abono {numero} guardado
        </div>
        <p className="dialogo__mensaje">
          Se registró el abono {numero} por {formatearPesos(valor)} y se descontó de la deuda del
          proveedor.
        </p>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="dialogo__botones">
          <button
            ref={botonImprimir}
            type="button"
            className="boton boton--primario"
            disabled={ocupado}
            onClick={() => void imprimir()}
          >
            Imprimir recibo
          </button>
          <button type="button" className="boton" onClick={alCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Propiedades de {@link DialogoAnularAbono}.
 */
interface PropiedadesAnularAbono {
  /** Abono a anular. */
  abono: AbonoResumen;
  /** Se llama después de anular. */
  alAnular: () => void;
  /** Se llama al cancelar. */
  alCancelar: () => void;
}

/**
 * Diálogo para anular un abono (D-62): dice cómo queda el saldo de cada
 * compra afectada y pide un motivo opcional. Esc cancela; el foco inicial
 * queda en «Cancelar» para que un Enter accidental no anule.
 *
 * @param props - Propiedades del componente.
 * @returns El diálogo modal.
 */
export function DialogoAnularAbono({
  abono,
  alAnular,
  alCancelar,
}: PropiedadesAnularAbono): ReactNode {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const botonCancelar = useRef<HTMLButtonElement>(null);
  useFocoDialogo(() => botonCancelar.current);
  useAtajos({ retroceder: alCancelar }, { prioridad: 'modal' });

  const anular = async (evento: FormEvent): Promise<void> => {
    evento.preventDefault();
    setOcupado(true);
    const r = await invocar('abonos:anular', { id: abono.id, motivo });
    setOcupado(false);
    if (!r.ok) {
      setError(r.error.mensaje);
      return;
    }
    alAnular();
  };

  return (
    <div className="capa-modal" role="presentation">
      <form
        className="dialogo dialogo--formulario"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="anular-abono-titulo"
        onSubmit={(e) => void anular(e)}
      >
        <div className="dialogo__titulo" id="anular-abono-titulo">
          Anular el abono {abono.numero}
        </div>
        <div className="dialogo__cuerpo">
          <p className="dialogo__mensaje">
            El abono {abono.numero} del {formatearFecha(abono.fecha)} por{' '}
            {formatearPesos(abono.valor)} quedará anulado (no se borra) y su valor vuelve a la
            deuda:
          </p>
          <ul className="dialogo__lista">
            {abono.aplicaciones.map((a) => (
              <li key={a.facturaId}>
                Compra {a.compraNumero} ({a.numeroProveedor}): el saldo pasa de{' '}
                {formatearPesos(a.saldoActual)} a{' '}
                <strong>{formatearPesos(a.saldoActual + a.valor)}</strong>.
              </li>
            ))}
          </ul>
          <label className="campo">
            <span>Motivo (opcional)</span>
            <textarea
              rows={2}
              value={motivo}
              maxLength={LARGO_MAXIMO_OBSERVACION}
              placeholder="Por ejemplo: el pago no se hizo"
              onChange={(e) => {
                setMotivo(e.target.value);
                setError(null);
              }}
            />
            <span className="campo__ayuda">Queda en el historial de cambios.</span>
          </label>
          {error && <Aviso tipo="error">{error}</Aviso>}
        </div>
        <div className="dialogo__botones">
          <button type="submit" className="boton boton--peligro" disabled={ocupado}>
            Anular abono
          </button>
          <button ref={botonCancelar} type="button" className="boton" onClick={alCancelar}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
