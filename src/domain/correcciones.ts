import type { DescuentoCompra } from '../shared/compras';
import { MILESIMAS_POR_UNIDAD, type UnidadMedida } from '../shared/formato/cantidades';
import { formatearPesos } from '../shared/formato/moneda';
import type { EscalaPrecio, PreciosProducto } from '../shared/maestros';
import type { CondicionPago } from '../shared/ventas';
import { calcularCompra, type CompraCalculada } from './compras';
import { aMilesimas, aPesos, valorLinea } from './dinero';
import { ErrorDeNegocio } from './errores';
import { ajustarCartera, movimientoFavorAlAnular, type AjusteCartera } from './saldo-favor';

/**
 * Producto de una línea ya guardada, con lo que necesitan los mensajes y la
 * validación de unidades.
 */
export interface ProductoLinea {
  /** Código. */
  codigo: number;
  /** Nombre (para los mensajes). */
  nombre: string;
  /** Unidad de medida. */
  unidad: UnidadMedida;
}

/**
 * Movimiento de kardex que resulta de una corrección, una anulación o una
 * devolución, por producto (la bodega es la de la factura).
 */
export interface MovimientoCorreccion {
  /** Código del producto. */
  productoCodigo: number;
  /** Milésimas con signo: positivo entra a la bodega, negativo sale. */
  cantidad: number;
  /** Costo unitario con que se registra el movimiento. */
  costoUnitario: number;
}

/**
 * Efecto de una operación en una venta de contado, que no tiene cartera: la
 * diferencia se arregla en dinero (D-120, D-128).
 */
export interface EfectoContado {
  /** Tipo de efecto. */
  tipo: 'contado';
  /** Dinero que se le devuelve al cliente (reintegro que entrega). */
  devolver: number;
  /** Dinero que se le cobra al cliente (reintegro que recibe). */
  cobrar: number;
}

/**
 * Efecto de una operación en una factura con cartera.
 */
export interface EfectoCredito extends AjusteCartera {
  /** Tipo de efecto. */
  tipo: 'credito';
}

/**
 * Efecto de una operación en la cartera o en la caja.
 */
export type EfectoCartera = EfectoContado | EfectoCredito;

/**
 * Lo que la corrección necesita de la cartera de la factura (sin el total,
 * que sale del cálculo).
 */
export interface CarteraVigente {
  /** Suma de lo aplicado por abonos activos. */
  aplicado: number;
  /** Suma de las devoluciones activas (en una corrección siempre es 0, D-131). */
  devuelto: number;
  /** Lo que la factura ya trasladó al saldo a favor. */
  trasladado: number;
  /** Saldo a favor disponible del tercero. */
  disponible: number;
}

/**
 * Línea vigente de una factura de cliente.
 */
export interface LineaVentaVigente {
  /** Renglón en la versión vigente. */
  renglon: number;
  /** Producto. */
  producto: ProductoLinea;
  /** Escala con que se vendió. */
  escala: EscalaPrecio;
  /** Cantidad en milésimas. */
  cantidad: number;
  /** Precio de la escala al vender (base del ahorro). */
  precioEscala: number;
  /** Precio vendido. */
  precio: number;
  /** Costo del producto al vender. */
  costo: number;
}

/**
 * Cambio pedido en una línea de venta: la cantidad y el precio nuevos.
 */
export interface CambioLineaVenta {
  /** Renglón de la línea en la versión vigente. */
  renglon: number;
  /** Cantidad nueva en milésimas (0 quita la línea, D-123). */
  cantidad: number;
  /** Precio nuevo. */
  precio: number;
}

/**
 * Lo que se necesita para corregir una factura de cliente.
 */
export interface EntradaCorreccionVenta {
  /** Líneas de la versión vigente, en orden. */
  lineas: readonly LineaVentaVigente[];
  /** Cambios pedidos (las líneas sin cambio pueden faltar). */
  cambios: readonly CambioLineaVenta[];
  /** Condición de la factura. */
  condicion: CondicionPago;
  /** Cartera vigente (se ignora en contado). */
  cartera: CarteraVigente;
}

/**
 * Línea de la versión nueva de una factura de cliente.
 */
