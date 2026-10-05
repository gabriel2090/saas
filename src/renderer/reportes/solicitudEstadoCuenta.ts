import type { TipoCartera } from '../../shared/reportes';
import { crearCanalSolicitudes } from './solicitudes';

/**
 * Tercero que otra ventana pide ver en el estado de cuenta («Estado de
 * cuenta», Ctrl+D, desde las cuentas por cobrar y por pagar).
 */
export interface SolicitudEstadoCuenta {
  /** Cliente o proveedor. */
  tipo: TipoCartera;
  /** Código del tercero. */
  terceroCodigo: number;
}

/** Canal de las solicitudes a la ventana del estado de cuenta. */
const canal = crearCanalSolicitudes<SolicitudEstadoCuenta>();

/**
 * Pide mostrar el estado de cuenta de un tercero. Si la ventana ya está
 * abierta la recibe enseguida; si no, la toma al abrirse con
 * {@link tomarSolicitudEstadoCuenta}.
 *
 * @param solicitud - Tipo y tercero.
 */
export function pedirEstadoCuenta(solicitud: SolicitudEstadoCuenta): void {
  canal.pedir(solicitud);
}

/**
 * Toma (y borra) la solicitud pendiente, al abrir la ventana del estado de cuenta.
 *
 * @returns La solicitud, o `null` si no hay.
 */
export function tomarSolicitudEstadoCuenta(): SolicitudEstadoCuenta | null {
  return canal.tomar();
}

/**
 * Escucha las solicitudes mientras la ventana del estado de cuenta está abierta.
 *
 * @param oyente - Recibe cada solicitud.
 * @returns Función para dejar de escuchar.
 */
export function escucharSolicitudesEstadoCuenta(
  oyente: (solicitud: SolicitudEstadoCuenta) => void,
): () => void {
  return canal.escuchar(oyente);
}
