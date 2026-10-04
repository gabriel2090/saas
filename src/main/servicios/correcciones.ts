import { validarTextoAbono } from '../../domain/abonos';
import {
  anularCompra,
  anularVenta,
  corregirCompra,
  corregirVenta,
  type CambioCosto,
  type LineaCompraVigente,
  type LineaVentaVigente,
  type MovimientoCorreccion,
  type SituacionCosto,
} from '../../domain/correcciones';
import { ErrorDeNegocio } from '../../domain/errores';
import type { TipoMovimiento } from '../../domain/stock';
import type { BaseDeDatos } from '../../data/conexion';
import { anularAbono, obtenerAbono } from '../../data/repositorios/abonos.repo';
import {
  anularFactura,
  buscarCompras,
  idVentaPorNumero,
  insertarVersionCompra,
  insertarVersionVenta,
  leerCartera,
  obtenerCompraParaCorregir,
  obtenerVentaParaCorregir,
} from '../../data/repositorios/correcciones.repo';
import { insertarMovimiento } from '../../data/repositorios/kardex.repo';
import { actualizarCostoProducto, obtenerProducto } from '../../data/repositorios/productos.repo';
import { insertarMovimientoFavor, saldoFavorDe } from '../../data/repositorios/saldosFavor.repo';
import type { ContextoTransaccion, EjecutorTransacciones } from '../../data/transaccion';
import type {
  AnulacionGuardada,
  CorreccionGuardada,
  DevolucionResumen,
  FacturaClienteParaCorregir,
  FacturaProveedorParaCorregir,
  PeticionAnularFactura,
  PeticionCorregirCompra,
  PeticionCorregirVenta,
  ReintegroGenerado,
} from '../../shared/correcciones';
import { registrarReintegroDeVentaContado } from './saldoFavor';

/**
 * Servicio de corrección y anulación de facturas de cliente y de proveedor
 * (§9.1). Cada operación toca factura, inventario y cartera en una sola
 * transacción.
 */
export interface ServicioCorrecciones {
  /**
   * Busca una factura de cliente por su número.
   *
   * @param numero - Número de la factura.
   * @returns La factura con su cartera, abonos, versiones y devoluciones.
   * @throws {ErrorDeNegocio} Si no existe.
   */
  buscarVenta(numero: number): FacturaClienteParaCorregir;
  /**
   * Busca una factura de proveedor por su «Compra No.» o por el número de la
   * factura del proveedor.
   *
   * @param texto - Número escrito.
   * @returns La compra.
   * @throws {ErrorDeNegocio} Si no existe o el número del proveedor coincide con varias compras.
   */
  buscarCompra(texto: string): FacturaProveedorParaCorregir;
  /**
   * Guarda la corrección de una factura de cliente: versión nueva, kardex
   * por la diferencia, saldo a favor o reintegro (D-127 a D-129).
   *
   * @param peticion - Factura, versión vista, cambios y motivo.
   * @returns Lo que hizo la corrección.
   * @throws {ErrorDeNegocio} Si no se puede corregir o la factura cambió.
   */
  corregirVenta(peticion: PeticionCorregirVenta): CorreccionGuardada;
  /**
   * Guarda la corrección de una factura de proveedor: versión nueva, kardex
   * por la diferencia, costos de producto (D-126) y saldo a favor.
   *
   * @param peticion - Compra, versión vista, cambios, flete, descuento y motivo.
   * @returns Lo que hizo la corrección.
   * @throws {ErrorDeNegocio} Si no se puede corregir o la compra cambió.
   */
  corregirCompra(peticion: PeticionCorregirCompra): CorreccionGuardada;
  /**
   * Anula una factura de cliente o de proveedor (D-121): revierte el
   * inventario, pasa lo pagado a saldo a favor (o lo reintegra en contado) y,
   * en compras, anula el abono automático de contado y devuelve los costos.
   *
   * @param peticion - Tipo, factura, versión vista y motivo.
   * @returns Lo que hizo la anulación.
   * @throws {ErrorDeNegocio} Si no se puede anular o la factura cambió.
   */
  anular(peticion: PeticionAnularFactura): AnulacionGuardada;
}

