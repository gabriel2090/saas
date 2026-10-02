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
  return <TrazoLineal trazo={TRAZOS[proceso] ?? TRAZO_GENERICO} clase="icono" />;
}

/**
 * Íconos de interfaz (avisos y estados), del mismo set lineal que los de la barra.
 */
export type NombreIconoInterfaz = 'alerta' | 'error' | 'exito';

/**
 * Trazos SVG (lienzo de 24×24) de los íconos de interfaz.
 */
const TRAZOS_INTERFAZ: Readonly<Record<NombreIconoInterfaz, string>> = {
  alerta: 'M12 3l10 18H2zM12 10v5M12 18v.01',
  error: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M9 9l6 6M15 9l-6 6',
  exito: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M8 12l3 3 5-6',
};

/**
 * Propiedades de {@link IconoInterfaz}.
 */
interface PropiedadesIconoInterfaz {
  /** Ícono a dibujar. */
  nombre: NombreIconoInterfaz;
  /** Clase CSS (define el tamaño). */
  clase?: string;
}

/**
 * Ícono lineal de interfaz (p. ej. el triángulo de alerta de los avisos).
 *
 * @param props - Propiedades del componente.
 * @returns El SVG del ícono.
 */
export function IconoInterfaz({ nombre, clase = 'icono' }: PropiedadesIconoInterfaz): ReactNode {
  return <TrazoLineal trazo={TRAZOS_INTERFAZ[nombre]} clase={clase} />;
}

/**
 * Propiedades de {@link TrazoLineal}.
 */
interface PropiedadesTrazoLineal {
  /** Trazo SVG en un lienzo de 24×24. */
  trazo: string;
  /** Clase CSS del SVG. */
  clase: string;
}

/**
 * Dibuja un trazo con el estilo común de todos los íconos (línea de 1.7, puntas redondeadas).
 *
 * @param props - Propiedades del componente.
 * @returns El SVG.
 */
function TrazoLineal({ trazo, clase }: PropiedadesTrazoLineal): ReactNode {
  return (
    <svg
      className={clase}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={trazo} />
    </svg>
  );
}
