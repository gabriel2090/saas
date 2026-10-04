import { ErrorDeNegocio } from '../../domain/errores';
import { TIPOS_ABONO } from '../../shared/abonos';
import type { ModoDescuento } from '../../shared/compras';
import {
  TIPOS_DEVOLUCION,
  type CambioLineaCompraPedido,
  type CambioLineaVentaPedido,
  type LineaDevolucionPedida,
} from '../../shared/correcciones';
import type { ServicioCorrecciones } from '../servicios/correcciones';
import type { ServicioDevoluciones } from '../servicios/devoluciones';
import type { ServicioSaldoFavor } from '../servicios/saldoFavor';
import type { RegistrarManejador } from './registrar';
import { exigirArreglo, exigirEntero, exigirObjeto, exigirOpcion, exigirTexto } from './validacion';

/**
 * Máximo de líneas de una corrección o una devolución: protege al proceso
 * principal de una petición desproporcionada.
 */
const MAXIMO_LINEAS = 1000;

/**
 * Modos de descuento aceptados.
 */
const MODOS_DESCUENTO: readonly ModoDescuento[] = ['pesos', 'porcentaje'];

/**
 * Servicios que atienden los canales de la Fase 4a.
 */
export interface ServiciosCorrecciones {
  /** Corrección y anulación de facturas. */
  correcciones: ServicioCorrecciones;
  /** Devoluciones de venta y de compra. */
  devoluciones: ServicioDevoluciones;
  /** Saldo a favor y reintegros. */
  saldoFavor: ServicioSaldoFavor;
}

/**
 * Lee un arreglo de objetos con un máximo de elementos.
 *
 * @param valor - Dato recibido.
 * @param campo - Nombre del campo para el mensaje.
 * @returns Los objetos.
 * @throws {ErrorDeNegocio} Si no es un arreglo de objetos o es demasiado largo.
 */
function objetos(valor: unknown, campo: string): Record<string, unknown>[] {
  const arreglo = exigirArreglo(valor, campo);
  if (arreglo.length > MAXIMO_LINEAS) {
    throw new ErrorDeNegocio(
      'VALIDACION',
      `El campo «${campo}» admite máximo ${MAXIMO_LINEAS} elementos.`,
    );
  }
  return arreglo.map((e) => exigirObjeto(e));
}

/**
 * Lee los cambios de una corrección de venta.
 *
 * @param valor - Dato recibido.
 * @returns Cambios con su tipo.
 */
function cambiosVenta(valor: unknown): CambioLineaVentaPedido[] {
  return objetos(valor, 'cambios').map((d) => ({
    renglon: exigirEntero(d.renglon, 'renglón'),
    cantidad: exigirEntero(d.cantidad, 'cantidad'),
    precio: exigirEntero(d.precio, 'precio'),
  }));
}

/**
 * Lee los cambios de una corrección de compra.
 *
 * @param valor - Dato recibido.
 * @returns Cambios con su tipo.
 */
function cambiosCompra(valor: unknown): CambioLineaCompraPedido[] {
  return objetos(valor, 'cambios').map((d) => ({
    renglon: exigirEntero(d.renglon, 'renglón'),
    cantidad: exigirEntero(d.cantidad, 'cantidad'),
    costoUnitario: exigirEntero(d.costoUnitario, 'costo'),
  }));
}

/**
 * Lee las cantidades pedidas de una devolución.
 *
 * @param valor - Dato recibido.
 * @returns Líneas con su tipo.
 */
function lineasDevolucion(valor: unknown): LineaDevolucionPedida[] {
  return objetos(valor, 'líneas').map((d) => ({
    renglon: exigirEntero(d.renglon, 'renglón'),
    cantidad: exigirEntero(d.cantidad, 'cantidad'),
  }));
}

/**
 * Lee la petición de anular un documento por su id.
 *
 * @param peticion - Dato recibido.
 * @param campo - Nombre del documento para el mensaje.
 * @returns Id y motivo.
 */
function anulacion(peticion: unknown, campo: string): { id: number; motivo: string } {
  const d = exigirObjeto(peticion);
  return { id: exigirEntero(d.id, campo), motivo: exigirTexto(d.motivo, 'motivo') };
}

