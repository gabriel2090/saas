import { formatearCantidad, MILESIMAS_POR_UNIDAD } from '../shared/formato/cantidades';
import type { CondicionPago } from '../shared/ventas';
import {
  type CarteraVigente,
  type EfectoCartera,
  type EfectoCredito,
  type MovimientoCorreccion,
  type ProductoLinea,
} from './correcciones';
import { aMilesimas, aPesos, valorLinea } from './dinero';
import { ErrorDeNegocio } from './errores';
import { ajustarCartera } from './saldo-favor';
import { limpiarTexto } from './texto';

/**
 * Tipo de devolución: de venta (reingresa stock) o de compra (sale stock).
 */
export type TipoDevolucion = 'venta' | 'compra';

/**
 * Largo máximo del motivo de una devolución.
 */
export const LARGO_MAXIMO_MOTIVO_DEVOLUCION = 150;

/**
 * Línea de la versión vigente de la factura que se puede devolver.
 */
export interface LineaDevolvible {
  /** Renglón en la versión vigente. */
  renglon: number;
  /** Producto. */
  producto: ProductoLinea;
  /** Cantidad vendida o comprada, en milésimas. */
  cantidad: number;
  /** Precio vendido (venta) o costo unitario facturado (compra) (D-131). */
  valorUnitario: number;
  /** Costo con que se mueve el kardex: el de la venta o el costo nuevo de la línea de compra. */
  costoUnitario: number;
}

/**
 * Cantidad pedida para devolver de una línea.
 */
export interface LineaPedida {
  /** Renglón de la factura. */
  renglon: number;
  /** Cantidad a devolver en milésimas (0 no devuelve esa línea). */
  cantidad: number;
}

/**
 * Lo que se necesita para calcular una devolución.
 */
export interface EntradaDevolucion {
  /** Tipo de devolución. */
  tipo: TipoDevolucion;
  /** Líneas de la versión vigente de la factura. */
  lineas: readonly LineaDevolvible[];
  /** Lo ya devuelto por devoluciones activas, por renglón (milésimas). */
  yaDevuelto: ReadonlyMap<number, number>;
  /** Cantidades pedidas. */
  pedidas: readonly LineaPedida[];
}

/**
 * Línea de la devolución calculada.
 */
export interface LineaDevolucion {
  /** Renglón en la devolución (1, 2…). */
  renglon: number;
  /** Renglón de la factura. */
  facturaRenglon: number;
  /** Código del producto. */
  productoCodigo: number;
  /** Cantidad devuelta en milésimas. */
  cantidad: number;
  /** Precio vendido o costo unitario facturado. */
  valorUnitario: number;
  /** Total: cantidad × valor unitario, redondeado al peso (D-16). */
  total: number;
  /** Costo con que se mueve el kardex. */
  costoUnitario: number;
}

/**
 * Devolución calculada.
 */
export interface DevolucionCalculada {
  /** Líneas con cantidad mayor que cero. */
  lineas: LineaDevolucion[];
  /** Total de la devolución. */
  total: number;
  /** Movimientos de kardex `devolucion_*` (venta: entra; compra: sale). */
  movimientos: MovimientoCorreccion[];
}

/**
 * Lanza un error de validación con el mensaje dado.
 *
 * @param mensaje - Mensaje en español para el usuario.
 * @throws {ErrorDeNegocio} Siempre.
 */
function invalido(mensaje: string): never {
  throw new ErrorDeNegocio('VALIDACION', mensaje);
}

/**
 * Lo que todavía se puede devolver de una línea: lo vendido o comprado
 * menos lo ya devuelto.
 *
 * @param linea - Línea de la factura.
 * @param yaDevuelto - Lo ya devuelto por renglón.
 * @returns Milésimas que se pueden devolver (≥ 0).
 */
export function puedeDevolver(
  linea: LineaDevolvible,
  yaDevuelto: ReadonlyMap<number, number>,
): number {
  return Math.max(0, linea.cantidad - (yaDevuelto.get(linea.renglon) ?? 0));
}

/**
 * Pide devolver todo lo que queda de cada línea («Devolver todo»).
 *
 * @param lineas - Líneas de la factura.
 * @param yaDevuelto - Lo ya devuelto por renglón.
 * @returns Cantidades pedidas.
 */
