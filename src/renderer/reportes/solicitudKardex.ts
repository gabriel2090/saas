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

/** Solicitud que todavía no atendió la ventana del kardex. */
let pendiente: SolicitudKardex | null = null;

/** Ventanas del kardex abiertas que esperan solicitudes. */
const oyentes = new Set<(solicitud: SolicitudKardex) => void>();

/**
 * Pide mostrar un producto en el kardex. Si la ventana ya está abierta la
 * recibe enseguida; si no, la toma al abrirse con {@link tomarSolicitudKardex}.
 *
 * @param solicitud - Producto y bodega.
 */
export function pedirKardex(solicitud: SolicitudKardex): void {
  if (oyentes.size === 0) {
    pendiente = solicitud;
    return;
  }
  pendiente = null;
  for (const oyente of oyentes) oyente(solicitud);
}

/**
 * Toma (y borra) la solicitud pendiente, al abrir la ventana del kardex.
 *
 * @returns La solicitud, o `null` si no hay.
 */
export function tomarSolicitudKardex(): SolicitudKardex | null {
  const solicitud = pendiente;
  pendiente = null;
  return solicitud;
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
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}
