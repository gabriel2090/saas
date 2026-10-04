import { ErrorDeNegocio } from '../../domain/errores';
import { TIPOS_ABONO, type AplicacionAbono } from '../../shared/abonos';
import { TIPOS_AJUSTE } from '../../shared/ajustes';
import type { LineaCompraNueva, ModoDescuento } from '../../shared/compras';
import type { ServicioAbonos } from '../servicios/abonos';
import type { ServicioAjustes } from '../servicios/ajustes';
import type { ServicioCompras } from '../servicios/compras';
import type { RegistrarManejador } from './registrar';
import {
  exigirArreglo,
  exigirBooleano,
  exigirEntero,
  exigirObjeto,
  exigirOpcion,
  exigirTexto,
} from './validacion';

/**
 * Máximo de líneas de una compra o de aplicaciones de un abono: protege al
 * proceso principal de una petición desproporcionada.
 */
const MAXIMO_ELEMENTOS = 1000;

/**
 * Modos de descuento aceptados.
 */
const MODOS_DESCUENTO: readonly ModoDescuento[] = ['pesos', 'porcentaje'];

/**
 * Servicios que atienden los canales de compras, abonos y ajustes.
 */
export interface ServiciosCompras {
  /** Facturas de proveedor. */
  compras: ServicioCompras;
  /** Abonos de cliente y de proveedor. */
  abonos: ServicioAbonos;
  /** Ajustes de inventario. */
  ajustes: ServicioAjustes;
}

/**
 * Lee un arreglo con un máximo de elementos.
 *
 * @param valor - Dato recibido.
 * @param campo - Nombre del campo para el mensaje.
 * @returns El arreglo.
 * @throws {ErrorDeNegocio} Si no es un arreglo o es demasiado largo.
 */
function arregloLimitado(valor: unknown, campo: string): unknown[] {
  const arreglo = exigirArreglo(valor, campo);
  if (arreglo.length > MAXIMO_ELEMENTOS) {
    throw new ErrorDeNegocio(
      'VALIDACION',
      `El campo «${campo}» admite máximo ${MAXIMO_ELEMENTOS} elementos.`,
    );
  }
  return arreglo;
}

/**
 * Lee las líneas de una compra.
 *
 * @param valor - Dato recibido.
 * @returns Líneas con su tipo.
 * @throws {ErrorDeNegocio} Si la forma no es la esperada.
 */
function leerLineas(valor: unknown): LineaCompraNueva[] {
  return arregloLimitado(valor, 'líneas').map((l) => {
    const d = exigirObjeto(l);
    return {
      productoCodigo: exigirEntero(d.productoCodigo, 'producto'),
      cantidad: exigirEntero(d.cantidad, 'cantidad'),
      costoUnitario: exigirEntero(d.costoUnitario, 'costo'),
    };
  });
}

/**
 * Lee el reparto de un abono.
 *
 * @param valor - Dato recibido.
 * @returns Aplicaciones con su tipo.
 * @throws {ErrorDeNegocio} Si la forma no es la esperada.
 */
function leerAplicaciones(valor: unknown): AplicacionAbono[] {
  return arregloLimitado(valor, 'aplicaciones').map((a) => {
    const d = exigirObjeto(a);
    return {
      facturaId: exigirEntero(d.facturaId, 'factura'),
      valor: exigirEntero(d.valor, 'valor aplicado'),
    };
  });
}

/**
 * Registra los canales IPC de compras, abonos (de cliente y de proveedor) y
 * ajustes de inventario. Todos exigen sesión.
 *
 * @param registrar - Función de registro de manejadores.
 * @param servicios - Servicios de la Fase 2.
 */
