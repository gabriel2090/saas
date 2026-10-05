import {
  CONCEPTOS_CIERRE,
  SIGNO_CONCEPTO,
  type AbonoOtraFecha,
  type CalculoCierre,
  type ConceptoCierre,
  type ConteoDenominacion,
  type Denominacion,
  type DocumentoCierre,
  type FilaConceptoCierre,
  type FormaCierre,
  type SaldoFavorAplicado,
} from '../shared/cierreCaja';
import { formatearFechaHora } from '../shared/formato/fechas';
import { agruparMiles } from '../shared/formato/moneda';
import type { TipoCartera } from '../shared/reportes';
import { validarTextoAbono } from './abonos';
import { diaDeIso } from './calendario';
import { ErrorDeNegocio } from './errores';

/**
 * Forma de pago tal como está en el maestro.
 */
export interface FormaPagoCaja {
  /** Id. */
  id: number;
  /** Nombre. */
  nombre: string;
  /** Si calcula el cambio (se cuenta a mano: Efectivo). */
  calculaCambio: boolean;
  /** Si está activa. */
  activo: boolean;
  /** Si es de sistema («Saldo a favor»: no es dinero, D-130). */
  esSistema: boolean;
}

/**
 * Factura de venta de contado candidata al tramo.
 */
export interface VentaCaja {
  /** Id interno. */
  id: number;
  /** Número. */
  numero: number;
  /** Cliente. */
  tercero: string;
  /** Forma de pago de la venta. */
  formaPagoId: number;
  /** Momento de la venta, ISO con zona. */
  momento: string;
  /** Total de la versión 1 (lo cobrado al vender; los cambios entran como reintegros, D-128). */
  total: number;
  /** Momento de la anulación, o `null`. */
  anuladaEn: string | null;
}

/**
 * Abono candidato al tramo (de cliente o a proveedor, incluido el automático
 * de una compra «Pagada de contado»).
 */
export interface AbonoCaja {
  /** Id interno. */
  id: number;
  /** Cliente o proveedor. */
  tipo: TipoCartera;
  /** Número. */
  numero: number;
  /** Tercero. */
  tercero: string;
  /** Forma de pago. */
  formaPagoId: number;
  /** Fecha elegida, `AAAA-MM-DD`. */
  dia: string;
  /** Momento de registro, ISO con zona (el que cuenta, D-151). */
  registradoEn: string;
  /** Momento de la anulación, o `null`. */
  anuladoEn: string | null;
  /** Valor. */
  valor: number;
  /** Si es el abono automático de una compra de contado. */
  deCompraContado: boolean;
}

/**
 * Reintegro de dinero candidato al tramo (D-128).
 */
export interface ReintegroCaja {
  /** Id interno. */
  id: number;
  /** Número. */
  numero: number;
  /** Tercero. */
  tercero: string;
  /** El negocio entrega o recibe. */
  sentido: 'entrega' | 'recibe';
  /** Si paga un saldo a favor (se puede anular) o nace de un documento. */
  origen: 'saldo_favor' | 'documento';
  /** Tipo del documento que lo originó, p. ej. `anulacion_venta`, o `null`. */
  documentoTipo: string | null;
  /** Venta de contado a la que va atado, o `null`. */
  venta: { id: number; numero: number; momento: string } | null;
  /** Forma de pago. */
  formaPagoId: number;
  /** Momento del reintegro, ISO con zona. */
  momento: string;
  /** Momento de la anulación, o `null`. */
  anuladoEn: string | null;
  /** Valor (positivo). */
  valor: number;
}

/**
 * Datos para calcular un tramo.
 */
export interface EntradaTramo {
  /** Inicio del tramo (exclusivo): momento del cierre anterior vigente, o `null` si es el primero. */
  desde: string | null;
  /** Fin del tramo (inclusivo): momento de guardar. */
  hasta: string;
  /** Formas de pago del maestro. */
  formas: FormaPagoCaja[];
  /** Ventas de contado candidatas. */
  ventas: VentaCaja[];
  /** Abonos candidatos. */
  abonos: AbonoCaja[];
  /** Reintegros candidatos. */
  reintegros: ReintegroCaja[];
}

/**
 * Denominaciones del contador de billetes y monedas (pesos colombianos).
 */
