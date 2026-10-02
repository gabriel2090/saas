import type { ReactNode } from 'react';
import { obtenerProceso } from '../../shared/procesos';
import { useVentana } from '../ventanas/ContextoVentana';

/**
 * Contenido provisional de los procesos que se entregan en fases posteriores.
 *
 * @returns Aviso con la fase en la que el proceso estará disponible.
 */
export function PendienteFase(): ReactNode {
  const { id } = useVentana();
  const proceso = obtenerProceso(id);
  return (
    <div className="pendiente">
      <p>
        El proceso <strong>{proceso.titulo}</strong> estará disponible en la{' '}
        <strong>Fase {proceso.fase}</strong>.
      </p>
      <p className="texto-tenue">Presione Esc para cerrar esta ventana.</p>
    </div>
  );
}
