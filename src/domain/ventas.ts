import { MILESIMAS_POR_UNIDAD, type UnidadMedida } from '../shared/formato/cantidades';
import { formatearPesos } from '../shared/formato/moneda';
import type { ResumenDeuda } from '../shared/compras';
import { ESCALAS_PRECIO, type EscalaPrecio, type PreciosProducto } from '../shared/maestros';
import { CODIGO_CONSUMIDOR_FINAL, type CondicionPago, type FacturaVencida } from '../shared/ventas';
import { diasEntre } from './calendario';
import { aMilesimas, aPesos, valorLinea } from './dinero';
import { ErrorDeNegocio } from './errores';

/**
 * Escala con que entra cada producto nuevo a la factura (D-81).
 */
export const ESCALA_POR_DEFECTO: EscalaPrecio = 'menor';

/**
 * Orden en que F6 recorre las escalas, empezando por la de defecto (D-81).
 */
const CICLO_ESCALAS: readonly EscalaPrecio[] = ['menor', 'minimo', 'mayor'];

/**
 * Mayor número de cajas de empaque que se acepta (más es casi seguro un error de digitación).
 */
export const MAXIMO_CAJAS_EMPAQUE = 9999;

/**
 * Plazo propuesto para el crédito de un cliente sin facturas a crédito
 * anteriores: el de la tirilla actual del negocio (F-06, D-94).
 */
export const PLAZO_CREDITO_PROPUESTO = 8;

/**
 * Lo que la venta necesita saber del producto de una línea.
 */
export interface ProductoVenta {
  /** Código. */
  codigo: number;
  /** Nombre (para los mensajes). */
  nombre: string;
  /** Unidad de medida. */
  unidad: UnidadMedida;
  /** Costo actual: el precio vendido no puede quedar por debajo (§7). */
  costo: number;
  /** Precios vigentes de las tres escalas. */
  precios: PreciosProducto;
  /** Si está activo (los inactivos no se venden). */
  activo: boolean;
}

/**
 * Línea de venta con su producto.
 */
export interface LineaVentaEntrada {
  /** Producto. */
  producto: ProductoVenta;
  /** Escala elegida. */
  escala: EscalaPrecio;
  /** Cantidad en milésimas. */
  cantidad: number;
  /** Precio alterado con F7, o `null` (precio de la escala). */
  precioAlterado: number | null;
}

/**
 * Resultado del cálculo de una línea de venta.
 */
export interface LineaVentaCalculada {
  /** Precio vigente de la escala elegida. */
  precioEscala: number;
  /** Precio vendido: el alterado o el de la escala. */
  precio: number;
  /** Si el precio se alteró con F7 (y difiere del de la escala). */
  alterado: boolean;
  /** Total: cantidad × precio, redondeado al peso (D-16). */
  total: number;
  /** Lo que el cliente se ahorra en esta línea frente a la escala (0 si no se rebajó). */
  ahorro: number;
  /** Si el precio vendido queda por debajo del costo: bloquea la venta (§7). */
  bajoCosto: boolean;
  /** Si el precio vendido queda por debajo de la escala Mínimo: solo avisa (D-87). */
  bajoMinimo: boolean;
}

/**
 * Resultado del cálculo de una venta.
 */