/**
 * Lanza el error de una factura que cambió desde que se abrió: lo más común
 * es una doble pulsación que ya guardó la operación.
 *
 * @param nombre - «La factura 84772» o «La compra 37».
 * @param estado - Estado actual.
 * @param version - Versión actual.
 * @throws {ErrorDeNegocio} Siempre.
 */
function facturaCambio(nombre: string, estado: string, version: number): never {
  throw new ErrorDeNegocio(
    'CONFLICTO',
    estado === 'anulada'
      ? `${nombre} ya está anulada; puede que la operación ya se haya guardado. Vuelva a buscarla para ver cómo quedó.`
      : `${nombre} cambió desde que la abrió (ahora va en la versión ${version}); puede que la ` +
          'corrección ya se haya guardado. Vuelva a buscarla para ver cómo quedó antes de cambiarla otra vez.',
  );
}

/**
 * Verifica que una factura se pueda corregir o anular: activa, en la versión
 * vista y sin devoluciones activas (D-131).
 *
 * @param factura - Estado, versión y devoluciones.
 * @param versionVista - Versión que se vio en pantalla.
 * @param nombre - «La factura 84772» o «La compra 37».
 * @param ventana - Ventana donde se anulan sus devoluciones.
 * @param accion - «corregirla» o «anularla».
 * @throws {ErrorDeNegocio} Si no se puede.
 */
function exigirModificable(
  factura: { estado: string; version: number; devoluciones: DevolucionResumen[] },
  versionVista: number,
  nombre: string,
  ventana: string,
  accion: string,
): void {
  if (factura.estado === 'anulada' || factura.version !== versionVista) {
    facturaCambio(nombre, factura.estado, factura.version);
  }
  const activas = factura.devoluciones.filter((d) => d.estado === 'activa');
  if (activas.length > 0) {
    throw new ErrorDeNegocio(
      'VALIDACION',
      `${nombre} tiene devoluciones activas (${activas.map((d) => d.numero).join(', ')}): no se ` +
        `puede ${accion} mientras existan. Anúlelas en ${ventana} y vuelva a intentarlo.`,
    );
  }
}

/**
 * Registra los movimientos de kardex de una corrección o una anulación.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param movimientos - Movimientos por producto.
 * @param tipo - Tipo de movimiento.
 * @param bodegaId - Bodega de la factura.
 * @param documento - Documento de la factura.
 */
function registrarKardex(
  ctx: ContextoTransaccion,
  movimientos: readonly MovimientoCorreccion[],
  tipo: TipoMovimiento,
  bodegaId: number,
  documento: { tipo: string; id: string },
): void {
  for (const m of movimientos) {
    insertarMovimiento(ctx, {
      productoCodigo: m.productoCodigo,
      bodegaId,
      tipo,
      cantidad: m.cantidad,
      costoUnitario: m.costoUnitario,
      documento,
    });
  }
}

/**
 * Cambia el costo de los productos, con su motivo en el historial.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param costos - Cambios de costo.
 * @param motivo - Motivo del historial, p. ej. `Corrección de la compra 37`.
 */
function aplicarCostos(
  ctx: ContextoTransaccion,
  costos: readonly CambioCosto[],
  motivo: string,
): void {
  for (const c of costos) {
    const producto = obtenerProducto(ctx.db, c.productoCodigo);
    if (producto && producto.costo !== c.nuevo) {
      actualizarCostoProducto(ctx, producto, c.nuevo, motivo);
    }
  }
}

/**
 * Convierte las líneas de una factura de cliente a las del dominio.
 *
 * @param factura - Factura leída.
 * @returns Líneas vigentes.
 */
function lineasVenta(factura: FacturaClienteParaCorregir): LineaVentaVigente[] {
  return factura.lineas.map((l) => ({
    renglon: l.renglon,
    producto: l.producto,
    escala: l.escala,
    cantidad: l.cantidad,
    precioEscala: l.precioEscala,
    precio: l.precio,
    costo: l.costo,
  }));
}

/**
 * Convierte las líneas de una compra a las del dominio.
 *
 * @param compra - Compra leída.
 * @returns Líneas vigentes.
 */
function lineasCompra(compra: FacturaProveedorParaCorregir): LineaCompraVigente[] {
  return compra.lineas.map((l) => ({
    renglon: l.renglon,
    producto: l.producto,
    cantidad: l.cantidad,
    costoUnitario: l.costoUnitario,
    costoNuevo: l.costoNuevo,
  }));
}

