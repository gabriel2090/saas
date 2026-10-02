import type { DocumentoImprimible, TipoDocumentoImprimible } from '../../shared/impresion';
import type { FormatoImpresion, ServicioImpresion } from '../servicios/impresion';
import type { RegistrarManejador } from './registrar';
import { exigirBooleano, exigirEntero, exigirObjeto, exigirOpcion } from './validacion';

/**
 * Tipos de documento imprimibles aceptados.
 */
const TIPOS_DOCUMENTO: readonly TipoDocumentoImprimible[] = ['abono-proveedor', 'factura-cliente'];

/**
 * Dependencias de los canales de impresión.
 */
export interface DependenciasIpcImpresion {
  /** Arma el HTML de los documentos. */
  servicio: ServicioImpresion;
  /**
   * Imprime el documento: en carta con el diálogo de Windows, o la tirilla en
   * la impresora térmica configurada (D-88).
   *
   * @param html - Documento.
   * @param formato - Papel del documento.
   * @returns `true` si se imprimió; `false` si se canceló.
   */
  imprimir: (html: string, formato: FormatoImpresion) => Promise<boolean>;
  /**
   * Genera el PDF y pide dónde guardarlo.
   *
   * @param html - Documento.
   * @param nombreSugerido - Nombre de archivo propuesto.
   * @returns `true` si se guardó; `false` si se canceló.
   */
  guardarPdf: (html: string, nombreSugerido: string) => Promise<boolean>;
}

/**
 * Lee y verifica el documento pedido.
 *
 * @param valor - Dato recibido.
 * @returns Documento con su tipo.
 * @throws {ErrorDeNegocio} Si la forma no es la esperada.
 */
function leerDocumento(valor: unknown): DocumentoImprimible {
  const d = exigirObjeto(valor);
  return {
    tipo: exigirOpcion(d.tipo, TIPOS_DOCUMENTO, 'tipo de documento'),
    id: exigirEntero(d.id, 'documento'),
    reimpresion: exigirBooleano(d.reimpresion, 'reimpresión'),
  };
}

/**
 * Registra los canales de impresión (vista previa, imprimir y PDF). Todos
 * exigen sesión.
 *
 * @param registrar - Función de registro de manejadores.
 * @param dependencias - Servicio e impresora.
 */
export function registrarIpcImpresion(
  registrar: RegistrarManejador,
  dependencias: DependenciasIpcImpresion,
): void {
  const { servicio } = dependencias;
  registrar('impresion:html', (peticion) => servicio.html(leerDocumento(peticion)));
  registrar('impresion:imprimir', (peticion) => {
    const documento = leerDocumento(peticion);
    return dependencias.imprimir(servicio.html(documento), servicio.formato(documento));
  });
  registrar('impresion:pdf', (peticion) => {
    const documento = leerDocumento(peticion);
    return dependencias.guardarPdf(servicio.html(documento), servicio.nombreArchivo(documento));
  });
}