export interface VentaCalculada {
  /** Líneas calculadas, en el mismo orden. */
  lineas: LineaVentaCalculada[];
  /** Total de la factura. */
  total: number;
  /** «Su ahorro fue de» (§7). */
  ahorro: number;
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
 * Nombre de una escala como se muestra en pantalla.
 *
 * @param escala - Escala.
 * @returns «Mayor», «Menor» o «Mínimo».
 */
export function nombreEscala(escala: EscalaPrecio): string {
  return ESCALAS_PRECIO.find((e) => e.valor === escala)?.etiqueta ?? escala;
}

/**
 * Escala siguiente al presionar F6 (D-81): Menor → Mínimo → Mayor → Menor.
 *
 * @param escala - Escala actual.
 * @returns La siguiente.
 *
 * @example
 * siguienteEscala('menor'); // 'minimo'
 * siguienteEscala('mayor'); // 'menor'
 */
export function siguienteEscala(escala: EscalaPrecio): EscalaPrecio {
  const i = CICLO_ESCALAS.indexOf(escala);
  return CICLO_ESCALAS[(i + 1) % CICLO_ESCALAS.length] ?? ESCALA_POR_DEFECTO;
}

/**
 * Calcula una línea de venta sin lanzar errores de precio, para mostrarla
 * mientras se escribe. La cantidad y el precio deben venir ya validados
 * como enteros no negativos.
 *
 * Reglas (§7):
 * - Precio vendido = el alterado con F7, o el vigente de la escala.
 * - Total = cantidad × precio, redondeado al peso (D-16).
 * - Ahorro = (precio de la escala − precio vendido) × cantidad, solo si el
 *   vendido es menor.
 *
 * @param linea - Producto, escala, cantidad y precio alterado.
 * @returns La línea calculada.
 * @throws {ErrorDeNegocio} Si el resultado excede el rango seguro.
 *
 * @example
 * // 4 papas a $ 14,500 con la escala Menor en $ 17,500:
 * calcularLineaVenta({ producto: papa, escala: 'menor', cantidad: 4000, precioAlterado: 14500 });
 * // { precioEscala: 17500, precio: 14500, alterado: true, total: 58000, ahorro: 12000, … }
 */
export function calcularLineaVenta(linea: LineaVentaEntrada): LineaVentaCalculada {
  const { producto, escala, cantidad, precioAlterado } = linea;
  const precioEscala = producto.precios[escala];
  const precio = precioAlterado ?? precioEscala;
  const total = valorLinea(aPesos(precio), aMilesimas(cantidad));
  const ahorro =
    precio < precioEscala ? valorLinea(aPesos(precioEscala - precio), aMilesimas(cantidad)) : 0;
  return {
    precioEscala,
    precio,
    alterado: precioAlterado !== null && precioAlterado !== precioEscala,
    total,
    ahorro,
    bajoCosto: precio < producto.costo,
    bajoMinimo: precio < producto.precios.minimo,
  };
}

/**
 * Valida y calcula una venta: totales de línea, total y ahorro. La misma
 * función la usa la pantalla mientras se escribe y el proceso principal
 * para guardar (D-43).
 *
 * @param lineas - Líneas de la factura.
 * @returns La venta calculada.
 * @throws {ErrorDeNegocio} Si no hay líneas, un producto está inactivo, una
 * cantidad o un precio no es válido, o algún precio queda por debajo del costo (§7).
 *
 * @example
 * calcularVenta([{ producto: papa, escala: 'menor', cantidad: 4000, precioAlterado: 14500 }]);
 * // { total: 58000, ahorro: 12000, lineas: [...] }
 */
export function calcularVenta(lineas: readonly LineaVentaEntrada[]): VentaCalculada {
  if (lineas.length === 0) {
    invalido('Agregue al menos un producto a la factura.');
  }
  const calculadas = lineas.map((linea, i) => {
    const { producto, cantidad, precioAlterado } = linea;
    const renglon = `Línea ${i + 1} (${producto.codigo} - ${producto.nombre})`;
    if (!producto.activo) {
      invalido(
        `${renglon}: el producto está inactivo y no se puede vender. Quítelo de la factura.`,
      );
    }
    if (!Number.isSafeInteger(cantidad) || cantidad <= 0) {
      invalido(`${renglon}: la cantidad debe ser mayor que cero.`);
    }
    if (producto.unidad === 'UND' && cantidad % MILESIMAS_POR_UNIDAD !== 0) {
      invalido(`${renglon}: el producto se vende por unidades (sin decimales).`);
    }
    if (precioAlterado !== null && (!Number.isSafeInteger(precioAlterado) || precioAlterado < 0)) {
      invalido(`${renglon}: el precio debe ser un valor en pesos enteros, sin signo negativo.`);
    }
    const calculada = calcularLineaVenta(linea);
    if (calculada.bajoCosto) {
      invalido(
        `${renglon}: el precio (${formatearPesos(calculada.precio)}) queda por debajo del costo ` +
          `(${formatearPesos(producto.costo)}). Use F7 para escribir un precio igual o mayor al costo.`,
      );
    }
    return calculada;
  });
  const total = calculadas.reduce((suma, l) => suma + l.total, 0);
  const ahorro = calculadas.reduce((suma, l) => suma + l.ahorro, 0);
  if (!Number.isSafeInteger(total)) {
    invalido('Los valores de la factura son demasiado grandes.');
  }
  return { lineas: calculadas, total, ahorro };
}

/**
 * Situación de crédito del cliente al momento de la venta.
 */
export interface EntradaCredito {
  /** Cliente de la factura. */
  clienteCodigo: number;
  /** Nombre del cliente (para el mensaje). */
  clienteNombre: string;
  /** Tope de crédito, o `null` sin tope. */
  tope: number | null;
  /** Deuda actual del cliente. */
  deuda: ResumenDeuda;
  /** Factura vencida más antigua con saldo, o `null`. */
  vencidaMasAntigua: FacturaVencida | null;
  /** Total de la venta. */
  total: number;
  /** Día de hoy, `AAAA-MM-DD`. */
  hoy: string;
}

/**
 * Razones por las que una venta a crédito no se puede hacer (§5.2, S-03, D-90):
 *
 * - A «Consumidor final» no se le vende a crédito.
 * - Solo a los clientes **con tope**: se bloquea si tienen facturas vencidas
 *   o si la venta superaría el crédito disponible (tope − deuda).
 * - Un cliente sin tope tiene crédito sin límite.
 *
 * @param entrada - Cliente, tope, deuda y total.
 * @returns Las razones en español (vacío: la venta a crédito se permite).
 *
 * @example
 * razonesBloqueoCredito({ clienteCodigo: 10065, clienteNombre: 'JUAN', tope: 500000,
 *   deuda: { total: 450000, vencido: 0 }, vencidaMasAntigua: null, total: 79250, hoy: '2026-10-02' });
 * // ['La venta ($ 79,250) supera el crédito disponible ($ 50,000) en $ 29,250.']
 */
export function razonesBloqueoCredito(entrada: EntradaCredito): string[] {
  if (entrada.clienteCodigo === CODIGO_CONSUMIDOR_FINAL) {
    return [
      'No se vende a crédito a «Consumidor final»: elija un cliente registrado o venda de contado.',
    ];
  }
  if (entrada.tope === null) {
    return [];
  }
  const razones: string[] = [];
  if (entrada.deuda.vencido > 0) {
    const mas = entrada.vencidaMasAntigua;
    const detalle = mas
      ? ` (la más antigua, la ${mas.numero}, venció hace ${textoDias(diasEntre(mas.vence, entrada.hoy))})`
      : '';
    razones.push(`Tiene facturas vencidas por ${formatearPesos(entrada.deuda.vencido)}${detalle}.`);
  }
  const disponible = entrada.tope - entrada.deuda.total;
  if (entrada.total > disponible) {
    razones.push(
      disponible > 0
        ? `La venta (${formatearPesos(entrada.total)}) supera el crédito disponible ` +
            `(${formatearPesos(disponible)}) en ${formatearPesos(entrada.total - disponible)}.`
        : `No tiene crédito disponible: la deuda (${formatearPesos(entrada.deuda.total)}) ` +
            `ya alcanza el tope (${formatearPesos(entrada.tope)}).`,
    );
  }
  return razones;
}

/**
 * Escribe una cantidad de días.
 *
 * @param dias - Días.
 * @returns «1 día» o «N días».
 */
function textoDias(dias: number): string {
  return `${dias} ${dias === 1 ? 'día' : 'días'}`;
}

/**
 * Lo recibido y el cambio de una venta de contado (D-90).
 */
export interface CambioCalculado {
  /** Lo recibido, o `null` si la forma de pago no calcula cambio. */
  recibido: number | null;
  /** Cambio a devolver, o `null` si la forma de pago no calcula cambio. */
  cambio: number | null;
}

/**
 * Calcula el cambio de una venta de contado (D-90). Si la forma de pago no
 * calcula cambio, no se guarda ni recibido ni cambio. Si no se escribió lo
 * recibido, se toma el valor exacto.
 *
 * @param total - Total de la factura.
 * @param recibido - Lo que entregó el cliente, o `null`.
 * @param calculaCambio - Si la forma de pago calcula cambio (efectivo).
 * @returns Recibido y cambio.
 * @throws {ErrorDeNegocio} Si lo recibido no es válido o es menor que el total.
 *
 * @example
 * calcularCambio(79250, 100000, true); // { recibido: 100000, cambio: 20750 }
 * calcularCambio(79250, null, true);   // { recibido: 79250, cambio: 0 }
 * calcularCambio(79250, null, false);  // { recibido: null, cambio: null }
 */
export function calcularCambio(
  total: number,
  recibido: number | null,
  calculaCambio: boolean,
): CambioCalculado {
  if (!calculaCambio) {
    return { recibido: null, cambio: null };
  }
  if (recibido === null) {
    return { recibido: total, cambio: 0 };
  }
  if (!Number.isSafeInteger(recibido) || recibido < 0) {
    invalido('Lo recibido debe ser un valor en pesos enteros, sin signo negativo.');
  }
  if (recibido < total) {
    invalido(
      `Lo recibido (${formatearPesos(recibido)}) es menor que el total (${formatearPesos(total)}).`,
    );
  }
  return { recibido, cambio: recibido - total };
}

/**
 * Valida la condición de pago y el plazo de una factura de cliente.
 *
 * @param condicion - Contado o crédito.
 * @param plazoDias - Plazo escrito.
 * @returns El plazo a guardar (0 en contado).
 * @throws {ErrorDeNegocio} Si la condición no es válida o el plazo no es un entero entre 0 y 999.
 */
export function plazoDeCondicion(condicion: CondicionPago, plazoDias: number): number {
  if (condicion === 'contado') {
    return 0;
  }
  if (!Number.isSafeInteger(plazoDias) || plazoDias < 0 || plazoDias > 999) {
    invalido('El plazo del crédito debe ser un número entero de días entre 0 y 999.');
  }
  return plazoDias;
}

/**
 * Valida el número de cajas de empaque (opcional, D-91).
 *
 * @param cajas - Número escrito, o `null`.
 * @returns El mismo número, o `null`.
 * @throws {ErrorDeNegocio} Si no es un entero entre 1 y {@link MAXIMO_CAJAS_EMPAQUE}.
 */
export function validarCajasEmpaque(cajas: number | null): number | null {
  if (cajas === null) {
    return null;
  }
  if (!Number.isSafeInteger(cajas) || cajas < 1 || cajas > MAXIMO_CAJAS_EMPAQUE) {
    invalido(
      `El número de cajas de empaque debe ser un entero entre 1 y ${MAXIMO_CAJAS_EMPAQUE}, o quedar vacío.`,
    );
  }
  return cajas;
}

/**
 * Valida el consecutivo inicial de la factura de cliente (D-84): un entero
 * positivo mayor que el último número usado.
 *
 * @param siguiente - Número que tendrá la próxima factura.
 * @param ultimoUsado - Número más alto ya usado, o `null` si no hay facturas.
 * @returns El mismo número.
 * @throws {ErrorDeNegocio} Si no es válido o repetiría un número ya usado.
 *
 * @example
 * validarSiguienteNumeroFactura(84772, null);  // 84772
 * validarSiguienteNumeroFactura(84772, 84800); // lanza: debe ser mayor que 84800
 */
export function validarSiguienteNumeroFactura(
  siguiente: number,
  ultimoUsado: number | null,
): number {
  if (!Number.isSafeInteger(siguiente) || siguiente < 1 || siguiente > 999_999_999) {
    invalido('El número de la próxima factura debe ser un entero entre 1 y 999,999,999.');
  }
  if (ultimoUsado !== null && siguiente <= ultimoUsado) {
    invalido(
      `El número de la próxima factura debe ser mayor que ${ultimoUsado}, la última factura registrada.`,
    );
  }
  return siguiente;
}
