import { calcularVencimiento, diaDeIso } from '../../domain/calendario';
import { ErrorDeNegocio } from '../../domain/errores';
import {
  calcularCambio,
  calcularVenta,
  plazoDeCondicion,
  razonesBloqueoCredito,
  validarCajasEmpaque,
  validarSiguienteNumeroFactura,
  type LineaVentaEntrada,
} from '../../domain/ventas';
import type { BaseDeDatos } from '../../data/conexion';
import { obtenerCatalogo } from '../../data/repositorios/catalogos.repo';
import {
  guardarConfiguracion,
  obtenerConfiguracion,
} from '../../data/repositorios/configuracion.repo';
import { consultarConsecutivo, tomarConsecutivo } from '../../data/repositorios/consecutivos.repo';
import { insertarMovimiento } from '../../data/repositorios/kardex.repo';
import { obtenerProducto } from '../../data/repositorios/productos.repo';
import { obtenerTercero } from '../../data/repositorios/terceros.repo';
import {
  borrarBorrador,
  creditoCliente,
  guardarBorrador,
  insertarFactura,
  listarBorradores,
  obtenerFacturaCliente,
  ultimoNumeroFactura,
  type FacturaClienteDetalle,
} from '../../data/repositorios/ventas.repo';
import type { EjecutorTransacciones } from '../../data/transaccion';
import { aIsoLocal } from '../../shared/formato/fechas';
import type { ProductoDetalle, Tercero } from '../../shared/maestros';
import {
  NUMERO_BORRADORES,
  type BorradorGuardado,
  type ConfiguracionFacturacion,
  type ContextoFacturar,
  type CreditoCliente,
  type FacturaGuardada,
  type PeticionConfigurarFacturacion,
  type PeticionGuardarBorrador,
  type PeticionGuardarFactura,
} from '../../shared/ventas';

/**
 * Largo máximo del JSON de un borrador (unas 600 líneas): protege la base de
 * un contenido desbordado por error.
 */
export const LARGO_MAXIMO_BORRADOR = 200_000;

/**
 * Largo máximo del nombre de una impresora de Windows.
 */
const LARGO_MAXIMO_IMPRESORA = 260;

/**
 * Servicio de las facturas de cliente (§7) y de sus borradores.
 */
export interface ServicioVentas {
  /**
   * Datos generales de la ventana de facturar.
   *
   * @returns Próximo número, día de hoy y si hay impresora configurada.
   */
  contexto(): ContextoFacturar;
  /**
   * Situación de crédito de un cliente (§5.2, S-03).
   *
   * @param clienteCodigo - Cliente.
   * @returns Tope, deuda y factura vencida más antigua.
   * @throws {ErrorDeNegocio} Si el cliente no existe.
   */
  creditoCliente(clienteCodigo: number): CreditoCliente;
  /**
   * Guarda una factura de cliente en **una sola transacción**: la factura
   * con sus líneas y su versión 1, la salida del kardex y, a crédito, la
   * cuenta por cobrar (que se deriva de la factura). Vacía el borrador del
   * que salió (§3, §7).
   *
   * @param peticion - Datos de la factura.
   * @returns Número asignado, total y cambio.
   * @throws {ErrorDeNegocio} Si algún dato no es válido, un precio queda bajo el costo o el crédito está bloqueado.
   */
  guardar(peticion: PeticionGuardarFactura): FacturaGuardada;
  /**
   * Factura guardada con lo necesario para imprimirla.
   *
   * @param id - Id de la factura.
   * @returns La factura.
   * @throws {ErrorDeNegocio} Si no existe.
   */
  obtener(id: number): FacturaClienteDetalle;
  /**
   * Borradores guardados (D-89).
   *
   * @returns Borradores por ranura.
   */
  borradores(): BorradorGuardado[];
  /**
   * Autoguarda un borrador (D-89).
   *
   * @param peticion - Ranura y contenido.
   * @throws {ErrorDeNegocio} Si la ranura o el contenido no son válidos.
   */
  guardarBorrador(peticion: PeticionGuardarBorrador): void;
  /**
   * Descarta un borrador («Limpiar borrador»).
   *
   * @param ranura - Ranura de 1 a 6.
   * @throws {ErrorDeNegocio} Si la ranura no es válida.
   */
  borrarBorrador(ranura: number): void;
  /**
   * Configuración de la facturación (D-84, D-88).
   *
   * @returns Próximo número, último usado e impresora.
   */
  configuracion(): ConfiguracionFacturacion;
  /**
   * Cambia el próximo número de factura y la impresora; los cambios quedan
   * en el historial.
   *
   * @param peticion - Próximo número e impresora.
   * @returns La configuración guardada.
   * @throws {ErrorDeNegocio} Si el número repetiría uno usado o la impresora no es válida.
   */
  configurar(peticion: PeticionConfigurarFacturacion): ConfiguracionFacturacion;
}

