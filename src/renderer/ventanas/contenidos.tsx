import type { ComponentType, ReactNode } from 'react';
import type { IdProceso } from '../../shared/procesos';
import { AbonoProveedor } from '../pantallas/AbonoProveedor';
import { AjustesInventario } from '../pantallas/AjustesInventario';
import { CambiarContrasena } from '../pantallas/CambiarContrasena';
import { Catalogos } from '../pantallas/Catalogos';
import { DatosNegocio } from '../pantallas/DatosNegocio';
import { FacturaProveedor } from '../pantallas/FacturaProveedor';
import { Facturar } from '../pantallas/Facturar';
import { Importador } from '../pantallas/Importador';
import { PendienteFase } from '../pantallas/PendienteFase';
import { Productos } from '../pantallas/Productos';
import { Terceros } from '../pantallas/Terceros';

/**
 * Componente que se muestra dentro de la ventana de cada proceso. Los
 * procesos de fases futuras usan {@link PendienteFase} hasta que se entreguen.
 */
const CONTENIDOS: Partial<Record<IdProceso, ComponentType>> = {
  productos: Productos,
  clientes: (): ReactNode => <Terceros clase="cliente" />,
  proveedores: (): ReactNode => <Terceros clase="proveedor" />,
  bodegas: (): ReactNode => <Catalogos tipo="bodega" />,
  'formas-pago': (): ReactNode => <Catalogos tipo="forma-pago" />,
  'datos-negocio': DatosNegocio,
  importador: Importador,
  'cambiar-contrasena': CambiarContrasena,
  'factura-proveedor': FacturaProveedor,
  'abono-proveedor': AbonoProveedor,
  'ajustes-inventario': AjustesInventario,
  facturar: Facturar,
};

/**
 * Devuelve el componente de contenido de un proceso.
 *
 * @param id - Proceso.
 * @returns Componente a mostrar en su ventana.
 */
export function contenidoDeProceso(id: IdProceso): ComponentType {
  return CONTENIDOS[id] ?? PendienteFase;
}
