import { aIsoLocal } from '../../shared/formato/fechas';
import type { DocumentoImprimible } from '../../shared/impresion';
import { reciboAbonoProveedor } from '../impresion/plantillas';
import type { ServicioAbonos } from './abonos';
import type { ServicioNegocio } from './negocio';

/**
 * Servicio que arma el HTML de los documentos imprimibles a partir de lo
 * guardado (D-72): la pantalla solo indica qué documento quiere.
 */
export interface ServicioImpresion {
  /**
   * Arma el documento HTML.
   *
   * @param documento - Tipo, id y si es reimpresión.
   * @returns Documento HTML completo.
   * @throws {ErrorDeNegocio} Si el documento no existe.
   */
  html(documento: DocumentoImprimible): string;
  /**
   * Nombre de archivo sugerido para el PDF.
   *
   * @param documento - Tipo e id.
   * @returns Nombre como `Recibo de abono 8.pdf`.
   * @throws {ErrorDeNegocio} Si el documento no existe.
   */
  nombreArchivo(documento: DocumentoImprimible): string;
}

/**
 * Dependencias del servicio de impresión.
 */
export interface DependenciasImpresion {
  /** Datos del negocio para el encabezado. */
  negocio: ServicioNegocio;
  /** Abonos a proveedor. */
  abonos: ServicioAbonos;
  /** Reloj (inyectable en pruebas). */
  reloj?: () => string;
}

/**
 * Crea el servicio de impresión.
 *
 * @param dependencias - Servicios de los que lee los documentos.
 * @returns El servicio.
 */
export function crearServicioImpresion(dependencias: DependenciasImpresion): ServicioImpresion {
  const reloj = dependencias.reloj ?? aIsoLocal;
  return {
    html: (documento) =>
      reciboAbonoProveedor({
        negocio: dependencias.negocio.obtener(),
        abono: dependencias.abonos.obtener(documento.id),
        reimpresion: documento.reimpresion,
        impresoEn: reloj(),
      }),
    nombreArchivo: (documento) =>
      `Recibo de abono ${dependencias.abonos.obtener(documento.id).numero}.pdf`,
  };
}
