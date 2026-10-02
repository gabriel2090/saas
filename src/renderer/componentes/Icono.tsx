import type { ReactNode } from 'react';
import type { IdProceso } from '../../shared/procesos';

/**
 * Trazos SVG (lienzo de 24×24) de los íconos de la barra. Los procesos sin
 * trazo propio usan el ícono genérico de documento.
 */
const TRAZOS: Partial<Record<IdProceso, string>> = {
  facturar: 'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4',
  'factura-proveedor': 'M3 7h13v10H3zM16 10h3l2 3v4h-5zM7 19a2 2 0 1 0 0-.01M17 19a2 2 0 1 0 0-.01',
  'abono-cliente': 'M2 7h20v10H2zM12 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M5 10v4M19 10v4',
  'abono-proveedor': 'M2 7h20v10H2zM8 12h8M13 9l3 3-3 3',
  productos: 'M12 2l9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10',
  clientes: 'M12 8m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M4 21c0-4 4-6 8-6s8 2 8 6',
  proveedores: 'M3 21V9l6-4v4l6-4v4l6-4v16zM7 17h2M11 17h2M15 17h2',
  reimpresiones: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z',
  'cambiar-contrasena': 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
};

/**
 * Trazo genérico (documento) para procesos sin ícono propio.
 */
const TRAZO_GENERICO = 'M6 2h9l5 5v15H6zM15 2v5h5';

/**
 * Propiedades de {@link Icono}.
 */
interface PropiedadesIcono {
  /** Proceso cuyo ícono se dibuja. */
  proceso: IdProceso;
}

/**
 * Ícono lineal de un proceso.
 *
 * @param props - Propiedades del componente.
 * @returns El SVG del ícono.
 */
export function Icono({ proceso }: PropiedadesIcono): ReactNode {
  return (
    <svg
      className="icono"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={TRAZOS[proceso] ?? TRAZO_GENERICO} />
    </svg>
  );
}
