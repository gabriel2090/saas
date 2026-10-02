import { Component, type ErrorInfo, type ReactNode } from 'react';
import { registrarErrorRenderer } from '../servicios/api';

/**
 * Propiedades de {@link LimiteErrores}.
 */
interface PropiedadesLimiteErrores {
  /** Contenido protegido. */
  children: ReactNode;
}

/**
 * Estado de {@link LimiteErrores}.
 */
interface EstadoLimiteErrores {
  /** Si ocurrió un error al dibujar la interfaz. */
  conError: boolean;
}

/**
 * Captura los errores de dibujo de React: muestra un mensaje en español y
 * envía el detalle técnico al log local.
 */
export class LimiteErrores extends Component<PropiedadesLimiteErrores, EstadoLimiteErrores> {
  override state: EstadoLimiteErrores = { conError: false };

  /**
   * Marca el estado de error para mostrar el mensaje.
   *
   * @returns Estado nuevo.
   */
  static getDerivedStateFromError(): EstadoLimiteErrores {
    return { conError: true };
  }

  /**
   * Registra el error en el log local.
   *
   * @param error - Error capturado.
   * @param info - Pila de componentes.
   */
  override componentDidCatch(error: Error, info: ErrorInfo): void {
    registrarErrorRenderer(`interfaz${info.componentStack ?? ''}`, error);
  }

  /**
   * Dibuja el contenido o el mensaje de error.
   *
   * @returns Contenido o mensaje.
   */
  override render(): ReactNode {
    if (this.state.conError) {
      return (
        <div className="error-fatal" role="alert">
          <h1>Ocurrió un error en la pantalla</h1>
          <p>
            El detalle quedó guardado en el registro del sistema. Los datos ya guardados no se
            perdieron.
          </p>
          <button
            type="button"
            className="boton boton--primario"
            onClick={() => window.location.reload()}
          >
            Recargar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
