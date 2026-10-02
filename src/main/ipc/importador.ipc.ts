import { ErrorDeNegocio } from '../../domain/errores';
import {
  FORMATOS_NUMERICOS,
  type FilaImportacion,
  type FormatoNumerico,
  type TipoImportacion,
} from '../../shared/importacion';
import type { ServicioImportador } from '../servicios/importador';
import type { RegistrarManejador } from './registrar';
import { exigirArreglo, exigirEntero, exigirObjeto, exigirOpcion, exigirTexto } from './validacion';

/**
 * Tipos de importación aceptados.
 */
const TIPOS: readonly TipoImportacion[] = [
  'productos',
  'clientes',
  'proveedores',
  'stock',
  'saldos-clientes',
  'saldos-proveedores',
];

/**
 * Máximo de filas por archivo: protege la memoria del proceso principal
 * ante un archivo equivocado (p. ej. una hoja con un millón de filas vacías).
 */
const MAXIMO_FILAS = 50_000;

/**
 * Dependencias de los canales del importador.
 */
export interface DependenciasImportador {
  /** Servicio del importador. */
  servicio: ServicioImportador;
  /**
   * Pide al usuario dónde guardar el reporte y lo escribe.
   *
   * @param nombreSugerido - Nombre de archivo propuesto.
   * @param contenido - Bytes del archivo.
   * @returns `true` si se guardó; `false` si el usuario canceló.
   */
  guardarArchivo: (nombreSugerido: string, contenido: Uint8Array) => boolean;
}

/**
 * Lee y verifica la petición de validar o importar.
 *
 * @param valor - Dato recibido.
 * @returns Tipo, formato numérico y filas.
 * @throws {ErrorDeNegocio} Si la forma no es la esperada o hay demasiadas filas.
 */
function leerPeticion(valor: unknown): {
  tipo: TipoImportacion;
  formato: FormatoNumerico;
  filas: FilaImportacion[];
} {
  const d = exigirObjeto(valor);
  const filas = exigirArreglo(d.filas, 'filas');
  if (filas.length > MAXIMO_FILAS) {
    throw new ErrorDeNegocio(
      'VALIDACION',
      `El archivo tiene ${filas.length} filas; el máximo por importación es ${MAXIMO_FILAS}.`,
    );
  }
  return {
    tipo: exigirOpcion(d.tipo, TIPOS, 'tipo de importación'),
    formato: exigirOpcion(
      d.formato,
      FORMATOS_NUMERICOS.map((f) => f.valor),
      'formato numérico',
    ),
    filas: filas.map((f) => {
      const fila = exigirObjeto(f);
      const valores = exigirObjeto(fila.valores);
      const leidos: Record<string, string> = {};
      for (const [clave, texto] of Object.entries(valores)) {
        leidos[clave] = exigirTexto(texto, clave);
      }
      return { numero: exigirEntero(fila.numero, 'número de fila'), valores: leidos };
    }),
  };
}

/**
 * Registra los canales IPC del importador. Todos exigen sesión.
 *
 * @param registrar - Función de registro de manejadores.
 * @param dependencias - Servicio y guardado de archivos.
 */
export function registrarIpcImportador(
  registrar: RegistrarManejador,
  dependencias: DependenciasImportador,
): void {
  registrar('importador:validar', (peticion) => {
    const { tipo, formato, filas } = leerPeticion(peticion);
    return dependencias.servicio.validar(tipo, filas, formato);
  });
  registrar('importador:importar', (peticion) => {
    const { tipo, formato, filas } = leerPeticion(peticion);
    return dependencias.servicio.importar(tipo, filas, formato);
  });
  registrar('importador:guardarReporte', (peticion) => {
    const d = exigirObjeto(peticion);
    if (!(d.contenido instanceof Uint8Array)) {
      throw new ErrorDeNegocio('VALIDACION', 'El contenido del reporte es inválido.');
    }
    return dependencias.guardarArchivo(exigirTexto(d.nombreSugerido, 'nombre'), d.contenido);
  });
}
