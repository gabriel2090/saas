import type { ReactNode } from 'react';
import type { DisenoOrganizar } from './zonas';

/**
 * Columnas y filas de la cuadrícula de cada diseño con celdas.
 */
const CUADRICULAS: Readonly<
  Record<Exclude<DisenoOrganizar, 'cascada'>, { columnas: string; filas: string; celdas: number }>
> = {
  'dos-columnas': { columnas: '1fr 1fr', filas: '1fr', celdas: 2 },
  'tres-columnas': { columnas: '1fr 1fr 1fr', filas: '1fr', celdas: 3 },
  'dos-por-dos': { columnas: '1fr 1fr', filas: '1fr 1fr', celdas: 4 },
};

/**
 * Propiedades de {@link Miniatura}.
 */
interface PropiedadesMiniatura {
  /** Diseño que se dibuja. */
  diseno: DisenoOrganizar;
  /** Celda resaltada, o `null`. */
  elegida?: number | null;
  /** Tamaño chico (menú) o normal (tira de arrastre). */
  enMenu?: boolean;
  /**
   * Si las celdas se marcan con `data-celda` para soltar una ventana sobre
   * ellas (tira «Suelte sobre una zona»).
   */
  soltable?: boolean;
}

/**
 * Dibujo pequeño de un diseño de «Organizar» (`DISENO.md` §11.3).
 *
 * @param props - Propiedades del componente.
 * @returns La miniatura.
 */
export function Miniatura({
  diseno,
  elegida = null,
  enMenu = false,
  soltable = false,
}: PropiedadesMiniatura): ReactNode {
  const clase = `miniatura${enMenu ? ' miniatura--menu' : ''}`;
  if (diseno === 'cascada') {
    return (
      <div className={`${clase} miniatura--cascada`} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    );
  }
  const { columnas, filas, celdas } = CUADRICULAS[diseno];
  return (
    <div
      className={clase}
      style={{ gridTemplateColumns: columnas, gridTemplateRows: filas }}
      aria-hidden="true"
    >
      {Array.from({ length: celdas }, (_, indice) => (
        <i
          key={indice}
          className={indice === elegida ? 'miniatura__elegida' : undefined}
          {...(soltable ? { 'data-celda': `${diseno}:${indice}` } : {})}
        />
      ))}
    </div>
  );
}
