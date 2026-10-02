import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { formatearPesos, leerPesos } from '../../shared/formato/moneda';
import type { ProductoDetalle } from '../../shared/maestros';
import { useAtajos } from '../atajos/useAtajos';
import { Aviso } from '../componentes/Aviso';
import { invocar } from '../servicios/api';

/**
 * Propiedades de {@link DialogoCorregirCosto}.
 */
interface PropiedadesDialogoCorregirCosto {
  /** Producto a corregir. */
  producto: ProductoDetalle;
  /** Se llama con el producto actualizado al guardar. */
  alGuardar: (producto: ProductoDetalle) => void;
  /** Se llama al cancelar. */
  alCancelar: () => void;
}

/**
 * Diálogo para corregir a mano el costo de un producto, con motivo
 * obligatorio que queda en el historial (D-35). Esc cancela.
 *
 * @param props - Propiedades del componente.
 * @returns El diálogo modal.
 */
export function DialogoCorregirCosto({
  producto,
  alGuardar,
  alCancelar,
}: PropiedadesDialogoCorregirCosto): ReactNode {
  const [costo, setCosto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const campoCosto = useRef<HTMLInputElement>(null);
  const focoAnterior = useRef<Element | null>(null);

  useEffect(() => {
    focoAnterior.current = document.activeElement;
    campoCosto.current?.focus();
    return () => {
      if (focoAnterior.current instanceof HTMLElement && focoAnterior.current.isConnected) {
        focoAnterior.current.focus();
      }
    };
  }, []);

  useAtajos({ retroceder: alCancelar }, { prioridad: 'modal' });

  const guardar = async (evento: FormEvent): Promise<void> => {
    evento.preventDefault();
    const valor = leerPesos(costo);
    if (valor === null) {
      setError('Escriba el costo nuevo en pesos, sin centavos (por ejemplo 13,200).');
      return;
    }
    setGuardando(true);
    const resultado = await invocar('productos:corregirCosto', {
      codigo: producto.codigo,
      costo: valor,
      motivo,
    });
    setGuardando(false);
    if (!resultado.ok) {
      setError(resultado.error.mensaje);
      return;
    }
    alGuardar(resultado.datos);
  };

  return (
    <div className="capa-modal" role="presentation">
      <form
        className="dialogo dialogo--formulario"
        role="dialog"
        aria-modal="true"
        aria-labelledby="corregir-costo-titulo"
        onSubmit={(e) => void guardar(e)}
      >
        <div className="dialogo__titulo" id="corregir-costo-titulo">
          Corregir costo · {producto.codigo} - {producto.nombre}
        </div>
        <div className="dialogo__cuerpo">
          <label className="campo campo--num">
            <span>Costo actual</span>
            <input value={formatearPesos(producto.costo)} readOnly tabIndex={-1} />
          </label>
          <label className="campo campo--num">
            <span>Costo nuevo ($) *</span>
            <input
              ref={campoCosto}
              value={costo}
              inputMode="numeric"
              onChange={(e) => {
                setCosto(e.target.value);
                setError(null);
              }}
            />
          </label>
          <label className="campo">
            <span>Motivo *</span>
            <textarea
              rows={2}
              value={motivo}
              placeholder="Por ejemplo: el costo inicial se digitó mal"
              onChange={(e) => {
                setMotivo(e.target.value);
                setError(null);
              }}
            />
            <span className="campo__ayuda">
              Queda en el historial de cambios. Las facturas de proveedor actualizan el costo solas.
            </span>
          </label>
          {error && <Aviso tipo="error">{error}</Aviso>}
        </div>
        <div className="dialogo__botones">
          <button type="submit" className="boton boton--primario" disabled={guardando}>
            Guardar
          </button>
          <button type="button" className="boton" onClick={alCancelar}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
