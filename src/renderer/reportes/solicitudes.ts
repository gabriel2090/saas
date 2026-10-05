/**
 * Canal para que una ventana pida a otra mostrar un dato (p. ej. «Ver
 * kardex» desde el inventario valorizado o «Estado de cuenta» desde las
 * cuentas por cobrar).
 *
 * @template T - Lo que se pide mostrar.
 */
export interface CanalSolicitudes<T> {
  /**
   * Pide mostrar el dato. Si la ventana destino ya está abierta lo recibe
   * enseguida; si no, lo toma al abrirse con `tomar`.
   */
  pedir: (solicitud: T) => void;
  /** Toma (y borra) la solicitud pendiente, al abrir la ventana destino. */
  tomar: () => T | null;
  /** Escucha las solicitudes mientras la ventana destino está abierta; devuelve cómo dejar de escuchar. */
  escuchar: (oyente: (solicitud: T) => void) => () => void;
}

/**
 * Crea un canal de solicitudes entre ventanas.
 *
 * @template T - Lo que se pide mostrar.
 * @returns El canal.
 *
 * @example
 * const canal = crearCanalSolicitudes<number>();
 * canal.pedir(5);   // nadie escucha: queda pendiente
 * canal.tomar();    // 5
 */
export function crearCanalSolicitudes<T>(): CanalSolicitudes<T> {
  let pendiente: T | null = null;
  const oyentes = new Set<(solicitud: T) => void>();
  return {
    pedir(solicitud) {
      if (oyentes.size === 0) {
        pendiente = solicitud;
        return;
      }
      pendiente = null;
      for (const oyente of oyentes) oyente(solicitud);
    },
    tomar() {
      const solicitud = pendiente;
      pendiente = null;
      return solicitud;
    },
    escuchar(oyente) {
      oyentes.add(oyente);
      return () => {
        oyentes.delete(oyente);
      };
    },
  };
}