/**
 * Opciones del servicio de ventas.
 */
export interface OpcionesServicioVentas {
  /** Reloj ISO con desfase (inyectable en pruebas). */
  reloj?: () => string;
}

/**
 * Verifica que una ranura de borrador sea válida.
 *
 * @param ranura - Ranura recibida.
 * @returns La misma ranura.
 * @throws {ErrorDeNegocio} Si no es un entero de 1 a 6.
 */
function exigirRanura(ranura: number): number {
  if (!Number.isSafeInteger(ranura) || ranura < 1 || ranura > NUMERO_BORRADORES) {
    throw new ErrorDeNegocio('VALIDACION', 'El borrador indicado no existe.');
  }
  return ranura;
}

/**
 * Crea el servicio de ventas.
 *
 * @param db - Conexión abierta.
 * @param ejecutar - Ejecutor de transacciones.
 * @param opciones - Reloj.
 * @returns El servicio.
 */
export function crearServicioVentas(
  db: BaseDeDatos,
  ejecutar: EjecutorTransacciones,
  opciones: OpcionesServicioVentas = {},
): ServicioVentas {
  const reloj = opciones.reloj ?? aIsoLocal;

  /**
   * Verifica que el cliente exista.
   *
   * @param codigo - Cliente.
   * @returns El cliente.
   */
  const exigirCliente = (codigo: number): Tercero => {
    const cliente = obtenerTercero(db, 'cliente', codigo);
    if (!cliente) {
      throw new ErrorDeNegocio('NO_ENCONTRADO', `No existe el cliente ${codigo}.`);
    }
    return cliente;
  };

  /**
   * Configuración actual de la facturación.
   *
   * @returns Próximo número, último usado e impresora.
   */
  const configuracion = (): ConfiguracionFacturacion => ({
    siguienteNumero: consultarConsecutivo(db, 'factura_cliente'),
    ultimoNumero: ultimoNumeroFactura(db),
    impresora: obtenerConfiguracion(db, 'facturacion.impresora'),
  });

  return {
    contexto: () => ({
      siguienteNumero: consultarConsecutivo(db, 'factura_cliente'),
      hoy: diaDeIso(reloj()),
      impresoraConfigurada: obtenerConfiguracion(db, 'facturacion.impresora') !== null,
    }),

    creditoCliente(clienteCodigo) {
      const cliente = exigirCliente(clienteCodigo);
      return creditoCliente(db, cliente.codigo, cliente.topeCredito, diaDeIso(reloj()));
    },

    guardar(p) {
      const cliente = exigirCliente(p.clienteCodigo);
      if (!cliente.activo) {
        throw new ErrorDeNegocio(
          'VALIDACION',
          `El cliente ${cliente.codigo} - ${cliente.nombre} está inactivo: no se le puede facturar.`,
        );
      }
      const bodega = obtenerCatalogo(db, 'bodega', p.bodegaId);
      if (!bodega?.activo) {
        throw new ErrorDeNegocio('VALIDACION', 'La bodega no existe o está inactiva.');
      }
      const plazoDias = plazoDeCondicion(p.condicion, p.plazoDias);
      if ((p.condicion === 'contado') !== (p.contado !== null)) {
        throw new ErrorDeNegocio('VALIDACION', 'Elija la forma de pago de la factura de contado.');
      }
      const forma = p.contado ? obtenerCatalogo(db, 'forma-pago', p.contado.formaPagoId) : null;
      if (p.contado && !forma?.activo) {
        throw new ErrorDeNegocio('VALIDACION', 'La forma de pago no existe o está inactiva.');
      }
      if (p.ranura !== null) {
        exigirRanura(p.ranura);
      }

      const productos = new Map<number, ProductoDetalle>();
      const lineas: LineaVentaEntrada[] = p.lineas.map((linea, i) => {
        const producto =
          productos.get(linea.productoCodigo) ?? obtenerProducto(db, linea.productoCodigo);
        if (!producto) {
          throw new ErrorDeNegocio(
            'VALIDACION',
            `Línea ${i + 1}: no existe el producto con código ${linea.productoCodigo}.`,
          );
        }
        productos.set(producto.codigo, producto);
        return {
          producto,
          escala: linea.escala,
          cantidad: linea.cantidad,
          precioAlterado: linea.precioAlterado,
        };
      });
      const venta = calcularVenta(lineas);
      const cajasEmpaque = validarCajasEmpaque(p.cajasEmpaque);
      const pago =
        p.contado && forma
          ? calcularCambio(venta.total, p.contado.recibido, forma.calculaCambio)
          : { recibido: null, cambio: null };

      return ejecutar((ctx) => {
        const dia = diaDeIso(ctx.fecha);
        if (p.condicion === 'credito') {
          const credito = creditoCliente(ctx.db, cliente.codigo, cliente.topeCredito, dia);
          const razones = razonesBloqueoCredito({
            clienteCodigo: cliente.codigo,
            clienteNombre: cliente.nombre,
            tope: credito.tope,
            deuda: credito.deuda,
            vencidaMasAntigua: credito.vencidaMasAntigua,
            total: venta.total,
            hoy: dia,
          });
          if (razones.length > 0) {
            throw new ErrorDeNegocio(
              'VALIDACION',
              `No se puede vender a crédito a ${cliente.codigo} - ${cliente.nombre}: ${razones.join(' ')}`,
            );
          }
        }
        const numero = tomarConsecutivo(ctx, 'factura_cliente');
        const id = insertarFactura(ctx, {
          numero,
          clienteCodigo: cliente.codigo,
          dia,
          condicion: p.condicion,
          plazoDias,
          vence: calcularVencimiento(dia, plazoDias),
          bodegaId: bodega.id,
          total: venta.total,
          ahorro: venta.ahorro,
          formaPagoId: forma?.id ?? null,
          recibido: pago.recibido,
          cambio: pago.cambio,
          cajasEmpaque,
          lineas: lineas.map((l, i) => {
            const c = venta.lineas[i];
            if (!c) {
              throw new Error('El cálculo no devolvió todas las líneas.');
            }
            return {
              productoCodigo: l.producto.codigo,
              escala: l.escala,
              cantidad: l.cantidad,
              precioEscala: c.precioEscala,
              precio: c.precio,
              alterado: c.alterado,
              total: c.total,
              costo: l.producto.costo,
            };
          }),
        });
        const documento = { tipo: 'factura_cliente', id: String(numero) };
        for (const l of lineas) {
          insertarMovimiento(ctx, {
            productoCodigo: l.producto.codigo,
            bodegaId: bodega.id,
            tipo: 'venta',
            cantidad: -l.cantidad,
            costoUnitario: l.producto.costo,
            documento,
          });
        }
        if (p.ranura !== null) {
          borrarBorrador(ctx.db, p.ranura);
        }
        return { id, numero, total: venta.total, cambio: pago.cambio };
      });
    },

    obtener(id) {
      const factura = obtenerFacturaCliente(db, id);
      if (!factura) {
        throw new ErrorDeNegocio('NO_ENCONTRADO', 'La factura no existe.');
      }
      return factura;
    },

    borradores: () => listarBorradores(db),

    guardarBorrador({ ranura, contenido }) {
      exigirRanura(ranura);
      if (contenido.length > LARGO_MAXIMO_BORRADOR) {
        throw new ErrorDeNegocio(
          'VALIDACION',
          'El borrador es demasiado grande para guardarlo. Guarde la factura o divídala.',
        );
      }
      let valido = false;
      try {
        const leido: unknown = JSON.parse(contenido);
        valido = typeof leido === 'object' && leido !== null && !Array.isArray(leido);
      } catch {
        valido = false;
      }
      if (!valido) {
        throw new ErrorDeNegocio('VALIDACION', 'El borrador no tiene un formato válido.');
      }
      guardarBorrador(db, ranura, contenido, reloj());
    },

    borrarBorrador(ranura) {
      borrarBorrador(db, exigirRanura(ranura));
    },

    configuracion,

    configurar(p) {
      const actual = configuracion();
      const siguiente = validarSiguienteNumeroFactura(p.siguienteNumero, actual.ultimoNumero);
      const impresora = p.impresora === null ? null : p.impresora.trim();
      if (impresora !== null && (impresora === '' || impresora.length > LARGO_MAXIMO_IMPRESORA)) {
        throw new ErrorDeNegocio('VALIDACION', 'El nombre de la impresora no es válido.');
      }
      if (siguiente === actual.siguienteNumero && impresora === actual.impresora) {
        return actual;
      }
      ejecutar((ctx) => {
        if (siguiente !== actual.siguienteNumero) {
          ctx.db
            .prepare("UPDATE consecutivos SET siguiente = ? WHERE clave = 'factura_cliente'")
            .run(siguiente);
          ctx.registrarCambio({
            entidad: 'consecutivo',
            entidadId: 'factura_cliente',
            accion: 'editar',
            antes: { siguiente: actual.siguienteNumero },
            despues: { siguiente },
          });
        }
        if (impresora !== actual.impresora) {
          guardarConfiguracion(ctx, 'facturacion.impresora', impresora);
        }
      });
      return configuracion();
    },
  };
}