export const DENOMINACIONES: readonly Denominacion[] = [
  { tipo: 'billete', valor: 100_000 },
  { tipo: 'billete', valor: 50_000 },
  { tipo: 'billete', valor: 20_000 },
  { tipo: 'billete', valor: 10_000 },
  { tipo: 'billete', valor: 5_000 },
  { tipo: 'billete', valor: 2_000 },
  { tipo: 'billete', valor: 1_000 },
  { tipo: 'moneda', valor: 1_000 },
  { tipo: 'moneda', valor: 500 },
  { tipo: 'moneda', valor: 200 },
  { tipo: 'moneda', valor: 100 },
  { tipo: 'moneda', valor: 50 },
];

/**
 * Lanza un error de validación.
 *
 * @param mensaje - Mensaje para el usuario.
 * @throws {ErrorDeNegocio} Siempre.
 */
function invalido(mensaje: string): never {
  throw new ErrorDeNegocio('VALIDACION', mensaje);
}

/**
 * Columnas del cierre: las formas de pago que son dinero (no las de sistema),
 * activas o con movimiento en el tramo, ordenadas por id. La primera que se
 * cuenta (calcula el cambio) lleva la base y el contador de billetes; siempre
 * es columna, aunque esté inactiva.
 *
 * @param formas - Formas del maestro.
 * @param conMovimiento - Ids de las formas con documentos en el tramo.
 * @returns Columnas del cierre.
 * @throws {ErrorDeNegocio} Si ninguna forma de pago calcula el cambio (no hay dónde contar el efectivo).
 */
export function columnasCierre(
  formas: readonly FormaPagoCaja[],
  conMovimiento: ReadonlySet<number>,
): FormaCierre[] {
  const dinero = formas.filter((f) => !f.esSistema).sort((a, b) => a.id - b.id);
  const base = dinero.find((f) => f.calculaCambio);
  if (!base) {
    invalido(
      'Ninguna forma de pago calcula el cambio: marque «Efectivo» como forma que calcula el cambio en Formas de pago para poder hacer el cierre.',
    );
  }
  return dinero
    .filter((f) => f.activo || f.id === base.id || conMovimiento.has(f.id))
    .map((f) => ({
      id: f.id,
      nombre: f.nombre,
      seCuenta: f.calculaCambio,
      recibeBase: f.id === base.id,
    }));
}

/**
 * Calcula un tramo del cierre «a la fecha de corte» (D-150 a D-153). Un
 * documento cuenta por el momento en que se registró (D-151) si cae en el
 * tramo y no estaba anulado al corte. La anulación de un documento de un
 * tramo anterior entra en «Anulaciones de días anteriores» con signo
 * contrario; si el documento y su anulación caen en el mismo tramo, se
 * compensan y no aparecen (D-152). Una venta de contado cuenta con el total
 * con que se vendió: sus correcciones y devoluciones ya son reintegros; si
 * se anula en el mismo tramo, ella y sus reintegros se compensan. Los abonos
 * con la forma «Saldo a favor» no son dinero: solo se informan (D-130).
 *
 * @param e - Tramo, formas de pago y documentos candidatos.
 * @returns Columnas, conceptos, movimiento por forma y documentos.
 * @throws {ErrorDeNegocio} Si ninguna forma de pago calcula el cambio.
 *
 * @example
 * // Una venta de $ 50,000 en efectivo dentro del tramo y un abono de un
 * // tramo anterior anulado en este: ventas 50,000 y anulaciones −20,000.
 * calcularTramo({ desde: '2026-10-03T19:05:00.000-05:00', hasta: '2026-10-04T19:00:00.000-05:00', ... });
 */