export function registrarIpcCompras(
  registrar: RegistrarManejador,
  servicios: ServiciosCompras,
): void {
  const { compras, abonos, ajustes } = servicios;

  registrar('compras:contexto', () => compras.contexto());
  registrar('compras:contextoProveedor', (codigo) =>
    compras.contextoProveedor(exigirEntero(codigo, 'proveedor')),
  );
  registrar('compras:stockBodega', (bodegaId) =>
    compras.stockBodega(exigirEntero(bodegaId, 'bodega')),
  );
  registrar('compras:guardar', (peticion) => {
    const d = exigirObjeto(peticion);
    const descuento = exigirObjeto(d.descuento);
    const contado = d.contado === null ? null : exigirObjeto(d.contado);
    return compras.guardar({
      proveedorCodigo: exigirEntero(d.proveedorCodigo, 'proveedor'),
      numeroProveedor: exigirTexto(d.numeroProveedor, 'número de factura del proveedor'),
      fecha: exigirTexto(d.fecha, 'fecha'),
      plazoDias: exigirEntero(d.plazoDias, 'plazo'),
      bodegaId: exigirEntero(d.bodegaId, 'bodega'),
      ordenCompra: exigirTexto(d.ordenCompra, 'orden de compra'),
      lineas: leerLineas(d.lineas),
      flete: exigirEntero(d.flete, 'flete'),
      fleteProveedor: exigirBooleano(d.fleteProveedor, 'flete del proveedor'),
      descuento: {
        modo: exigirOpcion(descuento.modo, MODOS_DESCUENTO, 'modo del descuento'),
        valor: exigirEntero(descuento.valor, 'descuento'),
      },
      descuentoEnCosto: exigirBooleano(d.descuentoEnCosto, 'repartir el descuento'),
      contado:
        contado === null
          ? null
          : { formaPagoId: exigirEntero(contado.formaPagoId, 'forma de pago') },
    });
  });

  registrar('abonos:contexto', (tipo) =>
    abonos.contexto(exigirOpcion(tipo, TIPOS_ABONO, 'tipo de abono')),
  );
  registrar('abonos:contextoTercero', (peticion) => {
    const d = exigirObjeto(peticion);
    return abonos.contextoTercero(
      exigirOpcion(d.tipo, TIPOS_ABONO, 'tipo de abono'),
      exigirEntero(d.codigo, 'código'),
    );
  });
  registrar('abonos:guardar', (peticion) => {
    const d = exigirObjeto(peticion);
    return abonos.guardar({
      tipo: exigirOpcion(d.tipo, TIPOS_ABONO, 'tipo de abono'),
      terceroCodigo: exigirEntero(d.terceroCodigo, 'cliente o proveedor'),
      fecha: exigirTexto(d.fecha, 'fecha'),
      formaPagoId: exigirEntero(d.formaPagoId, 'forma de pago'),
      valor: exigirEntero(d.valor, 'valor'),
      observacion: exigirTexto(d.observacion, 'observación'),
      aplicaciones: leerAplicaciones(d.aplicaciones),
    });
  });
  registrar('abonos:anular', (peticion) => {
    const d = exigirObjeto(peticion);
    abonos.anular({ id: exigirEntero(d.id, 'abono'), motivo: exigirTexto(d.motivo, 'motivo') });
  });

  registrar('ajustes:listar', () => ajustes.listar());
  registrar('ajustes:stock', (peticion) => {
    const d = exigirObjeto(peticion);
    return ajustes.stock(
      exigirEntero(d.productoCodigo, 'producto'),
      exigirEntero(d.bodegaId, 'bodega'),
    );
  });
  registrar('ajustes:registrar', (peticion) => {
    const d = exigirObjeto(peticion);
    return ajustes.registrar({
      productoCodigo: exigirEntero(d.productoCodigo, 'producto'),
      bodegaId: exigirEntero(d.bodegaId, 'bodega'),
      tipo: exigirOpcion(
        d.tipo,
        TIPOS_AJUSTE.map((t) => t.valor),
        'tipo de ajuste',
      ),
      cantidad: exigirEntero(d.cantidad, 'cantidad'),
      motivo: exigirTexto(d.motivo, 'motivo'),
    });
  });
  registrar('ajustes:anular', (peticion) => {
    const d = exigirObjeto(peticion);
    return ajustes.anular({
      id: exigirEntero(d.id, 'ajuste'),
      motivo: exigirTexto(d.motivo, 'motivo'),
    });
  });
}