export function devolverTodo(
  lineas: readonly LineaDevolvible[],
  yaDevuelto: ReadonlyMap<number, number>,
): LineaPedida[] {
  return lineas.map((l) => ({ renglon: l.renglon, cantidad: puedeDevolver(l, yaDevuelto) }));
}

/**
 * Valida y calcula una devolución de venta o de compra (§9.2, D-131):
 *
 * - Cada cantidad pedida es de un renglón de la factura, una sola vez, en
 *   milésimas enteras (unidades enteras en UND), sin pasar de lo que se
 *   puede devolver.
 * - Valor de cada línea = cantidad × precio vendido (venta) o × costo
 *   unitario facturado (compra), redondeado al peso.
 * - Kardex: la venta reingresa al costo de la línea; la compra sale al
 *   costo nuevo de la línea.
 *
 * @param entrada - Tipo, líneas, lo ya devuelto y lo pedido.
 * @returns La devolución calculada.
 * @throws {ErrorDeNegocio} Si una cantidad no es válida o no hay nada que devolver.
 *
 * @example
 * // Factura 84790: devolver 40 cajas de 101 a $ 1,950.
 * calcularDevolucion({ tipo: 'venta', lineas, yaDevuelto: new Map([[2, 2000]]), pedidas: [{ renglon: 1, cantidad: 40000 }] });
 * // { total: 78000, movimientos: [{ productoCodigo: 101, cantidad: 40000, costoUnitario: 1420 }], … }
 */
export function calcularDevolucion(entrada: EntradaDevolucion): DevolucionCalculada {
  const porRenglon = new Map(entrada.lineas.map((l) => [l.renglon, l]));
  const vistas = new Set<number>();
  const lineas: LineaDevolucion[] = [];
  for (const { renglon, cantidad } of entrada.pedidas) {
    const linea = porRenglon.get(renglon);
    if (!linea) {
      invalido(
        `La línea ${renglon} no existe en la factura. Vuelva a buscar la factura e intente de nuevo.`,
      );
    }
    if (vistas.has(renglon)) {
      invalido(
        `La línea ${renglon} aparece dos veces en la devolución. Vuelva a buscar la factura e intente de nuevo.`,
      );
    }
    vistas.add(renglon);
    const texto = `Línea ${renglon} (${linea.producto.codigo} - ${linea.producto.nombre})`;
    if (!Number.isSafeInteger(cantidad) || cantidad < 0) {
      invalido(
        `${texto}: la cantidad a devolver no es válida. Escriba un número igual o mayor que cero.`,
      );
    }
    if (cantidad === 0) {
      continue;
    }
    if (linea.producto.unidad === 'UND' && cantidad % MILESIMAS_POR_UNIDAD !== 0) {
      invalido(
        `${texto}: el producto se maneja por unidades. Escriba una cantidad entera, sin decimales.`,
      );
    }
    const disponible = puedeDevolver(linea, entrada.yaDevuelto);
    if (cantidad > disponible) {
      invalido(
        `${texto}: se pueden devolver máximo ${formatearCantidad(disponible, linea.producto.unidad)} ` +
          `(${entrada.tipo === 'venta' ? 'vendido' : 'comprado'} ` +
          `${formatearCantidad(linea.cantidad, linea.producto.unidad)}, ya devuelto ` +
          `${formatearCantidad(linea.cantidad - disponible, linea.producto.unidad)}). Corrija la cantidad.`,
      );
    }
    lineas.push({
      renglon: lineas.length + 1,
      facturaRenglon: renglon,
      productoCodigo: linea.producto.codigo,
      cantidad,
      valorUnitario: linea.valorUnitario,
      total: valorLinea(aPesos(linea.valorUnitario), aMilesimas(cantidad)),
      costoUnitario: linea.costoUnitario,
    });
  }
  if (lineas.length === 0) {
    invalido('Escriba la cantidad a devolver en al menos una línea.');
  }
  const total = lineas.reduce((suma, l) => suma + l.total, 0);
  if (!Number.isSafeInteger(total)) {
    invalido('Los valores de la devolución son demasiado grandes. Revise las cantidades.');
  }
  if (total === 0) {
    invalido(
      'La devolución no puede quedar en $ 0: las líneas devueltas no tienen valor. Para mover ' +
        'mercancía sin valor, use un ajuste de inventario.',
    );
  }
  const signo = entrada.tipo === 'venta' ? 1 : -1;
  const porProducto = new Map<number, MovimientoCorreccion>();
  for (const l of lineas) {
    const previo = porProducto.get(l.productoCodigo);
    porProducto.set(l.productoCodigo, {
      productoCodigo: l.productoCodigo,
      cantidad: (previo?.cantidad ?? 0) + signo * l.cantidad,
      costoUnitario: previo?.costoUnitario ?? l.costoUnitario,
    });
  }
  return { lineas, total, movimientos: [...porProducto.values()] };
}