export function calcularTramo(e: EntradaTramo): CalculoCierre {
  const inicio = e.desde === null ? Number.NEGATIVE_INFINITY : Date.parse(e.desde);
  const fin = Date.parse(e.hasta);
  const enTramo = (iso: string): boolean => {
    const t = Date.parse(iso);
    return t > inicio && t <= fin;
  };
  const vigenteAlCorte = (anulado: string | null): boolean =>
    anulado === null || Date.parse(anulado) > fin;
  const anuladoEnTramo = (anulado: string | null): anulado is string =>
    anulado !== null && enTramo(anulado);
  const antesDelTramo = (iso: string): boolean => Date.parse(iso) <= inicio;

  const formasPorId = new Map(e.formas.map((f) => [f.id, f]));
  const nombreForma = (id: number): string => formasPorId.get(id)?.nombre ?? `Forma ${id}`;
  const esDinero = (id: number): boolean => formasPorId.get(id)?.esSistema !== true;

  const documentos: DocumentoCierre[] = [];
  const saldoFavor: SaldoFavorAplicado[] = [];
  const otraFecha: AbonoOtraFecha[] = [];
  const agregar = (d: Omit<DocumentoCierre, 'formaPago'>): void => {
    documentos.push({ ...d, formaPago: nombreForma(d.formaPagoId) });
  };

  // Ventas anuladas en el mismo tramo en que se hicieron: se compensan con sus reintegros.
  const compensadas = new Set(
    e.ventas
      .filter((v) => enTramo(v.momento) && v.anuladaEn !== null && !vigenteAlCorte(v.anuladaEn))
      .map((v) => v.id),
  );

  for (const v of e.ventas) {
    if (!enTramo(v.momento) || compensadas.has(v.id)) continue;
    agregar({
      clave: `v${v.id}`,
      concepto: 'ventas',
      documento: `Factura ${v.numero}`,
      tercero: v.tercero,
      formaPagoId: v.formaPagoId,
      momento: v.momento,
      valor: v.total,
      nota: v.anuladaEn
        ? `Anulada el ${formatearFechaHora(v.anuladaEn)} (cuenta en otro cierre)`
        : '',
      ver: { tipo: 'factura-cliente', id: v.id, numero: v.numero },
    });
  }

  for (const a of e.abonos) {
    const cliente = a.tipo === 'cliente';
    const documento = `Abono ${a.numero}`;
    const ver = {
      tipo: cliente ? ('abono-cliente' as const) : ('abono-proveedor' as const),
      id: a.id,
      numero: a.numero,
    };
    const cuenta = enTramo(a.registradoEn) && vigenteAlCorte(a.anuladoEn);
    if (!esDinero(a.formaPagoId)) {
      if (cuenta) saldoFavor.push({ documento, tercero: a.tercero, valor: a.valor });
      continue;
    }
    if (cuenta) {
      agregar({
        clave: `a${a.id}`,
        concepto: cliente ? 'abonosClientes' : 'abonosProveedores',
        documento,
        tercero: a.tercero,
        formaPagoId: a.formaPagoId,
        momento: a.registradoEn,
        valor: a.valor,
        nota: a.deCompraContado ? 'Compra pagada de contado' : '',
        ver,
      });
      if (a.dia !== diaDeIso(a.registradoEn)) {
        otraFecha.push({
          documento,
          tercero: a.tercero,
          valor: a.valor,
          formaPago: nombreForma(a.formaPagoId),
          dia: a.dia,
          registradoEn: a.registradoEn,
        });
      }
    } else if (anuladoEnTramo(a.anuladoEn) && antesDelTramo(a.registradoEn)) {
      agregar({
        clave: `a${a.id}`,
        concepto: 'anulacionesAnteriores',
        documento,
        tercero: a.tercero,
        formaPagoId: a.formaPagoId,
        momento: a.anuladoEn,
        valor: cliente ? -a.valor : a.valor,
        nota: `Registrado el ${formatearFechaHora(a.registradoEn)}`,
        ver,
      });
    }
  }

  for (const r of e.reintegros) {
    if (!esDinero(r.formaPagoId)) continue;
    const documento = `Reintegro ${r.numero}`;
    const ver = r.venta
      ? { tipo: 'factura-cliente' as const, id: r.venta.id, numero: r.venta.numero }
      : null;
    const nota = r.venta ? `Factura ${r.venta.numero}` : 'Pago de saldo a favor';
    if (r.venta && compensadas.has(r.venta.id)) continue;
    // Anular una venta de un tramo anterior es una anulación de días anteriores (D-152).
    if (r.documentoTipo === 'anulacion_venta' && r.venta && antesDelTramo(r.venta.momento)) {
      if (enTramo(r.momento)) {
        agregar({
          clave: `r${r.id}`,
          concepto: 'anulacionesAnteriores',
          documento: `Factura ${r.venta.numero}`,
          tercero: r.tercero,
          formaPagoId: r.formaPagoId,
          momento: r.momento,
          valor: r.sentido === 'entrega' ? -r.valor : r.valor,
          nota: `Anulación de la venta del ${formatearFechaHora(r.venta.momento)} (${documento})`,
          ver,
        });
      }
      continue;
    }
    if (enTramo(r.momento) && vigenteAlCorte(r.anuladoEn)) {
      agregar({
        clave: `r${r.id}`,
        concepto: r.sentido === 'recibe' ? 'reintegrosRecibe' : 'reintegrosEntrega',
        documento,
        tercero: r.tercero,
        formaPagoId: r.formaPagoId,
        momento: r.momento,
        valor: r.valor,
        nota,
        ver,
      });
    } else if (anuladoEnTramo(r.anuladoEn) && antesDelTramo(r.momento)) {
      agregar({
        clave: `r${r.id}`,
        concepto: 'anulacionesAnteriores',
        documento,
        tercero: r.tercero,
        formaPagoId: r.formaPagoId,
        momento: r.anuladoEn,
        valor: r.sentido === 'recibe' ? -r.valor : r.valor,
        nota: `Registrado el ${formatearFechaHora(r.momento)}`,
        ver,
      });
    }
  }

  documentos.sort((x, y) => Date.parse(x.momento) - Date.parse(y.momento));
  const formas = columnasCierre(e.formas, new Set(documentos.map((d) => d.formaPagoId)));
  const filas = sumarConceptos(formas, documentos);
  return {
    formas,
    filas,
    movimiento: movimientoPorForma(filas, formas.length),
    documentos,
    saldoFavor,
    otraFecha,
  };
}