/**
 * Registra los canales IPC de correcciones, anulaciones, devoluciones, saldo
 * a favor y reintegros (Fase 4a). Todos exigen sesión.
 *
 * @param registrar - Función de registro de manejadores.
 * @param servicios - Servicios de la Fase 4a.
 */
export function registrarIpcCorrecciones(
  registrar: RegistrarManejador,
  servicios: ServiciosCorrecciones,
): void {
  const { correcciones, devoluciones, saldoFavor } = servicios;

  registrar('correcciones:buscarVenta', (numero) =>
    correcciones.buscarVenta(exigirEntero(numero, 'número de factura')),
  );
  registrar('correcciones:buscarCompra', (texto) =>
    correcciones.buscarCompra(exigirTexto(texto, 'número de compra')),
  );
  registrar('correcciones:corregirVenta', (peticion) => {
    const d = exigirObjeto(peticion);
    return correcciones.corregirVenta({
      facturaId: exigirEntero(d.facturaId, 'factura'),
      version: exigirEntero(d.version, 'versión'),
      cambios: cambiosVenta(d.cambios),
      motivo: exigirTexto(d.motivo, 'motivo'),
    });
  });
  registrar('correcciones:corregirCompra', (peticion) => {
    const d = exigirObjeto(peticion);
    const descuento = exigirObjeto(d.descuento);
    return correcciones.corregirCompra({
      facturaId: exigirEntero(d.facturaId, 'compra'),
      version: exigirEntero(d.version, 'versión'),
      cambios: cambiosCompra(d.cambios),
      flete: exigirEntero(d.flete, 'flete'),
      descuento: {
        modo: exigirOpcion(descuento.modo, MODOS_DESCUENTO, 'modo del descuento'),
        valor: exigirEntero(descuento.valor, 'descuento'),
      },
      motivo: exigirTexto(d.motivo, 'motivo'),
    });
  });
  registrar('correcciones:anular', (peticion) => {
    const d = exigirObjeto(peticion);
    return correcciones.anular({
      tipo: exigirOpcion(d.tipo, TIPOS_ABONO, 'tipo de factura'),
      facturaId: exigirEntero(d.facturaId, 'factura'),
      version: exigirEntero(d.version, 'versión'),
      motivo: exigirTexto(d.motivo, 'motivo'),
    });
  });

  registrar('devoluciones:contexto', (tipo) =>
    devoluciones.contexto(exigirOpcion(tipo, TIPOS_DEVOLUCION, 'tipo de devolución')),
  );
  registrar('devoluciones:guardar', (peticion) => {
    const d = exigirObjeto(peticion);
    return devoluciones.guardar({
      tipo: exigirOpcion(d.tipo, TIPOS_DEVOLUCION, 'tipo de devolución'),
      facturaId: exigirEntero(d.facturaId, 'factura'),
      version: exigirEntero(d.version, 'versión'),
      devolucionesConocidas: exigirEntero(d.devolucionesConocidas, 'devoluciones'),
      bodegaId: exigirEntero(d.bodegaId, 'bodega'),
      lineas: lineasDevolucion(d.lineas),
      motivo: exigirTexto(d.motivo, 'motivo'),
    });
  });
  registrar('devoluciones:anular', (peticion) =>
    devoluciones.anular(anulacion(peticion, 'devolución')),
  );

  registrar('saldoFavor:consultar', (peticion) => {
    const d = exigirObjeto(peticion);
    return saldoFavor.consultar({
      tipo: exigirOpcion(d.tipo, TIPOS_ABONO, 'tipo de tercero'),
      codigo: exigirEntero(d.codigo, 'código'),
    });
  });
  registrar('saldoFavor:reintegrar', (peticion) => {
    const d = exigirObjeto(peticion);
    return saldoFavor.reintegrar({
      tipo: exigirOpcion(d.tipo, TIPOS_ABONO, 'tipo de tercero'),
      terceroCodigo: exigirEntero(d.terceroCodigo, 'cliente o proveedor'),
      formaPagoId: exigirEntero(d.formaPagoId, 'forma de pago'),
      valor: exigirEntero(d.valor, 'valor'),
      observacion: exigirTexto(d.observacion, 'observación'),
      disponibleEsperado: exigirEntero(d.disponibleEsperado, 'saldo a favor'),
    });
  });
  registrar('saldoFavor:anularReintegro', (peticion) => {
    saldoFavor.anularReintegro(anulacion(peticion, 'reintegro'));
  });
}
