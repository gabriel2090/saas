import type { BaseDeDatos } from '../../data/conexion';
import { buscarDocumentosReimpresion } from '../../data/repositorios/reimpresiones.repo';
import { esFechaValida } from '../../domain/calendario';
import { ErrorDeNegocio } from '../../domain/errores';
import {
  MAXIMO_RESULTADOS_REIMPRESION,
  type PeticionBuscarReimpresion,
  type ResultadoBuscarReimpresion,
} from '../../shared/reimpresiones';

/**
 * Servicio de la ventana de Reimpresiones (§9.3). Solo consulta: ver e
 * imprimir van por el servicio de impresión con `reimpresion: true`.
 */
export interface ServicioReimpresiones {
  /**
   * Busca documentos para reimprimir.
   *
   * @param peticion - Tipo, texto y rango de días.
   * @returns Hasta {@link MAXIMO_RESULTADOS_REIMPRESION} documentos, del más reciente al más antiguo.
   * @throws {ErrorDeNegocio} Si una fecha no existe o el rango está al revés.
   */
  buscar(peticion: PeticionBuscarReimpresion): ResultadoBuscarReimpresion;
}

/**
 * Verifica una fecha del rango.
 *
 * @param fecha - `AAAA-MM-DD` o `null`.
 * @param campo - «Desde» o «Hasta», para el mensaje.
 * @throws {ErrorDeNegocio} Si la fecha no existe.
 */
function validarFecha(fecha: string | null, campo: string): void {
  if (fecha !== null && !esFechaValida(fecha)) {
    throw new ErrorDeNegocio(
      'VALIDACION',
      `La fecha «${campo}» no es válida. Escríbala como dd/mm/aaaa o déjela vacía.`,
    );
  }
}

/**
 * Crea el servicio de reimpresiones.
 *
 * @param db - Conexión abierta.
 * @returns El servicio.
 */
export function crearServicioReimpresiones(db: BaseDeDatos): ServicioReimpresiones {
  return {
    buscar(peticion) {
      validarFecha(peticion.desde, 'Desde');
      validarFecha(peticion.hasta, 'Hasta');
      if (peticion.desde !== null && peticion.hasta !== null && peticion.desde > peticion.hasta) {
        throw new ErrorDeNegocio(
          'VALIDACION',
          'La fecha «Desde» es posterior a «Hasta». Corrija el rango para buscar.',
        );
      }
      // Se pide uno de más para saber si la lista quedó cortada.
      const documentos = buscarDocumentosReimpresion(
        db,
        { ...peticion, texto: peticion.texto.trim() },
        MAXIMO_RESULTADOS_REIMPRESION + 1,
      );
      return {
        documentos: documentos.slice(0, MAXIMO_RESULTADOS_REIMPRESION),
        truncado: documentos.length > MAXIMO_RESULTADOS_REIMPRESION,
      };
    },
  };
}
