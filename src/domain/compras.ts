import { MILESIMAS_POR_UNIDAD, type UnidadMedida } from '../shared/formato/cantidades';
import type { DescuentoCompra } from '../shared/compras';
import type { EscalaPrecio, PreciosProducto } from '../shared/maestros';
import { aMilesimas, aPesos, valorLinea } from './dinero';
import { ErrorDeNegocio } from './errores';
import { escalasBajoCosto } from './ganancia';
import { limpiarTexto } from './texto';

/**
 * Centésimas de porcentaje que equivalen al 100 % (D-69).
 */
export const CIEN_POR_CIENTO = 10_000;

/**
 * Variación del costo, en porcentaje, a partir de la cual se marca la línea (D-65).
 */
export const UMBRAL_VARIACION_COSTO = 25;

/**
 * Largo máximo del número de factura del proveedor y de la orden de compra.
 */
export const LARGO_MAXIMO_NUMERO_DOCUMENTO = 40;

/**
 * Lo que el cálculo necesita saber del producto de una línea.
 */
export interface ProductoCompra {
  /** Código. */
  codigo: number;
  /** Nombre (para los mensajes). */
  nombre: string;
  /** Unidad de medida. */
  unidad: UnidadMedida;
  /** Costo actual (antes de la compra). */
  costo: number;
  /** Precios de las tres escalas. */
  precios: PreciosProducto;
  /** Proveedor al que pertenece. */
  proveedorCodigo: number;
  /** Si está activo. */
  activo: boolean;
}

/**
 * Línea de compra con su producto.
 */
export interface LineaCompraEntrada {
  /** Producto de la línea. */
  producto: ProductoCompra;
  /** Cantidad en milésimas. */
  cantidad: number;
  /** Costo unitario facturado. */
  costoUnitario: number;
}

/**
 * Lo que se necesita para calcular una compra.
 */
export interface EntradaCompra {
  /** Proveedor de la factura. */
  proveedorCodigo: number;
  /** Líneas en el orden en que se escribieron. */
  lineas: readonly LineaCompraEntrada[];
  /** Flete a distribuir en el costo. */
  flete: number;
  /** Si el flete lo cobra el proveedor (D-59). */
  fleteProveedor: boolean;
  /** Descuento escrito. */
  descuento: DescuentoCompra;
  /** Si el descuento se reparte en el costo (D-47). */
  descuentoEnCosto: boolean;
}

/**
 * Resultado del cálculo de una línea.
 */
export interface LineaCompraCalculada {
  /** Total de la línea: cantidad × costo unitario, redondeado al peso (D-16). */
  total: number;
  /** Parte del flete que le toca. */
  flete: number;
  /** Parte del descuento que le toca (0 si no se reparte en el costo). */
  descuento: number;
  /**
   * Costo con que queda el producto: el de la línea, o el promedio ponderado
   * si el producto se repite en varias líneas (D-56, D-70).
   */
  costoNuevo: number;
  /** Costo del producto antes de la compra. */
  costoAnterior: number;
  /** Escalas que quedan por debajo del costo nuevo: «revisar precios» (D-64). */
  escalasBajoCosto: EscalaPrecio[];
  /** Variación del costo en décimas de porcentaje, o `null` si el costo anterior es 0. */
  variacion: number | null;
  /** Si la variación supera {@link UMBRAL_VARIACION_COSTO} (D-65). */
  variacionAlta: boolean;
  /** Si el producto pertenece a otro proveedor (D-50). */
  otroProveedor: boolean;
}

/**
 * Resultado del cálculo de una compra.
 */
