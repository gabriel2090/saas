import { ErrorDeNegocio } from '../../domain/errores';
import { ESCALAS_PRECIO } from '../../shared/maestros';
import type { CondicionPago, ImpresoraSistema, LineaVentaNueva } from '../../shared/ventas';
import type { ServicioVentas } from '../servicios/ventas';
import type { RegistrarManejador } from './registrar';
import {
  exigirArreglo,
  exigirEntero,
  exigirEnteroONulo,
  exigirObjeto,
  exigirOpcion,
  exigirTexto,
} from './validacion';

/**
 * Máximo de líneas de una factura: protege al proceso principal de una
 * petición desproporcionada.
 */
const MAXIMO_LINEAS = 1000;

/**
 * Condiciones de pago aceptadas.
 */
const CONDICIONES: readonly CondicionPago[] = ['contado', 'credito'];

/**
 * Dependencias de los canales de ventas y de configuración de la facturación.
 */
export interface DependenciasIpcVentas {
  /** Servicio de ventas. */
  ventas: ServicioVentas;
  /**
   * Lista las impresoras instaladas en Windows.
   *
   * @returns Impresoras del sistema.
   */
  impresoras: () => Promise<ImpresoraSistema[]>;
}

/**
 * Lee las líneas de una factura de venta.
 *
 * @param valor - Dato recibido.
 * @returns Líneas con su tipo.
 * @throws {ErrorDeNegocio} Si la forma no es la esperada.
 */
function leerLineas(valor: unknown): LineaVentaNueva[] {
  const arreglo = exigirArreglo(valor, 'líneas');
  if (arreglo.length > MAXIMO_LINEAS) {
    throw new ErrorDeNegocio('VALIDACION', `Una factura admite máximo ${MAXIMO_LINEAS} líneas.`);
  }
  return arreglo.map((l) => {
    const d = exigirObjeto(l);
    return {
      productoCodigo: exigirEntero(d.productoCodigo, 'producto'),
      escala: exigirOpcion(
        d.escala,
        ESCALAS_PRECIO.map((e) => e.valor),
        'escala',
      ),
      cantidad: exigirEntero(d.cantidad, 'cantidad'),
      precioAlterado: exigirEnteroONulo(d.precioAlterado, 'precio'),
    };
  });
}

/**
 * Registra los canales IPC de la ventana de facturar y de la configuración
 * de la facturación. Todos exigen sesión.
 *
 * @param registrar - Función de registro de manejadores.
 * @param dependencias - Servicio de ventas y listado de impresoras.
 */
export function registrarIpcVentas(
  registrar: RegistrarManejador,
  dependencias: DependenciasIpcVentas,
): void {
  const { ventas } = dependencias;

  registrar('ventas:contexto', () => ventas.contexto());
  registrar('ventas:creditoCliente', (codigo) =>
    ventas.creditoCliente(exigirEntero(codigo, 'cliente')),
  );
  registrar('ventas:guardar', (peticion) => {
    const d = exigirObjeto(peticion);
    const contado = d.contado === null ? null : exigirObjeto(d.contado);
    return ventas.guardar({
      ranura: exigirEnteroONulo(d.ranura, 'borrador'),
      clienteCodigo: exigirEntero(d.clienteCodigo, 'cliente'),
      condicion: exigirOpcion(d.condicion, CONDICIONES, 'condición de pago'),
      plazoDias: exigirEntero(d.plazoDias, 'plazo'),
      bodegaId: exigirEntero(d.bodegaId, 'bodega'),
      lineas: leerLineas(d.lineas),
      contado:
        contado === null
          ? null
          : {
              formaPagoId: exigirEntero(contado.formaPagoId, 'forma de pago'),
              recibido: exigirEnteroONulo(contado.recibido, 'recibido'),
            },
      cajasEmpaque: exigirEnteroONulo(d.cajasEmpaque, 'cajas de empaque'),
    });
  });
  registrar('ventas:borradores', () => ventas.borradores());
  registrar('ventas:guardarBorrador', (peticion) => {
    const d = exigirObjeto(peticion);
    ventas.guardarBorrador({
      ranura: exigirEntero(d.ranura, 'borrador'),
      contenido: exigirTexto(d.contenido, 'borrador'),
    });
  });
  registrar('ventas:borrarBorrador', (ranura) => {
    ventas.borrarBorrador(exigirEntero(ranura, 'borrador'));
  });

  registrar('facturacion:configuracion', () => ventas.configuracion());
  registrar('facturacion:configurar', (peticion) => {
    const d = exigirObjeto(peticion);
    const impresora = d.impresora === null ? null : exigirTexto(d.impresora, 'impresora');
    return ventas.configurar({
      siguienteNumero: exigirEntero(d.siguienteNumero, 'próxima factura'),
      impresora,
    });
  });
  registrar('facturacion:impresoras', () => dependencias.impresoras());
}