/**
 * Suma los documentos de cada concepto por forma de pago.
 *
 * @param formas - Columnas.
 * @param documentos - Documentos del tramo.
 * @returns Un renglón por concepto.
 */
function sumarConceptos(
  formas: readonly FormaCierre[],
  documentos: readonly DocumentoCierre[],
): FilaConceptoCierre[] {
  const indice = new Map(formas.map((f, i) => [f.id, i]));
  return CONCEPTOS_CIERRE.map((concepto) => {
    const valores = formas.map(() => 0);
    let cantidad = 0;
    for (const d of documentos) {
      if (d.concepto !== concepto) continue;
      const i = indice.get(d.formaPagoId);
      if (i === undefined) continue;
      valores[i] = (valores[i] ?? 0) + d.valor;
      cantidad += 1;
    }
    return { concepto, cantidad, valores };
  });
}

/**
 * Movimiento del tramo por forma de pago (D-153): ventas + abonos de clientes
 * + reintegros que recibe − abonos a proveedores − reintegros que entrega ±
 * anulaciones de días anteriores.
 *
 * @param filas - Renglones de los conceptos.
 * @param columnas - Cantidad de formas de pago.
 * @returns Movimiento por forma, en el orden de las columnas.
 */
export function movimientoPorForma(
  filas: readonly FilaConceptoCierre[],
  columnas: number,
): number[] {
  const movimiento = Array.from({ length: columnas }, () => 0);
  for (const fila of filas) {
    const signo = SIGNO_CONCEPTO[fila.concepto];
    fila.valores.forEach((valor, i) => {
      movimiento[i] = (movimiento[i] ?? 0) + signo * valor;
    });
  }
  return movimiento;
}

/**
 * Huella de un cálculo: si cambia entre lo que vio el usuario y el momento
 * de guardar, hubo movimientos nuevos y debe revisar el arqueo.
 *
 * @param desde - Inicio del tramo.
 * @param calculo - Cálculo del tramo.
 * @returns Texto que identifica el cálculo.
 */
export function huellaCierre(desde: string | null, calculo: CalculoCierre): string {
  return JSON.stringify({
    desde,
    formas: calculo.formas.map((f) => f.id),
    filas: calculo.filas.map((f) => [f.cantidad, ...f.valores]),
    saldoFavor: calculo.saldoFavor.length,
  });
}

/**
 * Esperado en caja por forma de pago: el movimiento más la base inicial en
 * la forma que la lleva (D-155).
 *
 * @param formas - Columnas.
 * @param movimiento - Movimiento por forma.
 * @param baseInicial - Base inicial.
 * @returns Esperado por forma.
 */
export function esperadoPorForma(
  formas: readonly FormaCierre[],
  movimiento: readonly number[],
  baseInicial: number,
): number[] {
  return formas.map((f, i) => (movimiento[i] ?? 0) + (f.recibeBase ? baseInicial : 0));
}

