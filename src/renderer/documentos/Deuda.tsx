import type { ReactNode } from 'react';
import type { ResumenDeuda } from '../../shared/compras';
import { formatearPesos } from '../../shared/formato/moneda';

/**
 * Propiedades de {@link Deuda}.
 */
interface PropiedadesDeuda {
  /** Deuda del proveedor, o `null` si no hay proveedor elegido. */
  deuda: ResumenDeuda | null;
}

/**
 * Recuadro con la deuda actual del proveedor y la parte vencida (§6, §8).
 *
 * @param props - Propiedades del componente.
 * @returns El recuadro.
 */
export function Deuda({ deuda }: PropiedadesDeuda): ReactNode {
  return (
    <div className="deuda" aria-live="polite">
      <span>Deuda actual</span>
      <strong>{deuda ? formatearPesos(deuda.total) : '—'}</strong>
      {deuda && deuda.vencido > 0 && (
        <span className="texto-error">Vencido: {formatearPesos(deuda.vencido)}</span>
      )}
    </div>
  );
}