export interface CompraCalculada {
  /** Líneas calculadas, en el mismo orden. */
  lineas: LineaCompraCalculada[];
  /** Suma de los totales de las líneas. */
  subtotal: number;
  /** Descuento en pesos. */
  descuento: number;
  /** Total a pagar al proveedor. */
  total: number;
  /** Costo nuevo de cada producto (los que cambian y los que no). */
  costosNuevos: Map<number, number>;
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
 * Divide un entero no negativo entre otro positivo, redondeando al entero
 * más cercano (las mitades hacia arriba), con aritmética entera.
 *
 * @param numerador - Dividendo (≥ 0).
 * @param divisor - Divisor (> 0).
 * @returns Cociente redondeado.
 */
function dividirRedondeado(numerador: number, divisor: number): number {
  const cociente = Math.floor(numerador / divisor);
  const resto = numerador - cociente * divisor;
  return resto * 2 >= divisor ? cociente + 1 : cociente;
}

/**
 * Reparte un valor entero entre varias partes en proporción a sus pesos, con
 * el método del mayor residuo: cada parte recibe la parte entera de su cuota
 * y los pesos que sobran van, uno por uno, a las de mayor fracción (a igual
 * fracción, a la primera). Así la suma da exactamente el valor (S-04, D-70).
 *
 * @param valor - Valor a repartir (entero ≥ 0).
 * @param pesos - Peso de cada parte (enteros ≥ 0).
 * @returns Valor de cada parte, en el mismo orden.
 * @throws {ErrorDeNegocio} Si hay valor que repartir y todos los pesos son cero.
 *
 * @example
 * repartirProporcional(100, [1, 1, 1]); // [34, 33, 33]
 * repartirProporcional(30000, [189600, 292950, 336000, 145000]); // [5903, 9121, 10461, 4515]
 */
export function repartirProporcional(valor: number, pesos: readonly number[]): number[] {
  if (valor === 0) {
    return pesos.map(() => 0);
  }
  const suma = pesos.reduce((a, b) => a + b, 0);
  if (suma === 0) {
    invalido('No hay sobre qué repartir: el total de las líneas es cero.');
  }
  // valor × peso puede pasar del rango seguro de `number`: se usa BigInt.
  const valorG = BigInt(valor);
  const sumaG = BigInt(suma);
  const partes = pesos.map((p) => Number((valorG * BigInt(p)) / sumaG));
  const residuos = pesos.map((p, i) => ({ i, resto: (valorG * BigInt(p)) % sumaG }));
  let sobrante = valor - partes.reduce((a, b) => a + b, 0);
  residuos.sort((a, b) => (a.resto === b.resto ? a.i - b.i : a.resto > b.resto ? -1 : 1));
  for (const { i } of residuos) {
    if (sobrante === 0) {
      break;
    }
    partes[i] = (partes[i] ?? 0) + 1;
    sobrante -= 1;
  }
  return partes;
}

/**
 * Calcula el descuento en pesos.
 *
 * @param subtotal - Subtotal de los productos.
 * @param descuento - Descuento escrito.
 * @returns Descuento en pesos.
 * @throws {ErrorDeNegocio} Si no es válido o supera el subtotal.
 *
 * @example
 * calcularDescuento(963550, { modo: 'porcentaje', valor: 200 }); // 19271 (2 %)
 * calcularDescuento(963550, { modo: 'pesos', valor: 20000 });    // 20000
 */
export function calcularDescuento(subtotal: number, descuento: DescuentoCompra): number {
  if (!Number.isSafeInteger(descuento.valor) || descuento.valor < 0) {
    invalido('El descuento debe ser un valor positivo, sin signo negativo.');
  }
  if (descuento.modo === 'porcentaje') {
    if (descuento.valor > CIEN_POR_CIENTO) {
      invalido('El descuento no puede pasar del 100 %.');
    }
    if (!Number.isSafeInteger(subtotal * descuento.valor)) {
      invalido('Los valores de la compra son demasiado grandes.');
    }
    return dividirRedondeado(subtotal * descuento.valor, CIEN_POR_CIENTO);
  }
  if (descuento.valor > subtotal) {
    invalido('El descuento no puede ser mayor que el subtotal de la compra.');
  }
  return descuento.valor;
}

/**
 * Costo unitario que resulta de un valor neto y una cantidad: valor ÷
 * cantidad, redondeado al peso (D-70).
 *
 * @param valorNeto - Valor de la mercancía con flete y descuento.
 * @param cantidad - Cantidad en milésimas (> 0).
 * @returns Costo por unidad o por kilogramo.
 * @throws {ErrorDeNegocio} Si el resultado excede el rango seguro.
 *
 * @example
 * costoUnitarioResultante(195503, 24000); // 8146
 */
export function costoUnitarioResultante(valorNeto: number, cantidad: number): number {
  const numerador = valorNeto * MILESIMAS_POR_UNIDAD;
  if (!Number.isSafeInteger(numerador)) {
    invalido('Los valores de la compra son demasiado grandes.');
  }
  return dividirRedondeado(Math.max(numerador, 0), cantidad);
}

/**
 * Variación del costo nuevo frente al anterior, en décimas de porcentaje
 * redondeadas (las mitades se alejan de cero).
 *
 * @param anterior - Costo anterior.
 * @param nuevo - Costo nuevo.
 * @returns Décimas de porcentaje (325 = +32.5 %), o `null` si el anterior es 0.
 *
 * @example
 * variacionCosto(9600, 11549); // 203 (+20.3 %)
 */
export function variacionCosto(anterior: number, nuevo: number): number | null {
  if (anterior === 0) {
    return null;
  }
  const diferencia = nuevo - anterior;
  const decimas = dividirRedondeado(Math.abs(diferencia) * 1000, anterior);
  return diferencia < 0 ? -decimas : decimas;
}

/**
 * Indica si el costo varió más del umbral (D-65). Se compara con enteros:
 * |nuevo − anterior| × 100 > umbral × anterior.
 *
 * @param anterior - Costo anterior.
 * @param nuevo - Costo nuevo.
 * @returns `true` si la variación supera el {@link UMBRAL_VARIACION_COSTO}; `false` si el anterior es 0.
 *
 * @example
 * variacionAlta(10000, 12500); // false (25 % exacto)
 * variacionAlta(10000, 12501); // true
 */
export function variacionAlta(anterior: number, nuevo: number): boolean {
  return anterior > 0 && Math.abs(nuevo - anterior) * 100 > UMBRAL_VARIACION_COSTO * anterior;
}

/**
 * Valida y calcula una compra: totales de línea, reparto del flete y del
 * descuento, costo nuevo de cada producto, total a pagar y alertas. La misma
 * función la usa la pantalla para mostrar el resultado mientras se escribe y
 * el proceso principal para guardarlo (D-43).
 *
 * Reglas:
 * - Total de línea = cantidad × costo unitario, redondeado al peso (D-16).
 * - El flete y el descuento (si se reparte) se distribuyen en proporción al
 *   total de cada línea, con mayor residuo (S-04, D-70).
 * - Costo nuevo = (total + flete − descuento) ÷ cantidad; si el producto se
 *   repite, el promedio ponderado de sus líneas (D-56).
 * - Total a pagar = subtotal − descuento (+ flete si lo cobra el proveedor, D-59).
 *
 * @param entrada - Líneas, flete y descuento.
 * @returns La compra calculada.
 * @throws {ErrorDeNegocio} Si no hay líneas, alguna cantidad o costo no es válido, un producto está inactivo, o el flete o el descuento no son válidos.
 *
 * @example
 * calcularCompra({
 *   proveedorCodigo: 10004,
 *   lineas: [{ producto: chorizo, cantidad: 24000, costoUnitario: 7900 }],
 *   flete: 5903, fleteProveedor: false,
 *   descuento: { modo: 'pesos', valor: 0 }, descuentoEnCosto: false,
 * }); // subtotal 189600, total 189600, costo nuevo 8146
 */
export function calcularCompra(entrada: EntradaCompra): CompraCalculada {
  if (entrada.lineas.length === 0) {
    invalido('Agregue al menos un producto a la compra.');
  }
  if (!Number.isSafeInteger(entrada.flete) || entrada.flete < 0) {
    invalido('El flete debe ser un valor en pesos enteros, sin signo negativo.');
  }
  const totales = entrada.lineas.map((linea, i) => {
    const { producto, cantidad, costoUnitario } = linea;
    const renglon = `Línea ${i + 1} (${producto.codigo} - ${producto.nombre})`;
    if (!producto.activo) {
      invalido(`${renglon}: el producto está inactivo y no se puede comprar.`);
    }
    if (!Number.isSafeInteger(cantidad) || cantidad <= 0) {
      invalido(`${renglon}: la cantidad debe ser mayor que cero.`);
    }
    if (producto.unidad === 'UND' && cantidad % MILESIMAS_POR_UNIDAD !== 0) {
      invalido(`${renglon}: el producto se compra por unidades (sin decimales).`);
    }
    if (!Number.isSafeInteger(costoUnitario) || costoUnitario < 0) {
      invalido(`${renglon}: el costo debe ser un valor en pesos enteros, sin signo negativo.`);
    }
    return valorLinea(aPesos(costoUnitario), aMilesimas(cantidad));
  });
  const subtotal = totales.reduce((a, b) => a + b, 0);
  if (!Number.isSafeInteger(subtotal)) {
    invalido('Los valores de la compra son demasiado grandes.');
  }
  const descuento = calcularDescuento(subtotal, entrada.descuento);
  const fletes = repartirProporcional(entrada.flete, totales);
  const descuentos = entrada.descuentoEnCosto
    ? repartirProporcional(descuento, totales)
    : totales.map(() => 0);

  // Costo ponderado por producto: suma de valores netos ÷ suma de cantidades.
  const acumulado = new Map<number, { valor: number; cantidad: number }>();
  entrada.lineas.forEach((linea, i) => {
    const previo = acumulado.get(linea.producto.codigo) ?? { valor: 0, cantidad: 0 };
    acumulado.set(linea.producto.codigo, {
      valor: previo.valor + (totales[i] ?? 0) + (fletes[i] ?? 0) - (descuentos[i] ?? 0),
      cantidad: previo.cantidad + linea.cantidad,
    });
  });
  const costosNuevos = new Map<number, number>();
  for (const [codigo, { valor, cantidad }] of acumulado) {
    costosNuevos.set(codigo, costoUnitarioResultante(valor, cantidad));
  }

  const lineas = entrada.lineas.map((linea, i): LineaCompraCalculada => {
    const { producto } = linea;
    const costoNuevo = costosNuevos.get(producto.codigo) ?? 0;
    return {
      total: totales[i] ?? 0,
      flete: fletes[i] ?? 0,
      descuento: descuentos[i] ?? 0,
      costoNuevo,
      costoAnterior: producto.costo,
      escalasBajoCosto: escalasBajoCosto(costoNuevo, producto.precios),
      variacion: variacionCosto(producto.costo, costoNuevo),
      variacionAlta: variacionAlta(producto.costo, costoNuevo),
      otroProveedor: producto.proveedorCodigo !== entrada.proveedorCodigo,
    };
  });
  const total = subtotal - descuento + (entrada.fleteProveedor ? entrada.flete : 0);
  return { lineas, subtotal, descuento, total, costosNuevos };
}

/**
 * Normaliza el número de factura del proveedor para compararlo: sin espacios
 * y en mayúsculas, así «fv 20931» y «FV20931» cuentan como el mismo (D-49).
 *
 * @param numero - Número escrito.
 * @returns Clave de comparación.
 *
 * @example
 * claveNumeroProveedor(' fv-20 931 '); // 'FV-20931'
 */
export function claveNumeroProveedor(numero: string): string {
  return numero.replace(/\s+/g, '').toUpperCase();
}

/**
 * Valida el número de factura del proveedor.
 *
 * @param numero - Número escrito.
 * @returns Número limpio (espacios de sobra quitados).
 * @throws {ErrorDeNegocio} Si está vacío o es muy largo.
 */
export function validarNumeroProveedor(numero: string): string {
  const limpio = limpiarTexto(numero);
  if (limpio === '') {
    invalido('Escriba el número de la factura del proveedor.');
  }
  if (limpio.length > LARGO_MAXIMO_NUMERO_DOCUMENTO) {
    invalido(
      `El número de la factura del proveedor admite máximo ${LARGO_MAXIMO_NUMERO_DOCUMENTO} caracteres.`,
    );
  }
  return limpio;
}

/**
 * Valida la orden de compra (opcional, D-57).
 *
 * @param orden - Texto escrito.
 * @returns Texto limpio (puede ser vacío).
 * @throws {ErrorDeNegocio} Si es muy largo.
 */
export function validarOrdenCompra(orden: string): string {
  const limpio = limpiarTexto(orden);
  if (limpio.length > LARGO_MAXIMO_NUMERO_DOCUMENTO) {
    invalido(`La orden de compra admite máximo ${LARGO_MAXIMO_NUMERO_DOCUMENTO} caracteres.`);
  }
  return limpio;
}

/**
 * Lee un porcentaje escrito (hasta dos decimales, punto decimal) como
 * centésimas enteras (D-69).
 *
 * @param texto - Texto escrito, p. ej. `2`, `2.5` o `12.75`.
 * @returns Centésimas (250 = 2.50 %), o `null` si no es válido.
 *
 * @example
 * leerPorcentaje('2.5'); // 250
 * leerPorcentaje('2,5'); // null
 */
export function leerPorcentaje(texto: string): number | null {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(texto.trim().replace(/\s*%$/, ''));
  if (!m) {
    return null;
  }
  const [, enteros = '0', decimales = ''] = m;
  return Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
}

/**
 * Formatea centésimas de porcentaje como texto editable (sin ceros de sobra).
 *
 * @param centesimas - Centésimas (250 = 2.50 %).
 * @returns Texto como `2.5`.
 *
 * @example
 * textoPorcentaje(250); // '2.5'
 * textoPorcentaje(200); // '2'
 */
export function textoPorcentaje(centesimas: number): string {
  const enteros = Math.floor(centesimas / 100);
  const resto = centesimas % 100;
  if (resto === 0) {
    return String(enteros);
  }
  return `${enteros}.${String(resto).padStart(2, '0').replace(/0$/, '')}`;
}