/**
 * Contado con que arranca el arqueo (D-154): vacío en las formas que se
 * cuentan a mano (Efectivo) y lo esperado en las demás.
 *
 * @param formas - Columnas.
 * @param esperado - Esperado por forma.
 * @returns Contado inicial, `null` donde hay que contar.
 */
export function contadoInicial(
  formas: readonly FormaCierre[],
  esperado: readonly number[],
): (number | null)[] {
  return formas.map((f, i) => (f.seCuenta ? null : (esperado[i] ?? 0)));
}

/**
 * Texto de una diferencia de arqueo.
 *
 * @param diferencia - Contado menos esperado.
 * @returns `Faltan 2,000`, `Sobran 500` o `0`.
 */
export function textoDiferencia(diferencia: number): string {
  if (diferencia < 0) return `Faltan ${agruparMiles(-diferencia)}`;
  if (diferencia > 0) return `Sobran ${agruparMiles(diferencia)}`;
  return '0';
}

/**
 * Suma un conteo de billetes y monedas.
 *
 * @param conteo - Cantidad por denominación.
 * @returns Total en pesos.
 */
export function totalConteo(conteo: readonly ConteoDenominacion[]): number {
  return conteo.reduce((suma, c) => suma + c.valor * c.cantidad, 0);
}

/**
 * Efectivo que se retira o se consigna: el contado de la forma con base
 * menos la base que queda (D-155).
 *
 * @param contadoBase - Efectivo contado.
 * @param baseQueda - Base que queda en caja.
 * @returns Efectivo a retirar.
 */
export function efectivoARetirar(contadoBase: number, baseQueda: number): number {
  return contadoBase - baseQueda;
}

/**
 * Verifica que un valor sea un entero seguro de pesos.
 *
 * @param valor - Valor.
 * @param campo - Nombre del campo.
 * @param noNegativo - Si no admite negativos.
 * @returns El mismo valor.
 * @throws {ErrorDeNegocio} Si no es un entero válido.
 */
function pesos(valor: number, campo: string, noNegativo: boolean): number {
  if (!Number.isSafeInteger(valor)) {
    invalido(`«${campo}» debe ser un valor en pesos enteros, sin decimales.`);
  }
  if (noNegativo && valor < 0) {
    invalido(`«${campo}» no puede ser negativo.`);
  }
  return valor;
}

/**
 * Datos del arqueo para validar antes de guardar.
 */
export interface EntradaArqueo {
  /** Columnas. */
  formas: readonly FormaCierre[];
  /** Movimiento por forma. */
  movimiento: readonly number[];
  /** Base inicial. */
  baseInicial: number;
  /** Contado por forma de pago. */
  contado: readonly { formaPagoId: number; valor: number }[];
  /** Conteo de billetes y monedas, o `null`. */
  conteo: readonly ConteoDenominacion[] | null;
  /** Base que queda. */
  baseQueda: number;
  /** Observación. */
  observacion: string;
}

/**
 * Arqueo validado, listo para guardar.
 */
export interface ArqueoValidado {
  /** Esperado por forma. */
  esperado: number[];
  /** Contado por forma. */
  contado: number[];
  /** Diferencia por forma (contado − esperado). */
  diferencia: number[];
  /** Conteo de billetes y monedas sin denominaciones en cero, o `null`. */
  conteo: ConteoDenominacion[] | null;
  /** Observación limpia. */
  observacion: string;
}

/**
 * Valida el arqueo de un cierre nuevo (D-154, D-155): contado de todas las
 * columnas (el efectivo no negativo), base inicial y base que queda no
 * negativas, base que queda no mayor que el efectivo contado y el conteo de
 * billetes igual al efectivo contado. Se puede guardar con diferencia.
 *
 * @param e - Columnas, movimiento, base, contado, conteo y observación.
 * @returns Esperado, contado y diferencia por forma, conteo y observación.
 * @throws {ErrorDeNegocio} Si falta un contado o algún valor no es válido.
 *
 * @example
 * // Efectivo: movimiento 698,800 + base 200,000 = 898,800; contado 896,800.
 * validarArqueo({ ..., baseInicial: 200_000, baseQueda: 200_000 }).diferencia; // [-2000, 0, 0]
 */
