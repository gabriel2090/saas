import type { ReactNode } from 'react';
import { IconoInterfaz, type NombreIconoInterfaz } from './Icono';

/**
 * Tipo de aviso: define color e ícono (ver docs/DISENO.md §6.6).
 */
export type TipoAviso = 'error' | 'exito' | 'alerta';

/**
 * Ícono de cada tipo de aviso.
 */
const ICONOS: Readonly<Record<TipoAviso, NombreIconoInterfaz>> = {
  error: 'error',
  exito: 'exito',
  alerta: 'alerta',
};

/**
 * Propiedades de {@link Aviso}.
 */
interface PropiedadesAviso {
  /** Tipo de aviso. */
  tipo: TipoAviso;
  /** Texto del aviso. */
  children: ReactNode;
}

/**
 * Recuadro de aviso dentro de un formulario: rojo (error), verde (éxito) o
 * ámbar (alerta: se puede continuar, pero conviene revisar).
 *
 * @param props - Propiedades del componente.
 * @returns El aviso.
 */
export function Aviso({ tipo, children }: PropiedadesAviso): ReactNode {
  return (
    <p className={`aviso aviso--${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>
      <IconoInterfaz nombre={ICONOS[tipo]} clase="aviso__icono" />
      <span>{children}</span>
    </p>
  );
}
