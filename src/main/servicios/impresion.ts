import { aIsoLocal } from '../../shared/formato/fechas';
import type { DocumentoImprimible } from '../../shared/impresion';
import { reciboAbono } from '../impresion/plantillas';
import { tirillaFactura, tirillaFacturaProveedor, tirillaReciboAbono } from '../impresion/tirilla';
import type { ServicioAbonos } from './abonos';
import type { ServicioCorrecciones } from './correcciones';
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
  /** Abonos de cliente y de proveedor. */
  abonos: ServicioAbonos;
  /** Facturas de venta. */
  ventas: ServicioVentas;
  /** Facturas de proveedor con su cartera y versiones. */
  correcciones: Pick<ServicioCorrecciones, 'obtenerCompra'>;
  /** Reloj (inyectable en pruebas). */
  reloj?: () => string;
}

/**
 * Formato de papel de un documento: las facturas de cliente y de proveedor
 * son tirilla; los recibos de abono, tirilla solo si se pide (D-93, D-143);
 * si no, carta.
 *
 * @param documento - Documento pedido.
 * @returns Formato.
 */
export function formatoDocumento(documento: DocumentoImprimible): FormatoImpresion {
  if (documento.tipo === 'factura-cliente' || documento.tipo === 'factura-proveedor') {
    return 'tirilla';
  }
  return documento.tirilla === true ? 'tirilla' : 'carta';
}

/**
 * Crea el servicio de impresión.
 *
 * @param dependencias - Servicios de los que lee los documentos.
 * @returns El servicio.
 */
export function crearServicioImpresion(dependencias: DependenciasImpresion): ServicioImpresion {
  const reloj = dependencias.reloj ?? aIsoLocal;

  /**
   * Obtiene un abono verificando que sea del tipo pedido (un id de abono de
   * proveedor no debe salir como recibo de cliente, ni al revés).
   *
   * @param documento - Documento pedido.
   * @returns El abono.
   */
  const abonoDe = (documento: DocumentoImprimible): ReturnType<ServicioAbonos['obtener']> => {
    const abono = dependencias.abonos.obtener(documento.id);
    const tipo = documento.tipo === 'abono-cliente' ? 'cliente' : 'proveedor';
    if (abono.tipo !== tipo) {
      throw new Error(`El abono ${documento.id} no es de ${tipo}.`);
    }
    return abono;
  };

  return {
    html: (documento) => {
      const negocio = dependencias.negocio.obtener();
      switch (documento.tipo) {
        case 'abono-proveedor':
        case 'abono-cliente': {
          const abono = abonoDe(documento);
          if (formatoDocumento(documento) === 'tirilla') {
            return tirillaReciboAbono({
              negocio,
              abono,
              deudaActual: dependencias.abonos.contextoTercero(abono.tipo, abono.terceroCodigo)
                .deuda.total,
              reimpresion: documento.reimpresion,
              impresoEn: reloj(),
            });
          }
          return reciboAbono({
            negocio,
            abono,
            reimpresion: documento.reimpresion,
            impresoEn: reloj(),
          });
        }
        case 'factura-cliente':
          return tirillaFactura({
            negocio,
            factura: dependencias.ventas.obtener(documento.id),
            reimpresion: documento.reimpresion,
          });
        case 'factura-proveedor':
          return tirillaFacturaProveedor({
            negocio,
            compra: dependencias.correcciones.obtenerCompra(documento.id),
            reimpresion: documento.reimpresion,
            impresoEn: reloj(),
          });
      }
    },
    nombreArchivo: (documento) => {
      switch (documento.tipo) {
        case 'abono-proveedor':
        case 'abono-cliente':
          return `Recibo de abono ${abonoDe(documento).numero}.pdf`;
        case 'factura-cliente':
          return `Factura ${dependencias.ventas.obtener(documento.id).numero}.pdf`;
        case 'factura-proveedor':
          return `Compra ${dependencias.correcciones.obtenerCompra(documento.id).numero}.pdf`;
      }
    },
    formato: formatoDocumento,
  };
}
