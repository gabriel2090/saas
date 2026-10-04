import { diaDeIso } from '../../domain/calendario';
import {
  calcularDevolucion,
  efectoAnularDevolucion,
  efectoDevolucion,
  validarMotivoDevolucion,
  type LineaDevolvible,
} from '../../domain/devoluciones';
import { ErrorDeNegocio } from '../../domain/errores';
import type { BaseDeDatos } from '../../data/conexion';
import { obtenerCatalogo } from '../../data/repositorios/catalogos.repo';
import { consultarConsecutivo, tomarConsecutivo } from '../../data/repositorios/consecutivos.repo';
import {
  leerCartera,
  obtenerCompraParaCorregir,
  obtenerVentaParaCorregir,
} from '../../data/repositorios/correcciones.repo';
import {
  anularDevolucion,
  contarDevoluciones,
  insertarDevolucion,
  obtenerDevolucion,
} from '../../data/repositorios/devoluciones.repo';
import { insertarMovimiento } from '../../data/repositorios/kardex.repo';
import { insertarMovimientoFavor, saldoFavorDe } from '../../data/repositorios/saldosFavor.repo';
import type { ContextoTransaccion, EjecutorTransacciones } from '../../data/transaccion';
import type {
  ContextoDevolucion,
  DevolucionAnulada,
  DevolucionGuardada,
  PeticionAnularDocumento,
  PeticionGuardarDevolucion,
  ReintegroGenerado,
  TipoDevolucion,
} from '../../shared/correcciones';
import type { CondicionPago } from '../../shared/ventas';
import { registrarReintegroDeVentaContado } from './saldoFavor';

/**
 * Servicio de las devoluciones de venta y de compra (§9.2, D-131). Cada
 * operación toca la devolución, el inventario y la cartera en una sola
 * transacción.
 */
export interface ServicioDevoluciones {
  /**
   * Datos generales de la ventana de devolución.
   *
   * @param tipo - Venta o compra.
   * @returns Número que tendrá la próxima devolución.
   */
  contexto(tipo: TipoDevolucion): ContextoDevolucion;
  /**
   * Guarda una devolución: kardex, cartera (saldo o saldo a favor) o
   * reintegro en una venta de contado.
   *
   * @param peticion - Factura, versión, devoluciones conocidas, bodega, cantidades y motivo.
   * @returns Lo que hizo la devolución.
   * @throws {ErrorDeNegocio} Si no se puede devolver o la factura cambió.
   */
  guardar(peticion: PeticionGuardarDevolucion): DevolucionGuardada;
  /**
   * Anula una devolución: revierte el inventario y la cartera (o cobra de
   * nuevo en una venta de contado).
   *
   * @param peticion - Devolución y motivo.
   * @returns Lo que hizo la anulación.
   * @throws {ErrorDeNegocio} Si no existe o ya está anulada.
   */
  anular(peticion: PeticionAnularDocumento): DevolucionAnulada;
}

/**
 * Factura leída para una devolución, igual para ventas y compras.
 */
interface FacturaDevolvible {
  /** Id. */
  id: number;
  /** Número (de venta o interno de la compra). */
  numero: number;
  /** Nombre para los mensajes: «La factura 84790» o «La compra 37». */
  nombre: string;
  /** Estado. */
  estado: 'activa' | 'anulada';
  /** Origen. */
  origen: string;
  /** Versión vigente. */
  version: number;
  /** Condición (las compras van como crédito: siempre tienen cartera). */
  condicion: CondicionPago;
  /** Forma de pago de una venta de contado. */
  formaPagoId: number | null;
  /** Código del tercero. */
  terceroCodigo: number;
  /** Líneas que se pueden devolver. */
  lineas: LineaDevolvible[];
  /** Lo ya devuelto por renglón. */
  yaDevuelto: Map<number, number>;
}

/**
 * Lee la factura de una devolución.
 *
 * @param db - Conexión (o la de la transacción).
 * @param tipo - Venta o compra.
 * @param id - Id de la factura.
 * @returns La factura, o `null` si no existe.
 */
function leerFactura(db: BaseDeDatos, tipo: TipoDevolucion, id: number): FacturaDevolvible | null {
  if (tipo === 'venta') {
    const f = obtenerVentaParaCorregir(db, id);
    return f
      ? {
          id: f.id,
          numero: f.numero,
          nombre: `La factura ${f.numero}`,
          estado: f.estado,
          origen: f.origen,
          version: f.version,
          condicion: f.condicion,
          formaPagoId: f.formaPagoId,
          terceroCodigo: f.tercero.codigo,
          lineas: f.lineas.map((l) => ({
            renglon: l.renglon,
            producto: l.producto,
            cantidad: l.cantidad,
            valorUnitario: l.precio,
            costoUnitario: l.costo,
          })),
          yaDevuelto: new Map(f.yaDevuelto.map((d) => [d.renglon, d.cantidad])),
        }
      : null;
  }
  const c = obtenerCompraParaCorregir(db, id);
  return c
    ? {
        id: c.id,
        numero: c.numero,
        nombre: `La compra ${c.numero}`,
        estado: c.estado,
        origen: c.origen,
        version: c.version,
        condicion: 'credito',
        formaPagoId: null,
        terceroCodigo: c.tercero.codigo,
        lineas: c.lineas.map((l) => ({
          renglon: l.renglon,
          producto: l.producto,
          cantidad: l.cantidad,
          valorUnitario: l.costoUnitario,
          costoUnitario: l.costoNuevo,
        })),
        yaDevuelto: new Map(c.yaDevuelto.map((d) => [d.renglon, d.cantidad])),
      }
    : null;
}