/**
 * Efecto de una devolución en la cartera o en la caja (§9.2, D-120): en una
 * factura a crédito (o en cualquier compra) reduce el saldo y, si pasa de
 * él, el resto queda a favor del tercero; en una venta de contado, se le
 * devuelve el dinero.
 *
 * @param total - Total de la devolución.
 * @param condicion - Condición de la factura (las compras van como `credito`).
 * @param totalFactura - Total vigente de la factura.
 * @param cartera - Cartera vigente (`devuelto` sin esta devolución).
 * @returns El efecto.
 *
 * @example
 * // Factura 84790: total 489,000, abonado 100,000, devuelto 37,800; se devuelven 78,000.
 * efectoDevolucion(78000, 'credito', 489000, { aplicado: 100000, devuelto: 37800, trasladado: 0, disponible: 0 });
 * // { tipo: 'credito', saldo: 273200, movimientoFavor: 0 }
 */
export function efectoDevolucion(
  total: number,
  condicion: CondicionPago,
  totalFactura: number,
  cartera: CarteraVigente,
): EfectoCartera {
  if (condicion === 'contado') {
    return { tipo: 'contado', devolver: total, cobrar: 0 };
  }
  return {
    tipo: 'credito',
    ...ajustarCartera({ ...cartera, total: totalFactura, devuelto: cartera.devuelto + total }),
  };
}

/**
 * Efecto de anular una devolución (D-131): la factura vuelve a deber lo
 * devuelto. Primero recupera el saldo a favor que había trasladado, hasta lo
 * que el tercero todavía tenga disponible (como una corrección que sube el
 * total, D-127); si el tercero ya lo usó, esa parte queda como saldo de la
 * factura. En una venta de contado, el dinero devuelto se vuelve a cobrar.
 *
 * @param total - Total de la devolución anulada.
 * @param condicion - Condición de la factura (las compras van como `credito`).
 * @param totalFactura - Total vigente de la factura.
 * @param cartera - Cartera vigente (`devuelto` todavía incluye esta devolución).
 * @returns El efecto en la cartera o lo que se cobra en contado.
 *
 * @example
 * // Compra 37 v2: total 924,400, pagado 960,000, trasladados 125,100 (35,600 + 89,500).
 * efectoAnularDevolucion(89500, 'credito', 924400, { aplicado: 960000, devuelto: 89500, trasladado: 125100, disponible: 125100 });
 * // { tipo: 'credito', saldo: 0, movimientoFavor: -89500 }
 */
export function efectoAnularDevolucion(
  total: number,
  condicion: CondicionPago,
  totalFactura: number,
  cartera: CarteraVigente,
): { tipo: 'contado'; cobrar: number } | EfectoCredito {
  if (condicion === 'contado') {
    return { tipo: 'contado', cobrar: total };
  }
  return {
    tipo: 'credito',
    ...ajustarCartera({ ...cartera, total: totalFactura, devuelto: cartera.devuelto - total }),
  };
}

/**
 * Valida el motivo de una devolución (opcional).
 *
 * @param motivo - Texto escrito.
 * @returns Motivo limpio (puede ser vacío).
 * @throws {ErrorDeNegocio} Si es muy largo.
 */
export function validarMotivoDevolucion(motivo: string): string {
  const limpio = limpiarTexto(motivo);
  if (limpio.length > LARGO_MAXIMO_MOTIVO_DEVOLUCION) {
    invalido(`El motivo admite máximo ${LARGO_MAXIMO_MOTIVO_DEVOLUCION} caracteres. Acórtelo.`);
  }
  return limpio;
}