/**
 * Situación del costo de cada producto de una compra, por código.
 *
 * @param compra - Compra leída.
 * @returns Código → situación.
 */
function situaciones(compra: FacturaProveedorParaCorregir): Map<number, SituacionCosto> {
  return new Map(
    compra.costos.map((c) => [
      c.productoCodigo,
      { esUltima: c.esUltima, costoCompraAnterior: c.costoCompraAnterior },
    ]),
  );
}

/**
 * Forma de pago de una venta de contado (para su reintegro).
 *
 * @param factura - Factura de contado.
 * @returns Id de la forma de pago.
 * @throws {Error} Si la factura de contado no tiene forma de pago (dato dañado).
 */
function formaDeContado(factura: FacturaClienteParaCorregir): number {
  if (factura.formaPagoId === null) {
    throw new Error(`La factura de contado ${factura.numero} no tiene forma de pago.`);
  }
  return factura.formaPagoId;
}

/**
 * Crea el servicio de correcciones.
 *
 * @param db - Conexión abierta.
 * @param ejecutar - Ejecutor de transacciones.
 * @returns El servicio.
 */
export function crearServicioCorrecciones(
  db: BaseDeDatos,
  ejecutar: EjecutorTransacciones,
): ServicioCorrecciones {
  /**
   * Lee una factura de cliente o lanza el error para el usuario.
   *
   * @param conexion - Conexión (o la de la transacción).
   * @param id - Id de la factura.
   * @returns La factura.
   */
  const exigirVenta = (conexion: BaseDeDatos, id: number): FacturaClienteParaCorregir => {
    const factura = obtenerVentaParaCorregir(conexion, id);
    if (!factura) {
      throw new ErrorDeNegocio(
        'NO_ENCONTRADO',
        'La factura no existe. Escriba de nuevo el número y presione Intro.',
      );
    }
    return factura;
  };

  /**
   * Lee una compra o lanza el error para el usuario.
   *
   * @param conexion - Conexión (o la de la transacción).
   * @param id - Id de la compra.
   * @returns La compra.
   */
  const exigirCompra = (conexion: BaseDeDatos, id: number): FacturaProveedorParaCorregir => {
    const compra = obtenerCompraParaCorregir(conexion, id);
    if (!compra) {
      throw new ErrorDeNegocio(
        'NO_ENCONTRADO',
        'La compra no existe. Escriba de nuevo el número y presione Intro.',
      );
    }
    return compra;
  };

  /**
   * Anula una factura de cliente dentro de la transacción.
   *
   * @param ctx - Contexto de la transacción.
   * @param p - Petición.
   * @param motivo - Motivo limpio.
   * @returns Lo que hizo la anulación.
   */
  const anularVentaEn = (
    ctx: ContextoTransaccion,
    p: PeticionAnularFactura,
    motivo: string,
  ): AnulacionGuardada => {
    const factura = exigirVenta(ctx.db, p.facturaId);
    const nombre = `La factura ${factura.numero}`;
    exigirModificable(factura, p.version, nombre, 'Devolución de venta', 'anularla');
    const cartera = leerCartera(ctx.db, 'cliente', factura.id);
    const resultado = anularVenta(lineasVenta(factura), factura.condicion, cartera.total, {
      aplicadoQueda: cartera.aplicado,
      trasladado: cartera.trasladado,
      disponible: saldoFavorDe(ctx.db, 'cliente', factura.tercero.codigo),
    });
    const movimientoFavor =
      resultado.efecto.tipo === 'credito' ? resultado.efecto.movimientoFavor : 0;
    const anulada = anularFactura(
      ctx,
      'cliente',
      { id: factura.id, numero: factura.numero, version: factura.version },
      { estado: 'anulada', total: cartera.total, saldoFavor: movimientoFavor },
      motivo,
    );
    if (!anulada) {
      facturaCambio(nombre, 'anulada', factura.version);
    }
    registrarKardex(ctx, resultado.movimientos, 'anulacion_venta', factura.bodegaId, {
      tipo: 'factura_cliente',
      id: String(factura.numero),
    });
    let reintegro: ReintegroGenerado | null = null;
    if (resultado.efecto.tipo === 'contado') {
      if (resultado.efecto.devolver > 0) {
        reintegro = registrarReintegroDeVentaContado(ctx, {
          clienteCodigo: factura.tercero.codigo,
          sentido: 'entrega',
          valor: resultado.efecto.devolver,
          formaPagoId: formaDeContado(factura),
          documento: { tipo: 'anulacion_venta', id: factura.id },
          observacion: `Anulación de la factura ${factura.numero}`,
        });
      }
    } else {
      insertarMovimientoFavor(ctx, {
        tipo: 'cliente',
        terceroCodigo: factura.tercero.codigo,
        valor: movimientoFavor,
        origen: 'anulacion',
        documento: { tipo: 'anulacion_venta', id: factura.id },
        facturaId: factura.id,
      });
    }
    return {
      numero: factura.numero,
      movimientoFavor,
      reintegro,
      costos: [],
      abonoContadoAnulado: null,
    };
  };

  /**
   * Anula una compra dentro de la transacción.
   *
   * @param ctx - Contexto de la transacción.
   * @param p - Petición.
   * @param motivo - Motivo limpio.
   * @returns Lo que hizo la anulación.
   */
  const anularCompraEn = (
    ctx: ContextoTransaccion,
    p: PeticionAnularFactura,
    motivo: string,
  ): AnulacionGuardada => {
    const compra = exigirCompra(ctx.db, p.facturaId);
    const nombre = `La compra ${compra.numero}`;
    exigirModificable(compra, p.version, nombre, 'Devolución de compra', 'anularla');
    const cartera = leerCartera(ctx.db, 'proveedor', compra.id);
    const contado = compra.abonoContado ? obtenerAbono(ctx.db, compra.abonoContado.id) : null;
    const aplicadoContado =
      contado?.aplicaciones.find((a) => a.facturaId === compra.id)?.valor ?? 0;
    const resultado = anularCompra(
      lineasCompra(compra),
      {
        aplicadoQueda: cartera.aplicado - aplicadoContado,
        trasladado: cartera.trasladado,
        disponible: saldoFavorDe(ctx.db, 'proveedor', compra.tercero.codigo),
      },
      situaciones(compra),
    );
    const movimientoFavor =
      resultado.efecto.tipo === 'credito' ? resultado.efecto.movimientoFavor : 0;
    const anulada = anularFactura(
      ctx,
      'proveedor',
      { id: compra.id, numero: compra.numero, version: compra.version },
      {
        estado: 'anulada',
        total: cartera.total,
        saldoFavor: movimientoFavor,
        abonoContado: contado?.numero ?? null,
        costos: resultado.costos.map((c) => ({ ...c })),
      },
      motivo,
    );
    if (!anulada) {
      facturaCambio(nombre, 'anulada', compra.version);
    }
    if (contado) {
      anularAbono(ctx, contado, `Anulación de la compra ${compra.numero}`);
    }
    registrarKardex(ctx, resultado.movimientos, 'anulacion_compra', compra.bodegaId, {
      tipo: 'factura_proveedor',
      id: String(compra.numero),
    });
    aplicarCostos(ctx, resultado.costos, `Anulación de la compra ${compra.numero}`);
    insertarMovimientoFavor(ctx, {
      tipo: 'proveedor',
      terceroCodigo: compra.tercero.codigo,
      valor: movimientoFavor,
      origen: 'anulacion',
      documento: { tipo: 'anulacion_compra', id: compra.id },
      facturaId: compra.id,
    });
    return {
      numero: compra.numero,
      movimientoFavor,
      reintegro: null,
      costos: resultado.costos,
      abonoContadoAnulado: contado?.numero ?? null,
    };
  };

  return {
    buscarVenta(numero) {
      if (!Number.isSafeInteger(numero) || numero <= 0) {
        throw new ErrorDeNegocio('VALIDACION', 'Escriba el número de la factura (solo dígitos).');
      }
      const id = idVentaPorNumero(db, numero);
      if (id === null) {
        throw new ErrorDeNegocio(
          'NO_ENCONTRADO',
          `No existe la factura ${numero}. Revise el número; si es de un proveedor, búsquela en ` +
            'Corrección de factura de proveedor.',
        );
      }
      return exigirVenta(db, id);
    },

    buscarCompra(texto) {
      const limpio = texto.trim();
      if (limpio === '') {
        throw new ErrorDeNegocio(
          'VALIDACION',
          'Escriba la «Compra No.» o el número de la factura del proveedor.',
        );
      }
      const encontradas = buscarCompras(db, limpio);
      const [unica] = encontradas;
      if (!unica) {
        throw new ErrorDeNegocio(
          'NO_ENCONTRADO',
          `No hay ninguna compra con el número «${limpio}». Revise el número: puede escribir la ` +
            '«Compra No.» o el número de la factura del proveedor.',
        );
      }
      if (encontradas.length > 1) {
        throw new ErrorDeNegocio(
          'VALIDACION',
          `El número «${limpio}» es de varias facturas de proveedor: ` +
            `${encontradas.map((c) => `compra ${c.numero} (${c.proveedorNombre})`).join(', ')}. ` +
            'Escriba la «Compra No.» de la que quiere abrir.',
        );
      }
      return exigirCompra(db, unica.id);
    },

    corregirVenta(p) {
      const motivo = validarTextoAbono(p.motivo, 'Motivo');
      return ejecutar((ctx) => {
        const factura = exigirVenta(ctx.db, p.facturaId);
        const nombre = `La factura ${factura.numero}`;
        if (factura.origen === 'saldo_inicial') {
          throw new ErrorDeNegocio(
            'VALIDACION',
            `${nombre} es un saldo inicial importado y no tiene productos que corregir. Si el ` +
              'saldo está mal, anúlela con Ctrl+X.',
          );
        }
        exigirModificable(factura, p.version, nombre, 'Devolución de venta', 'corregirla');
        const cartera = leerCartera(ctx.db, 'cliente', factura.id);
        const calculo = corregirVenta({
          lineas: lineasVenta(factura),
          cambios: p.cambios,
          condicion: factura.condicion,
          cartera: {
            aplicado: cartera.aplicado,
            devuelto: cartera.devuelto,
            trasladado: cartera.trasladado,
            disponible: saldoFavorDe(ctx.db, 'cliente', factura.tercero.codigo),
          },
        });
        const versionId = insertarVersionVenta(ctx, {
          facturaId: factura.id,
          numero: factura.numero,
          versionAnterior: factura.version,
          total: calculo.total,
          ahorro: calculo.ahorro,
          lineas: calculo.lineas.map((l) => ({
            productoCodigo: l.productoCodigo,
            escala: l.escala,
            cantidad: l.cantidad,
            precioEscala: l.precioEscala,
            precio: l.precio,
            alterado: l.alterado,
            total: l.total,
            costo: l.costo,
          })),
          motivo,
        });
        if (versionId === null) {
          facturaCambio(nombre, factura.estado, factura.version + 1);
        }
        registrarKardex(ctx, calculo.movimientos, 'correccion_venta', factura.bodegaId, {
          tipo: 'factura_cliente',
          id: String(factura.numero),
        });
        let reintegro: ReintegroGenerado | null = null;
        let saldo = 0;
        let movimientoFavor = 0;
        if (calculo.efecto.tipo === 'contado') {
          const { devolver, cobrar } = calculo.efecto;
          if (devolver > 0 || cobrar > 0) {
            reintegro = registrarReintegroDeVentaContado(ctx, {
              clienteCodigo: factura.tercero.codigo,
              sentido: devolver > 0 ? 'entrega' : 'recibe',
              valor: devolver > 0 ? devolver : cobrar,
              formaPagoId: formaDeContado(factura),
              documento: { tipo: 'correccion_venta', id: versionId },
              observacion: `Corrección de la factura ${factura.numero}`,
            });
          }
        } else {
          saldo = calculo.efecto.saldo;
          movimientoFavor = calculo.efecto.movimientoFavor;
          insertarMovimientoFavor(ctx, {
            tipo: 'cliente',
            terceroCodigo: factura.tercero.codigo,
            valor: movimientoFavor,
            origen: 'correccion',
            documento: { tipo: 'correccion_venta', id: versionId },
            facturaId: factura.id,
          });
        }
        return {
          facturaId: factura.id,
          numero: factura.numero,
          version: factura.version + 1,
          totalAnterior: calculo.totalAnterior,
          total: calculo.total,
          saldo,
          movimientoFavor,
          reintegro,
          costos: [],
        };
      });
    },

    corregirCompra(p) {
      const motivo = validarTextoAbono(p.motivo, 'Motivo');
      return ejecutar((ctx) => {
        const compra = exigirCompra(ctx.db, p.facturaId);
        const nombre = `La compra ${compra.numero}`;
        if (compra.origen === 'saldo_inicial') {
          throw new ErrorDeNegocio(
            'VALIDACION',
            `${nombre} es un saldo inicial importado y no tiene productos que corregir. Si el ` +
              'saldo está mal, anúlela con Ctrl+X.',
          );
        }
        exigirModificable(compra, p.version, nombre, 'Devolución de compra', 'corregirla');
        const cartera = leerCartera(ctx.db, 'proveedor', compra.id);
        const lineas = lineasCompra(compra);
        const calculo = corregirCompra({
          proveedorCodigo: compra.tercero.codigo,
          lineas,
          cambios: p.cambios,
          fleteAnterior: compra.flete,
          flete: p.flete,
          fleteProveedor: compra.fleteProveedor,
          descuentoAnterior: compra.descuento,
          descuento: p.descuento,
          descuentoEnCosto: compra.descuentoEnCosto,
          totalAnterior: cartera.total,
          costos: situaciones(compra),
          cartera: {
            aplicado: cartera.aplicado,
            devuelto: cartera.devuelto,
            trasladado: cartera.trasladado,
            disponible: saldoFavorDe(ctx.db, 'proveedor', compra.tercero.codigo),
          },
        });
        const cambios = new Map(p.cambios.map((c) => [c.renglon, c]));
        const porRenglon = new Map(lineas.map((l) => [l.renglon, l]));
        const versionId = insertarVersionCompra(ctx, {
          facturaId: compra.id,
          numero: compra.numero,
          versionAnterior: compra.version,
          subtotal: calculo.calculo.subtotal,
          flete: p.flete,
          descuento: calculo.calculo.descuento,
          descuentoPorcentaje: p.descuento.modo === 'porcentaje' ? p.descuento.valor : null,
          total: calculo.calculo.total,
          lineas: calculo.calculo.lineas.map((c, i) => {
            const renglon = calculo.renglonesAnteriores[i];
            const linea = renglon === undefined ? undefined : porRenglon.get(renglon);
            if (renglon === undefined || !linea) {
              throw new Error('La corrección no devolvió el renglón de cada línea.');
            }
            const cambio = cambios.get(renglon);
            return {
              productoCodigo: linea.producto.codigo,
              cantidad: cambio?.cantidad ?? linea.cantidad,
              costoUnitario: cambio?.costoUnitario ?? linea.costoUnitario,
              total: c.total,
              flete: c.flete,
              descuento: c.descuento,
              costoNuevo: c.costoNuevo,
              costoAnterior: c.costoAnterior,
            };
          }),
          motivo,
        });
        if (versionId === null) {
          facturaCambio(nombre, compra.estado, compra.version + 1);
        }
        registrarKardex(ctx, calculo.movimientos, 'correccion_compra', compra.bodegaId, {
          tipo: 'factura_proveedor',
          id: String(compra.numero),
        });
        aplicarCostos(ctx, calculo.costos, `Corrección de la compra ${compra.numero}`);
        insertarMovimientoFavor(ctx, {
          tipo: 'proveedor',
          terceroCodigo: compra.tercero.codigo,
          valor: calculo.efecto.movimientoFavor,
          origen: 'correccion',
          documento: { tipo: 'correccion_compra', id: versionId },
          facturaId: compra.id,
        });
        return {
          facturaId: compra.id,
          numero: compra.numero,
          version: compra.version + 1,
          totalAnterior: cartera.total,
          total: calculo.calculo.total,
          saldo: calculo.efecto.saldo,
          movimientoFavor: calculo.efecto.movimientoFavor,
          reintegro: null,
          costos: calculo.costos,
        };
      });
    },

    anular(p) {
      const motivo = validarTextoAbono(p.motivo, 'Motivo');
      return ejecutar((ctx) =>
        p.tipo === 'cliente' ? anularVentaEn(ctx, p, motivo) : anularCompraEn(ctx, p, motivo),
      );
    },
  };
}
