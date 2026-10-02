import { aIsoLocal } from '../../shared/formato/fechas';
import type { DocumentoImprimible } from '../../shared/impresion';
import { reciboAbonoProveedor } from '../impresion/plantillas';
import { tirillaFactura } from '../impresion/tirilla';
import type { ServicioAbonos } from './abonos';
import type { ServicioNegocio } from './negocio';
import type { ServicioVentas } from './ventas';

/**
 * Formato de papel de un documento: hoja carta con diálogo de Windows, o
 * tirilla de 80 mm en la impresora térmica (D-88).
 */
export type FormatoImpresion = 'carta' | 'tirilla';

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
  /**
   * Formato de papel en que se imprime el documento.
   *
   * @param documento - Tipo de documento.
   * @returns `carta` o `tirilla`.
   */
  formato(documento: DocumentoImprimible): FormatoImpresion;
}

/**
 * Dependencias del servicio de impresión.
 */
export interface DependenciasImpresion {
  /** Datos del negocio para el encabezado. */
  negocio: ServicioNegocio;
  /** Abonos a proveedor. */
  abonos: ServicioAbonos;
  /** Facturas de venta. */
  ventas: ServicioVentas;
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
    html: (documento) => {
      const negocio = dependencias.negocio.obtener();
      switch (documento.tipo) {
        case 'abono-proveedor':
          return reciboAbonoProveedor({
            negocio,
            abono: dependencias.abonos.obtener(documento.id),
            reimpresion: documento.reimpresion,
            impresoEn: reloj(),
          });
        case 'factura-cliente':
          return tirillaFactura({
            negocio,
            factura: dependencias.ventas.obtener(documento.id),
            reimpresion: documento.reimpresion,
          });
      }
    },
    nombreArchivo: (documento) => {
      switch (documento.tipo) {
        case 'abono-proveedor':
          return `Recibo de abono ${dependencias.abonos.obtener(documento.id).numero}.pdf`;
        case 'factura-cliente':
          return `Factura ${dependencias.ventas.obtener(documento.id).numero}.pdf`;
      }
    },
    formato: (documento) => (documento.tipo === 'factura-cliente' ? 'tirilla' : 'carta'),
  };
}