export interface LineaVentaCorregida {
  /** Renglón en la versión nueva (1, 2…). */
  renglon: number;
  /** Renglón que tenía en la versión anterior. */
  renglonAnterior: number;
  /** Código del producto. */
  productoCodigo: number;
  /** Escala (no cambia). */
  escala: EscalaPrecio;
  /** Cantidad en milésimas. */
  cantidad: number;
  /** Precio de la escala al vender (no cambia). */
  precioEscala: number;
  /** Precio nuevo. */
  precio: number;
  /** Si el precio difiere del de la escala. */
  alterado: boolean;
  /** Total: cantidad × precio, redondeado al peso (D-16). */
  total: number;
  /** Ahorro de la línea frente a la escala. */
  ahorro: number;
  /** Costo al vender (no cambia). */
  costo: number;
  /** Si el precio queda por debajo del costo: se permite con aviso (§9.1). */
  bajoCosto: boolean;
}

/**
 * Resultado de corregir una factura de cliente.
 */
export interface CorreccionVenta {
  /** Líneas de la versión nueva (sin las de cantidad 0). */
  lineas: LineaVentaCorregida[];
  /** Total anterior. */
  totalAnterior: number;
  /** Total nuevo. */
  total: number;
  /** Diferencia: total nuevo − anterior. */
  diferencia: number;
  /** «Su ahorro fue de» de la versión nueva. */
  ahorro: number;
  /** Avisos ámbar de precios por debajo del costo. */
  avisos: string[];
  /** Movimientos de kardex `correccion_venta` (positivo: reingresa). */
  movimientos: MovimientoCorreccion[];
  /** Efecto en la cartera o en la caja. */
  efecto: EfectoCartera;
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
 * Valida una cantidad corregida o devuelta.
 *
 * @param cantidad - Milésimas escritas.
 * @param producto - Producto de la línea.
 * @param renglon - Texto del renglón para el mensaje.
 * @param permitirCero - Si 0 es válido (quita la línea).
 * @throws {ErrorDeNegocio} Si no es un entero válido o no respeta la unidad.
 */
function validarCantidad(
  cantidad: number,
  producto: ProductoLinea,
  renglon: string,
  permitirCero: boolean,
): void {
  if (!Number.isSafeInteger(cantidad) || cantidad < 0 || (!permitirCero && cantidad === 0)) {
    invalido(
      `${renglon}: la cantidad no es válida. Escriba un número ${permitirCero ? 'igual o mayor que cero (0 quita la línea)' : 'mayor que cero'}.`,
    );
  }
  if (producto.unidad === 'UND' && cantidad % MILESIMAS_POR_UNIDAD !== 0) {
    invalido(
      `${renglon}: el producto se maneja por unidades. Escriba una cantidad entera, sin decimales.`,
    );
  }
}

/**
 * Valida un valor en pesos escrito en una línea (precio o costo).
 *
 * @param valor - Valor escrito.
 * @param renglon - Texto del renglón para el mensaje.
 * @param campo - «precio» o «costo».
 * @throws {ErrorDeNegocio} Si no es un entero no negativo.
 */
function validarPesos(valor: number, renglon: string, campo: string): void {
  if (!Number.isSafeInteger(valor) || valor < 0) {
    invalido(
      `${renglon}: el ${campo} no es válido. Escríbalo en pesos enteros, sin signo negativo.`,
    );
  }
}

/**
 * Indexa los cambios por renglón, validando que cada uno sea de una línea
 * existente y que no se repita.
 *
 * @param cambios - Cambios pedidos.
 * @param renglones - Renglones de la versión vigente.
 * @returns Mapa renglón → cambio.
 * @throws {ErrorDeNegocio} Si un cambio es de un renglón inexistente o repetido.
 */
function indexarCambios<T extends { renglon: number }>(
  cambios: readonly T[],
  renglones: ReadonlySet<number>,
): Map<number, T> {
  const porRenglon = new Map<number, T>();
  for (const cambio of cambios) {
    if (!renglones.has(cambio.renglon)) {
      invalido(
        `La línea ${cambio.renglon} no existe en la factura: en una corrección no se agregan ` +
          'productos. Para venderlos o comprarlos, haga una factura nueva.',
      );
    }
    if (porRenglon.has(cambio.renglon)) {
      invalido(
        `La línea ${cambio.renglon} aparece dos veces en la corrección. Vuelva a buscar la factura e intente de nuevo.`,
      );
    }
    porRenglon.set(cambio.renglon, cambio);
  }
  return porRenglon;
}

/**
 * Diferencia de cantidad por producto entre dos versiones de una factura
 * (D-132): después − antes, sin los productos que no cambian. Un producto
 * repetido en varias líneas se suma.
 *
 * @param antes - Producto y cantidad de cada línea de la versión anterior.
 * @param despues - Producto y cantidad de cada línea de la versión nueva.
 * @returns Mapa código → diferencia en milésimas (nunca 0).
 *
 * @example
 * diferenciasPorProducto([{ productoCodigo: 231, cantidad: 4000 }], [{ productoCodigo: 231, cantidad: 2000 }]);
 * // Map { 231 => -2000 }
 */
export function diferenciasPorProducto(
  antes: readonly { productoCodigo: number; cantidad: number }[],
  despues: readonly { productoCodigo: number; cantidad: number }[],
): Map<number, number> {
  const diferencias = new Map<number, number>();
  for (const { productoCodigo, cantidad } of antes) {
    diferencias.set(productoCodigo, (diferencias.get(productoCodigo) ?? 0) - cantidad);
  }
  for (const { productoCodigo, cantidad } of despues) {
    diferencias.set(productoCodigo, (diferencias.get(productoCodigo) ?? 0) + cantidad);
  }
  for (const [codigo, diferencia] of diferencias) {
    if (diferencia === 0) {
      diferencias.delete(codigo);
    }
  }
  return diferencias;
}

/**
 * Efecto de un cambio de total en una venta de contado: la diferencia se
 * devuelve o se cobra en dinero (D-120).
 *
 * @param diferencia - Total nuevo − anterior (o −valor devuelto).
 * @returns Lo que se devuelve y lo que se cobra.
 */
function efectoContado(diferencia: number): EfectoContado {
  return {
    tipo: 'contado',
    devolver: Math.max(0, -diferencia),
    cobrar: Math.max(0, diferencia),
  };
}

/**
 * Corrige una factura de cliente (§9.1): cambia cantidades y precios de las
 * líneas existentes y calcula la versión nueva, la diferencia de inventario
 * y el efecto en la cartera o en la caja.
 *
 * Reglas:
 * - No se agregan productos; cantidad 0 quita la línea; si no queda ninguna,
 *   la factura se anula en vez de corregirse (D-123).
 * - El precio puede quedar por debajo del costo: solo avisa (§9.1).
 * - La escala, el precio de la escala y el costo de cada línea no cambian;
 *   el ahorro se recalcula con ellos.
 * - Kardex: por producto, lo que se dejó de vender reingresa y lo que se
 *   vendió de más sale, al costo de la línea (D-132).
 * - Crédito: la cartera se ajusta con {@link ajustarCartera} (D-127).
 *   Contado: la diferencia se devuelve o se cobra en dinero (D-120, D-129).
 *
 * @param entrada - Líneas vigentes, cambios, condición y cartera.
 * @returns La corrección calculada.
 * @throws {ErrorDeNegocio} Si un cambio no es válido, no hay cambios o no queda ninguna línea.
 *
 * @example
 * // Factura 84772: 231 de 4 a 2 unidades y 102 de $ 2,300 a $ 1,900 (bajo su costo de 2,050).
 * corregirVenta({ lineas, condicion: 'credito', cartera: { aplicado: 70000, devuelto: 0, trasladado: 0, disponible: 0 },
 *   cambios: [{ renglon: 1, cantidad: 2000, precio: 14500 }, { renglon: 3, cantidad: 5000, precio: 1900 }] });
 * // total 48250, diferencia -31000, ahorro 8000, efecto { saldo: 0, movimientoFavor: 21750 }
 */
export function corregirVenta(entrada: EntradaCorreccionVenta): CorreccionVenta {
  const { lineas } = entrada;
  const cambios = indexarCambios(entrada.cambios, new Set(lineas.map((l) => l.renglon)));
  const avisos: string[] = [];
  const corregidas: LineaVentaCorregida[] = [];
  let hayCambio = false;
  for (const linea of lineas) {
    const texto = `Línea ${linea.renglon} (${linea.producto.codigo} - ${linea.producto.nombre})`;
    const cambio = cambios.get(linea.renglon);
    const cantidad = cambio?.cantidad ?? linea.cantidad;
    const precio = cambio?.precio ?? linea.precio;
    validarCantidad(cantidad, linea.producto, texto, true);
    validarPesos(precio, texto, 'precio');
    if (cantidad !== linea.cantidad || precio !== linea.precio) {
      hayCambio = true;
    }
    if (cantidad === 0) {
      continue;
    }
    const total = valorLinea(aPesos(precio), aMilesimas(cantidad));
    const ahorro =
      precio < linea.precioEscala
        ? valorLinea(aPesos(linea.precioEscala - precio), aMilesimas(cantidad))
        : 0;
    const bajoCosto = precio < linea.costo;
    if (bajoCosto) {
      avisos.push(
        `${texto}: ${formatearPesos(precio)} queda por debajo del costo (${formatearPesos(linea.costo)}). ` +
          'En la corrección se permite; el precio anterior y el nuevo quedan en el historial.',
      );
    }
    corregidas.push({
      renglon: corregidas.length + 1,
      renglonAnterior: linea.renglon,
      productoCodigo: linea.producto.codigo,
      escala: linea.escala,
      cantidad,
      precioEscala: linea.precioEscala,
      precio,
      alterado: precio !== linea.precioEscala,
      total,
      ahorro,
      costo: linea.costo,
      bajoCosto,
    });
  }
  if (!hayCambio) {
    invalido(
      'No hay cambios que guardar: la factura quedaría igual. Cambie una cantidad o un precio, o cierre la ventana.',
    );
  }
  if (corregidas.length === 0) {
    invalido(
      'Todas las líneas quedaron en cero. Para dejar la factura sin productos, anúlela con Ctrl+X.',
    );
  }
  const totalAnterior = lineas.reduce(
    (suma, l) => suma + valorLinea(aPesos(l.precio), aMilesimas(l.cantidad)),
    0,
  );
  const total = corregidas.reduce((suma, l) => suma + l.total, 0);
  const ahorro = corregidas.reduce((suma, l) => suma + l.ahorro, 0);
  if (!Number.isSafeInteger(total)) {
    invalido(
      'Los valores de la factura son demasiado grandes. Revise las cantidades y los precios.',
    );
  }
  const costoDe = new Map(lineas.map((l) => [l.producto.codigo, l.costo]));
  const movimientos = [
    ...diferenciasPorProducto(
      lineas.map((l) => ({ productoCodigo: l.producto.codigo, cantidad: l.cantidad })),
      corregidas,
    ),
  ].map(([productoCodigo, diferencia]) => ({
    productoCodigo,
    // Vender de más saca stock; vender de menos lo reingresa.
    cantidad: -diferencia,
    costoUnitario: costoDe.get(productoCodigo) ?? 0,
  }));
  const diferencia = total - totalAnterior;
  const efecto: EfectoCartera =
    entrada.condicion === 'contado'
      ? efectoContado(diferencia)
      : { tipo: 'credito', ...ajustarCartera({ ...entrada.cartera, total }) };
  return {
    lineas: corregidas,
    totalAnterior,
    total,
    diferencia,
    ahorro,
    avisos,
    movimientos,
    efecto,
  };
}

/**
 * Producto de una línea de compra ya guardada, con lo que necesita el
 * cálculo del costo.
 */
export interface ProductoLineaCompra extends ProductoLinea {
  /** Costo actual del producto. */
  costo: number;
  /** Precios de las tres escalas (para «revisar precios»). */
  precios: PreciosProducto;
  /** Proveedor al que pertenece. */
  proveedorCodigo: number;
}

/**
 * Línea vigente de una factura de proveedor.
 */
export interface LineaCompraVigente {
  /** Renglón en la versión vigente. */
  renglon: number;
  /** Producto. */
  producto: ProductoLineaCompra;
  /** Cantidad en milésimas. */
  cantidad: number;
  /** Costo unitario facturado. */
  costoUnitario: number;
  /** Costo nuevo que resultó para la línea (con flete y descuento). */
  costoNuevo: number;
}

/**
 * Cambio pedido en una línea de compra.
 */
export interface CambioLineaCompra {
  /** Renglón de la línea en la versión vigente. */
  renglon: number;
  /** Cantidad nueva en milésimas (0 quita la línea). */
  cantidad: number;
  /** Costo unitario nuevo. */
  costoUnitario: number;
}

/**
 * Situación del costo de un producto frente a esta compra (D-126).
 */
export interface SituacionCosto {
  /** Si esta compra es la última compra activa del producto (por orden de registro). */
  esUltima: boolean;
  /** Costo nuevo del producto en la compra activa anterior a esta, o `null` si no hay. */
  costoCompraAnterior: number | null;
}

/**
 * Lo que se necesita para corregir una factura de proveedor.
 */
export interface EntradaCorreccionCompra {
  /** Proveedor de la factura. */
  proveedorCodigo: number;
  /** Líneas de la versión vigente, en orden. */
  lineas: readonly LineaCompraVigente[];
  /** Cambios pedidos en las líneas. */
  cambios: readonly CambioLineaCompra[];
  /** Flete anterior. */
  fleteAnterior: number;
  /** Flete nuevo. */
  flete: number;
  /** Si el flete lo cobra el proveedor (D-59, no cambia). */
  fleteProveedor: boolean;
  /** Descuento anterior. */
  descuentoAnterior: DescuentoCompra;
  /** Descuento nuevo. */
  descuento: DescuentoCompra;
  /** Si el descuento se reparte en el costo (D-47, no cambia). */
  descuentoEnCosto: boolean;
  /** Total anterior de la factura. */
  totalAnterior: number;
  /** Situación del costo de cada producto de la factura (código → situación). */
  costos: ReadonlyMap<number, SituacionCosto>;
  /** Cartera vigente. */
  cartera: CarteraVigente;
}

/**
 * Cambio del costo de un producto que hace una corrección o una anulación de compra.
 */
export interface CambioCosto {
  /** Código del producto. */
  productoCodigo: number;
  /** Costo actual. */
  anterior: number;
  /** Costo con que queda. */
  nuevo: number;
}

/**
 * Resultado de corregir una factura de proveedor.
 */
export interface CorreccionCompra {
  /** Cálculo de la versión nueva (líneas, flete, descuento, total y costos de línea). */
  calculo: CompraCalculada;
  /** Renglón anterior de cada línea de la versión nueva, en el mismo orden. */
  renglonesAnteriores: number[];
  /** Diferencia: total nuevo − anterior. */
  diferencia: number;
  /** Costos de producto que cambian (solo los de las compras que son la última, D-126). */
  costos: CambioCosto[];
  /** Avisos (productos quitados cuyo costo vuelve al de la compra anterior). */
  avisos: string[];
  /** Movimientos de kardex `correccion_compra` (positivo: entra más). */
  movimientos: MovimientoCorreccion[];
  /** Efecto en la cartera. */
  efecto: EfectoCredito;
}

/**
 * Indica si dos descuentos de compra son iguales.
 *
 * @param a - Descuento.
 * @param b - Otro descuento.
 * @returns `true` si tienen el mismo modo y valor.
 */
function mismoDescuento(a: DescuentoCompra, b: DescuentoCompra): boolean {
  return a.modo === b.modo && a.valor === b.valor;
}

/**
 * Costo con que queda un producto al anular su última compra (o al quitarlo
 * de ella en una corrección), según D-126: vuelve al costo de la compra
 * activa anterior si existe; si no, se queda.
 *
 * @param productoCodigo - Código del producto.
 * @param costoActual - Costo actual del producto.
 * @param situacion - Si la compra es la última y el costo de la anterior.
 * @returns El cambio de costo, o `null` si el costo no cambia.
 *
 * @example
 * costoTrasQuitarCompra(231, 12311, { esUltima: true, costoCompraAnterior: 12100 });
 * // { productoCodigo: 231, anterior: 12311, nuevo: 12100 }
 */
export function costoTrasQuitarCompra(
  productoCodigo: number,
  costoActual: number,
  situacion: SituacionCosto | undefined,
): CambioCosto | null {
  if (
    !situacion?.esUltima ||
    situacion.costoCompraAnterior === null ||
    situacion.costoCompraAnterior === costoActual
  ) {
    return null;
  }
  return { productoCodigo, anterior: costoActual, nuevo: situacion.costoCompraAnterior };
}

/**
 * Corrige una factura de proveedor (§9.1): cambia cantidades, costos
 * unitarios, flete y descuento, y calcula la versión nueva con el mismo
 * cálculo de la compra (reparto del flete y del descuento, costo nuevo por
 * línea, D-43), la diferencia de inventario, los costos de producto que
 * cambian y el efecto en la cartera.
 *
 * Reglas:
 * - No se agregan productos; cantidad 0 quita la línea; si no queda ninguna,
 *   la compra se anula en vez de corregirse (D-123).
 * - El costo del producto cambia solo si esta compra es su última compra
 *   activa (D-126). Si se quita el producto de su última compra, el costo
 *   vuelve al de la compra anterior, con aviso.
 * - Kardex: por producto, lo que se compró de más entra y lo que se compró
 *   de menos sale, al costo nuevo de la línea (D-132).
 * - La cartera se ajusta con {@link ajustarCartera}; una compra de contado
 *   tiene su abono automático como aplicado (D-48, D-127).
 *
 * @param entrada - Líneas vigentes, cambios, flete, descuento, costos y cartera.
 * @returns La corrección calculada.
 * @throws {ErrorDeNegocio} Si un cambio no es válido, no hay cambios o no queda ninguna línea.
 *
 * @example
 * // Compra 37: 231 de 50 a 48 unidades y el queso de $ 18,500 a $ 17,900 el kilo, con flete de 40,000:
 * // 231 queda en (566,400 + 24,509) / 48 = 12,311 y es su última compra, así que su costo cambia.
 * corregirCompra(entrada); // total 924400, diferencia -35600, costos [{ productoCodigo: 231, anterior: 12292, nuevo: 12311 }]
 */
export function corregirCompra(entrada: EntradaCorreccionCompra): CorreccionCompra {
  const { lineas } = entrada;
  const cambios = indexarCambios(entrada.cambios, new Set(lineas.map((l) => l.renglon)));
  let hayCambio =
    entrada.flete !== entrada.fleteAnterior ||
    !mismoDescuento(entrada.descuento, entrada.descuentoAnterior);
  const quedan: { linea: LineaCompraVigente; cantidad: number; costoUnitario: number }[] = [];
  for (const linea of lineas) {
    const texto = `Línea ${linea.renglon} (${linea.producto.codigo} - ${linea.producto.nombre})`;
    const cambio = cambios.get(linea.renglon);
    const cantidad = cambio?.cantidad ?? linea.cantidad;
    const costoUnitario = cambio?.costoUnitario ?? linea.costoUnitario;
    validarCantidad(cantidad, linea.producto, texto, true);
    validarPesos(costoUnitario, texto, 'costo');
    if (cantidad !== linea.cantidad || costoUnitario !== linea.costoUnitario) {
      hayCambio = true;
    }
    if (cantidad > 0) {
      quedan.push({ linea, cantidad, costoUnitario });
    }
  }
  if (!hayCambio) {
    invalido(
      'No hay cambios que guardar: la compra quedaría igual. Cambie una cantidad, un costo, el flete o el descuento, o cierre la ventana.',
    );
  }
  if (quedan.length === 0) {
    invalido(
      'Todas las líneas quedaron en cero. Para dejar la compra sin productos, anúlela con Ctrl+X.',
    );
  }
  const calculo = calcularCompra({
    proveedorCodigo: entrada.proveedorCodigo,
    // Los productos inactivos no se compran, pero una línea ya comprada sí se corrige.
    lineas: quedan.map(({ linea, cantidad, costoUnitario }) => ({
      producto: { ...linea.producto, activo: true },
      cantidad,
      costoUnitario,
    })),
    flete: entrada.flete,
    fleteProveedor: entrada.fleteProveedor,
    descuento: entrada.descuento,
    descuentoEnCosto: entrada.descuentoEnCosto,
  });

  const costos: CambioCosto[] = [];
  const avisos: string[] = [];
  const productos = new Map(lineas.map((l) => [l.producto.codigo, l.producto]));
  for (const [codigo, producto] of productos) {
    const situacion = entrada.costos.get(codigo);
    const nuevo = calculo.costosNuevos.get(codigo);
    if (nuevo === undefined) {
      const cambio = costoTrasQuitarCompra(codigo, producto.costo, situacion);
      if (cambio) {
        costos.push(cambio);
        avisos.push(
          `${codigo} - ${producto.nombre}: se quitó de su última compra; su costo vuelve al de la ` +
            `compra anterior (${formatearPesos(cambio.nuevo)}).`,
        );
      }
    } else if (situacion?.esUltima && nuevo !== producto.costo) {
      costos.push({ productoCodigo: codigo, anterior: producto.costo, nuevo });
    }
  }

  const costoMovimiento = new Map(lineas.map((l) => [l.producto.codigo, l.costoNuevo]));
  for (const [codigo, costo] of calculo.costosNuevos) {
    costoMovimiento.set(codigo, costo);
  }
  const movimientos = [
    ...diferenciasPorProducto(
      lineas.map((l) => ({ productoCodigo: l.producto.codigo, cantidad: l.cantidad })),
      quedan.map((q) => ({ productoCodigo: q.linea.producto.codigo, cantidad: q.cantidad })),
    ),
  ].map(([productoCodigo, cantidad]) => ({
    productoCodigo,
    cantidad,
    costoUnitario: costoMovimiento.get(productoCodigo) ?? 0,
  }));

  return {
    calculo,
    renglonesAnteriores: quedan.map((q) => q.linea.renglon),
    diferencia: calculo.total - entrada.totalAnterior,
    costos,
    avisos,
    movimientos,
    efecto: { tipo: 'credito', ...ajustarCartera({ ...entrada.cartera, total: calculo.total }) },
  };
}

/**
 * Lo que la anulación necesita de la cartera de la factura.
 */
export interface CarteraAnulacion {
  /** Lo aplicado por los abonos que siguen activos tras anular (sin el automático de contado). */
  aplicadoQueda: number;
  /** Lo que la factura ya trasladó al saldo a favor. */
  trasladado: number;
  /** Saldo a favor disponible del tercero. */
  disponible: number;
}

/**
 * Resultado de anular una factura.
 */
export interface Anulacion {
  /** Movimientos de kardex `anulacion_*` (revierten todo lo que movió la factura). */
  movimientos: MovimientoCorreccion[];
  /** Efecto en la caja (venta de contado) o en el saldo a favor. */
  efecto: EfectoContado | { tipo: 'credito'; movimientoFavor: number };
  /** Costos de producto que vuelven al de la compra anterior (solo compras, D-126). */
  costos: CambioCosto[];
  /** Avisos para mostrar al confirmar (cambios de costo). */
  avisos: string[];
}

/**
 * Suma las cantidades de las líneas por producto, conservando el primer costo.
 *
 * @param lineas - Producto, cantidad y costo de cada línea.
 * @returns Movimientos por producto con la cantidad sumada (positiva).
 */
function sumarPorProducto(
  lineas: readonly { productoCodigo: number; cantidad: number; costoUnitario: number }[],
): MovimientoCorreccion[] {
  const porProducto = new Map<number, MovimientoCorreccion>();
  for (const { productoCodigo, cantidad, costoUnitario } of lineas) {
    const previo = porProducto.get(productoCodigo);
    porProducto.set(productoCodigo, {
      productoCodigo,
      cantidad: (previo?.cantidad ?? 0) + cantidad,
      costoUnitario: previo?.costoUnitario ?? costoUnitario,
    });
  }
  return [...porProducto.values()];
}

/**
 * Anula una factura de cliente (§9.1, D-121): todo lo vendido reingresa a
 * la bodega; a crédito, lo pagado pasa a saldo a favor; de contado, se le
 * devuelve el total en dinero. Un saldo inicial (sin líneas) no mueve kardex.
 *
 * @param lineas - Líneas de la versión vigente (vacío en un saldo inicial).
 * @param condicion - Condición de la factura.
 * @param total - Total vigente.
 * @param cartera - Cartera tras anular (se ignora en contado).
 * @returns Movimientos y efecto de la anulación.
 * @throws {ErrorDeNegocio} Si el saldo a favor que generó la factura ya se usó.
 *
 * @example
 * anularVenta(lineas84772, 'credito', 79250, { aplicadoQueda: 70000, trasladado: 0, disponible: 0 });
 * // efecto { tipo: 'credito', movimientoFavor: 70000 }; reingresan 4 de 231, 5 de 101 y 5 de 102
 */
export function anularVenta(
  lineas: readonly LineaVentaVigente[],
  condicion: CondicionPago,
  total: number,
  cartera: CarteraAnulacion,
): Anulacion {
  const movimientos = sumarPorProducto(
    lineas.map((l) => ({
      productoCodigo: l.producto.codigo,
      cantidad: l.cantidad,
      costoUnitario: l.costo,
    })),
  );
  const efecto =
    condicion === 'contado'
      ? efectoContado(-total)
      : {
          tipo: 'credito' as const,
          movimientoFavor: movimientoFavorAlAnular(
            cartera.aplicadoQueda,
            cartera.trasladado,
            cartera.disponible,
          ),
        };
  return { movimientos, efecto, costos: [], avisos: [] };
}

/**
 * Anula una factura de proveedor (§9.1, D-121, D-126): todo lo comprado sale
 * de la bodega (el stock puede quedar negativo, D-77); lo pagado por abonos
 * manuales pasa a saldo a favor (el abono automático de contado se anula con
 * la compra, así que no cuenta en `aplicadoQueda`); y el costo de cada
 * producto del que esta era la última compra vuelve al de la compra anterior,
 * con aviso.
 *
 * @param lineas - Líneas de la versión vigente (vacío en un saldo inicial).
 * @param cartera - Cartera tras anular.
 * @param costos - Situación del costo de cada producto de la compra.
 * @returns Movimientos, efecto y cambios de costo.
 * @throws {ErrorDeNegocio} Si el saldo a favor que generó la compra ya se usó.
 *
 * @example
 * // Compra 39 a crédito con el abono manual 61 por 200,000:
 * anularCompra(lineas39, { aplicadoQueda: 200000, trasladado: 0, disponible: 0 }, costos);
 * // efecto { tipo: 'credito', movimientoFavor: 200000 }
 */
export function anularCompra(
  lineas: readonly LineaCompraVigente[],
  cartera: CarteraAnulacion,
  costos: ReadonlyMap<number, SituacionCosto>,
): Anulacion {
  const movimientos = sumarPorProducto(
    lineas.map((l) => ({
      productoCodigo: l.producto.codigo,
      cantidad: -l.cantidad,
      costoUnitario: l.costoNuevo,
    })),
  );
  const cambios: CambioCosto[] = [];
  const avisos: string[] = [];
  const productos = new Map(lineas.map((l) => [l.producto.codigo, l.producto]));
  for (const [codigo, producto] of productos) {
    const cambio = costoTrasQuitarCompra(codigo, producto.costo, costos.get(codigo));
    if (cambio) {
      cambios.push(cambio);
      avisos.push(
        `${codigo} - ${producto.nombre}: era su última compra; el costo vuelve de ` +
          `${formatearPesos(cambio.anterior)} a ${formatearPesos(cambio.nuevo)} (compra anterior).`,
      );
    }
  }
  return {
    movimientos,
    efecto: {
      tipo: 'credito',
      movimientoFavor: movimientoFavorAlAnular(
        cartera.aplicadoQueda,
        cartera.trasladado,
        cartera.disponible,
      ),
    },
    costos: cambios,
    avisos,
  };
}