/**
 * Tercero dueño de la cartera de cada tipo de devolución.
 *
 * @param tipo - Venta o compra.
 * @returns Cliente o proveedor.
 */
function terceroDe(tipo: TipoDevolucion): 'cliente' | 'proveedor' {
  return tipo === 'venta' ? 'cliente' : 'proveedor';
}

/**
 * Forma de pago de una venta de contado (para su reintegro).
 *
 * @param factura - Factura de contado.
 * @returns Id de la forma de pago.
 * @throws {Error} Si no tiene forma de pago (dato dañado).
 */
function formaDeContado(factura: FacturaDevolvible): number {
  if (factura.formaPagoId === null) {
    throw new Error(`La factura de contado ${factura.numero} no tiene forma de pago.`);
  }
  return factura.formaPagoId;
}

/**
 * Crea el servicio de devoluciones.
 *
 * @param db - Conexión abierta.
 * @param ejecutar - Ejecutor de transacciones.
 * @returns El servicio.
 */
export function crearServicioDevoluciones(
  db: BaseDeDatos,
  ejecutar: EjecutorTransacciones,
): ServicioDevoluciones {
  /**
   * Lee la factura de una devolución o lanza el error para el usuario.
   *
   * @param ctx - Contexto de la transacción.
   * @param tipo - Venta o compra.
   * @param id - Id de la factura.
   * @returns La factura.
   */
  const exigirFactura = (
    ctx: ContextoTransaccion,
    tipo: TipoDevolucion,
    id: number,
  ): FacturaDevolvible => {
    const factura = leerFactura(ctx.db, tipo, id);
    if (!factura) {
      throw new ErrorDeNegocio(
        'NO_ENCONTRADO',
        'La factura no existe. Escriba de nuevo el número y presione Intro.',
      );
    }
    return factura;
  };

  return {
    contexto: (tipo) => ({
      siguienteNumero: consultarConsecutivo(
        db,
        tipo === 'venta' ? 'devolucion_venta' : 'devolucion_compra',
      ),
    }),

    guardar(p) {
      const motivo = validarMotivoDevolucion(p.motivo);
      const bodega = obtenerCatalogo(db, 'bodega', p.bodegaId);
      if (!bodega?.activo) {
        throw new ErrorDeNegocio(
          'VALIDACION',
          `Elija la bodega ${p.tipo === 'venta' ? 'a la que reingresa' : 'de la que sale'} la mercancía.`,
        );
      }
      return ejecutar((ctx) => {
        const factura = exigirFactura(ctx, p.tipo, p.facturaId);
        if (factura.estado === 'anulada') {
          throw new ErrorDeNegocio(
            'VALIDACION',
            `${factura.nombre} está anulada: ya no admite devoluciones (al anularla, toda la mercancía volvió al inventario).`,
          );
        }
        if (factura.origen === 'saldo_inicial') {
          throw new ErrorDeNegocio(
            'VALIDACION',
            `${factura.nombre} es un saldo inicial importado, sin productos: no admite devoluciones. ` +
              'Si el saldo está mal, anúlelo en la ventana de corrección con Ctrl+X.',
          );
        }
        if (
          factura.version !== p.version ||
          contarDevoluciones(ctx.db, p.tipo, factura.id) !== p.devolucionesConocidas
        ) {
          throw new ErrorDeNegocio(
            'CONFLICTO',
            `${factura.nombre} cambió desde que la abrió; puede que esta devolución ya se haya ` +
              'guardado. Vuelva a buscarla para ver lo devuelto antes de registrar otra.',
          );
        }
        const calculo = calcularDevolucion({
          tipo: p.tipo,
          lineas: factura.lineas,
          yaDevuelto: factura.yaDevuelto,
          pedidas: p.lineas,
        });
        const tercero = terceroDe(p.tipo);
        const cartera = leerCartera(ctx.db, tercero, factura.id);
        const efecto = efectoDevolucion(calculo.total, factura.condicion, cartera.total, {
          aplicado: cartera.aplicado,
          devuelto: cartera.devuelto,
          trasladado: cartera.trasladado,
          disponible: saldoFavorDe(ctx.db, tercero, factura.terceroCodigo),
        });
        const numero = tomarConsecutivo(
          ctx,
          p.tipo === 'venta' ? 'devolucion_venta' : 'devolucion_compra',
        );
        const id = insertarDevolucion(ctx, {
          tipo: p.tipo,
          numero,
          facturaId: factura.id,
          facturaNumero: factura.numero,
          facturaVersion: factura.version,
          dia: diaDeIso(ctx.fecha),
          bodegaId: bodega.id,
          total: calculo.total,
          motivo,
          lineas: calculo.lineas.map((l) => ({
            facturaRenglon: l.facturaRenglon,
            productoCodigo: l.productoCodigo,
            cantidad: l.cantidad,
            valorUnitario: l.valorUnitario,
            total: l.total,
            costoUnitario: l.costoUnitario,
          })),
        });
        const documento = {
          tipo: p.tipo === 'venta' ? 'devolucion_venta' : 'devolucion_compra',
          id: String(numero),
        };
        for (const m of calculo.movimientos) {
          insertarMovimiento(ctx, {
            productoCodigo: m.productoCodigo,
            bodegaId: bodega.id,
            tipo: p.tipo === 'venta' ? 'devolucion_venta' : 'devolucion_compra',
            cantidad: m.cantidad,
            costoUnitario: m.costoUnitario,
            documento,
          });
        }
        let reintegro: ReintegroGenerado | null = null;
        let saldo = 0;
        let movimientoFavor = 0;
        if (efecto.tipo === 'contado') {
          reintegro = registrarReintegroDeVentaContado(ctx, {
            clienteCodigo: factura.terceroCodigo,
            sentido: 'entrega',
            valor: efecto.devolver,
            formaPagoId: formaDeContado(factura),
            documento: { tipo: 'devolucion', id },
            observacion: `Devolución de venta ${numero} (factura ${factura.numero})`,
          });
        } else {
          saldo = efecto.saldo;
          movimientoFavor = efecto.movimientoFavor;
          insertarMovimientoFavor(ctx, {
            tipo: tercero,
            terceroCodigo: factura.terceroCodigo,
            valor: movimientoFavor,
            origen: 'devolucion',
            documento: { tipo: 'devolucion', id },
            facturaId: factura.id,
          });
        }
        return { id, numero, total: calculo.total, saldo, movimientoFavor, reintegro };
      });
    },

    anular(p) {
      const devolucion = obtenerDevolucion(db, p.id);
      if (!devolucion) {
        throw new ErrorDeNegocio(
          'NO_ENCONTRADO',
          'La devolución no existe. Vuelva a buscar la factura para ver sus devoluciones.',
        );
      }
      const nombre = `La devolución de ${devolucion.tipo} ${devolucion.numero}`;
      if (devolucion.estado === 'anulada') {
        throw new ErrorDeNegocio(
          'CONFLICTO',
          `${nombre} ya está anulada: no hay nada más que hacer.`,
        );
      }
      const motivo = validarMotivoDevolucion(p.motivo);
      return ejecutar((ctx) => {
        const factura = exigirFactura(ctx, devolucion.tipo, devolucion.facturaId);
        const tercero = terceroDe(devolucion.tipo);
        const cartera = leerCartera(ctx.db, tercero, factura.id);
        const efecto = efectoAnularDevolucion(devolucion.total, factura.condicion, cartera.total, {
          aplicado: cartera.aplicado,
          devuelto: cartera.devuelto,
          trasladado: cartera.trasladado,
          disponible: saldoFavorDe(ctx.db, tercero, factura.terceroCodigo),
        });
        if (!anularDevolucion(ctx, devolucion, motivo)) {
          throw new ErrorDeNegocio(
            'CONFLICTO',
            `${nombre} ya está anulada: no hay nada más que hacer.`,
          );
        }
        const venta = devolucion.tipo === 'venta';
        for (const l of devolucion.lineas) {
          insertarMovimiento(ctx, {
            productoCodigo: l.productoCodigo,
            bodegaId: devolucion.bodegaId,
            tipo: venta ? 'anulacion_devolucion_venta' : 'anulacion_devolucion_compra',
            // La devolución de venta había entrado mercancía; su anulación la saca (y al revés en compra).
            cantidad: venta ? -l.cantidad : l.cantidad,
            costoUnitario: l.costoUnitario,
            documento: {
              tipo: venta ? 'devolucion_venta' : 'devolucion_compra',
              id: String(devolucion.numero),
            },
          });
        }
        let reintegro: ReintegroGenerado | null = null;
        let saldo = 0;
        let movimientoFavor = 0;
        if (efecto.tipo === 'contado') {
          reintegro = registrarReintegroDeVentaContado(ctx, {
            clienteCodigo: factura.terceroCodigo,
            sentido: 'recibe',
            valor: efecto.cobrar,
            formaPagoId: formaDeContado(factura),
            documento: { tipo: 'anulacion_devolucion', id: devolucion.id },
            observacion: `Anulación de la devolución de venta ${devolucion.numero} (factura ${factura.numero})`,
          });
        } else {
          saldo = efecto.saldo;
          movimientoFavor = efecto.movimientoFavor;
          insertarMovimientoFavor(ctx, {
            tipo: tercero,
            terceroCodigo: factura.terceroCodigo,
            valor: movimientoFavor,
            origen: 'anulacion_devolucion',
            documento: { tipo: 'anulacion_devolucion', id: devolucion.id },
            facturaId: factura.id,
          });
        }
        return { numero: devolucion.numero, saldo, movimientoFavor, reintegro };
      });
    },
  };
}