export function validarArqueo(e: EntradaArqueo): ArqueoValidado {
  const baseInicial = pesos(e.baseInicial, 'Base inicial', true);
  const baseQueda = pesos(e.baseQueda, 'Base que queda en caja', true);
  const porForma = new Map(e.contado.map((c) => [c.formaPagoId, c.valor]));
  const contado = e.formas.map((f) => {
    const valor = porForma.get(f.id);
    if (valor === undefined) {
      invalido(`Escriba el valor contado de «${f.nombre}».`);
    }
    return pesos(valor, `Contado de ${f.nombre}`, f.seCuenta);
  });
  const esperado = esperadoPorForma(e.formas, e.movimiento, baseInicial);
  const iBase = e.formas.findIndex((f) => f.recibeBase);
  const contadoBase = contado[iBase] ?? 0;
  const nombreBase = e.formas[iBase]?.nombre ?? 'Efectivo';
  if (baseQueda > contadoBase) {
    invalido(
      `La base que queda en caja (${agruparMiles(baseQueda)}) no puede ser mayor que el ${nombreBase.toLowerCase()} contado (${agruparMiles(contadoBase)}).`,
    );
  }
  let conteo: ConteoDenominacion[] | null = null;
  if (e.conteo !== null) {
    conteo = e.conteo.filter((c) => {
      const valida = DENOMINACIONES.some((d) => d.tipo === c.tipo && d.valor === c.valor);
      if (!valida) invalido(`La denominación ${agruparMiles(c.valor)} no es válida.`);
      if (!Number.isSafeInteger(c.cantidad) || c.cantidad < 0) {
        invalido(
          `La cantidad de ${c.tipo === 'billete' ? 'billetes' : 'monedas'} de ${agruparMiles(c.valor)} no es válida.`,
        );
      }
      return c.cantidad > 0;
    });
    const total = totalConteo(conteo);
    if (total !== contadoBase) {
      invalido(
        `El conteo de billetes y monedas suma ${agruparMiles(total)} y el ${nombreBase.toLowerCase()} contado es ${agruparMiles(contadoBase)}: pase el total del conteo o bórrelo.`,
      );
    }
    if (conteo.length === 0) conteo = null;
  }
  const observacion = validarTextoAbono(e.observacion, 'Observación');
  return {
    esperado,
    contado,
    diferencia: contado.map((c, i) => c - (esperado[i] ?? 0)),
    conteo,
    observacion,
  };
}

/**
 * Cierre de la lista, para decidir cuál se puede anular.
 */
export interface CierreParaAnular {
  /** Número. */
  numero: number;
  /** Estado. */
  estado: 'activo' | 'anulado';
}

/**
 * Número del último cierre vigente: el único que se puede anular (D-150).
 *
 * @param cierres - Cierres guardados.
 * @returns Número, o `null` si no hay cierres vigentes.
 */
export function ultimoCierreVigente(cierres: readonly CierreParaAnular[]): number | null {
  let ultimo: number | null = null;
  for (const c of cierres) {
    if (c.estado === 'activo' && (ultimo === null || c.numero > ultimo)) ultimo = c.numero;
  }
  return ultimo;
}

/**
 * Verifica que un cierre se pueda anular: existe, está vigente y es el
 * último vigente (D-150).
 *
 * @param cierres - Cierres guardados.
 * @param numero - Cierre a anular.
 * @throws {ErrorDeNegocio} Si no existe, ya está anulado o no es el último.
 */
export function exigirCierreAnulable(cierres: readonly CierreParaAnular[], numero: number): void {
  const cierre = cierres.find((c) => c.numero === numero);
  if (!cierre) {
    throw new ErrorDeNegocio('NO_ENCONTRADO', `El cierre ${numero} no existe.`);
  }
  if (cierre.estado === 'anulado') {
    throw new ErrorDeNegocio('CONFLICTO', `El cierre ${numero} ya está anulado.`);
  }
  const ultimo = ultimoCierreVigente(cierres);
  if (ultimo !== numero) {
    throw new ErrorDeNegocio(
      'CONFLICTO',
      `Solo se puede anular el último cierre (el ${ultimo}). El cierre ${numero} ya no se puede anular.`,
    );
  }
}

/**
 * Concepto de un documento, para agrupar en el panel.
 *
 * @param documentos - Documentos del tramo.
 * @param concepto - Concepto elegido.
 * @returns Documentos del concepto, en orden de momento.
 */
export function documentosDeConcepto(
  documentos: readonly DocumentoCierre[],
  concepto: ConceptoCierre,
): DocumentoCierre[] {
  return documentos.filter((d) => d.concepto === concepto);
}
