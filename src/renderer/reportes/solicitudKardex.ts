import { crearCanalSolicitudes } from './solicitudes';

/**
 * Producto y bodega que otra ventana pide ver en el kardex («Ver kardex»
 * desde el inventario valorizado).
 */
export interface SolicitudKardex {
  /** Código del producto. */
  productoCodigo: number;
  /** Bodega, o `null` para todas. */
  bodegaId: number | null;
}

/** Canal de las solicitudes a la ventana del kardex. */
const canal = crearCanalSolicitudes<SolicitudKardex>();

/**
 * Pide mostrar un producto en el kardex. Si la ventana ya está abierta la
 * recibe enseguida; si no, la toma al abrirse con {@link tomarSolicitudKardex}.
 *
 * @param solicitud - Producto y bodega.
 */
export function pedirKardex(solicitud: SolicitudKardex): void {
  canal.pedir(solicitud);
}

/**
 * Toma (y borra) la solicitud pendiente, al abrir la ventana del kardex.
 *
 * @returns La solicitud, o `null` si no hay.
 */
export function tomarSolicitudKardex(): SolicitudKardex | null {
  return canal.tomar();
}

/**
 * Escucha las solicitudes mientras la ventana del kardex está abierta.
 *
 * @param oyente - Recibe cada solicitud.
 * @returns Función para dejar de escuchar.
 */
export function escucharSolicitudesKardex(
  oyente: (solicitud: SolicitudKardex) => void,
): () => void {
  return canal.escuchar(oyente);
}
