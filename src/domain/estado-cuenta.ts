import type {
  MovimientoEstadoCuenta,
  PendienteEstadoCuenta,
  ResumenEstadoCuenta,
} from '../shared/estadoCuenta';
import { formatearCantidad, type UnidadMedida } from '../shared/formato/cantidades';
import { formatearFecha } from '../shared/formato/fechas';
import { agruparMiles } from '../shared/formato/moneda';
import type { TipoCartera } from '../shared/reportes';
import { estadoVencimiento } from './reportes';

/**
 * Factura de venta a crédito o compra del tercero, tal como sale de la base.
 */
export interface FacturaCuenta {
  /** Id interno. */
  id: number;
  /** Número de la factura de venta o número interno de la compra. */
  numero: number;
  /** Número de la factura del proveedor (vacío en las de cliente). */
  referencia: string;
  /** Si es un saldo inicial importado. */
  saldoInicial: boolean;
  /** Si es una compra «Pagada de contado». */
  contado: boolean;
  /** Día del documento, `AAAA-MM-DD`. */
  dia: string;
  /** Momento en que se guardó (ISO), para ordenar dentro del día. */
  momento: string;
  /** Plazo en días. */
  plazoDias: number;
  /** Vencimiento, `AAAA-MM-DD`. */
  vence: string;
  /** Total de la versión 1. */
  totalInicial: number;
  /** Momento de la anulación (ISO), o `null` si está activa. */
  anuladaEn: string | null;
  /** Motivo de la anulación (vacío si no tiene). */
  motivoAnulacion: string;
}

/**
 * Versión 2 o posterior de una factura: una corrección.
 */
export interface VersionCuenta {
  /** Id de la fila de la versión (lo usa el libro de saldo a favor). */
  id: number;
  /** Factura corregida. */
  facturaId: number;
  /** Número de versión. */
  version: number;
  /** Momento de la corrección (ISO). */
  momento: string;
  /** Total de la versión anterior. */
  totalAnterior: number;
  /** Total de esta versión. */
  totalNuevo: number;
}

/**
 * Abono del tercero con su reparto.
 */
export interface AbonoCuenta {
  /** Id interno. */
  id: number;
  /** Número del abono. */
  numero: number;
  /** Día elegido al registrarlo, `AAAA-MM-DD`. */
  dia: string;
  /** Momento en que se registró (ISO). */
  momento: string;
  /** Nombre de la forma de pago. */
  formaPago: string;
  /** Si se pagó con el saldo a favor del tercero. */
  conSaldoFavor: boolean;
  /** Si es el abono automático de una compra «Pagada de contado». */
  contado: boolean;
  /** Reparto entre facturas. */
  aplicaciones: { facturaId: number; valor: number }[];
  /** Momento de la anulación (ISO), o `null` si está activo. */
  anuladoEn: string | null;
  /** Motivo de la anulación. */
  motivoAnulacion: string;
}

/**
 * Devolución de venta o de compra de una factura del tercero.
 */
export interface DevolucionCuenta {
  /** Id interno. */
  id: number;
  /** Número de la devolución. */
  numero: number;
  /** Factura devuelta. */
  facturaId: number;
  /** Día de la devolución, `AAAA-MM-DD`. */
  dia: string;
  /** Momento en que se guardó (ISO). */
  momento: string;
  /** Valor devuelto. */
  total: number;
  /** Productos devueltos, en el orden de la devolución. */
  lineas: { cantidad: number; unidad: UnidadMedida; nombre: string }[];
  /** Momento de la anulación (ISO), o `null` si está activa. */
  anuladaEn: string | null;
  /** Motivo de la anulación. */
  motivoAnulacion: string;
}

/**
 * Reintegro en dinero de un saldo a favor (los de una venta de contado no
 * afectan la cuenta y no se incluyen).
 */
export interface ReintegroCuenta {
  /** Id interno. */
  id: number;
  /** Número del reintegro. */
  numero: number;
  /** Día, `AAAA-MM-DD`. */
  dia: string;
  /** Momento (ISO). */
  momento: string;
  /** El negocio entrega el dinero o lo recibe. */
  sentido: 'entrega' | 'recibe';
  /** Nombre de la forma de pago. */
  formaPago: string;
  /** Valor. */
  valor: number;
  /** Momento de la anulación (ISO), o `null` si está activo. */
  anuladoEn: string | null;
  /** Motivo de la anulación. */
  motivoAnulacion: string;
}

/**
 * Fila del libro de saldo a favor del tercero.
 */
export interface MovimientoFavorCuenta {
  /** Documento que lo generó, p. ej. `correccion_compra` o `abono`. */
  documentoTipo: string;
  /** Id de ese documento. */
  documentoId: number;
  /** Momento (ISO). */
  momento: string;
  /** Valor con signo: suma (lo genera) o resta (lo usa o lo recupera). */
  valor: number;
  /** Factura que trasladó el excedente, o `null`. */
  facturaId: number | null;
}

/**
 * Datos con que se arma el estado de cuenta.
 */
export interface EntradaEstadoCuenta {
  /** Cliente o proveedor. */
  tipo: TipoCartera;
  /** Primer día del periodo, `AAAA-MM-DD`. */
  desde: string;
  /** Último día del periodo, `AAAA-MM-DD`. */
  hasta: string;
  /** Facturas a crédito (cliente) o compras (proveedor), activas y anuladas. */
  facturas: readonly FacturaCuenta[];
  /** Correcciones de esas facturas. */
  versiones: readonly VersionCuenta[];
  /** Abonos, activos y anulados. */
  abonos: readonly AbonoCuenta[];
  /** Devoluciones, activas y anuladas. */
  devoluciones: readonly DevolucionCuenta[];
  /** Reintegros de saldo a favor, activos y anulados. */
  reintegros: readonly ReintegroCuenta[];
  /** Libro de saldo a favor del tercero. */
  favor: readonly MovimientoFavorCuenta[];
}

/**
 * Resultado del estado de cuenta (sin el tercero ni el corte, que pone el servicio).
 */
export interface EstadoCuentaArmado {
  /** Saldo neto al cierre del día anterior a `desde`. */
  saldoAnterior: number;
  /** Movimientos del periodo. */
  movimientos: MovimientoEstadoCuenta[];
  /** Suma de cargos del periodo. */
  cargos: number;
  /** Suma de abonos del periodo. */
  abonos: number;
  /** Saldo neto al final del periodo. */
  saldoFinal: number;
  /** Documentos con saldo al último día del periodo. */
  pendientes: PendienteEstadoCuenta[];
  /** Recuadro final. */
  resumen: ResumenEstadoCuenta;
}

/**
 * Lo que hace cada clase de hecho con la cartera, en el orden en que se
 * aplican los hechos de un mismo momento (una compra de contado y su abono
 * automático, o una compra anulada y la anulación de ese abono).
 */
const ORDEN_CLASES = [
  'factura',
  'correccion',
  'devolucion',
  'anulacion-devolucion',
  'anulacion-factura',
  'abono',
  'anulacion-abono',
  'reintegro',
  'anulacion-reintegro',
  'favor',
] as const;

/**
 * Clase de hecho del estado de cuenta.
 */
type ClaseHecho = (typeof ORDEN_CLASES)[number];

/**
 * Hecho que mueve la cuenta del tercero, ya fechado.
 */
interface Hecho {
  /** Clase. */
  clase: ClaseHecho;
  /** Clave con que el libro de saldo a favor lo referencia. */
  clave: string;
  /** Día, `AAAA-MM-DD`. */
  dia: string;
  /** Momento (ISO), para ordenar dentro del día. */
  momento: string;
  /** Id para desempatar. */
  id: number;
}

/**
 * Clave de un hecho a partir del documento con que el libro de saldo a favor
 * lo referencia (migración 0007).
 *
 * @param documentoTipo - `documento_tipo` del libro.
 * @param documentoId - `documento_id` del libro.
 * @returns Clave del hecho.
 *
 * @example
 * claveDeFavor('correccion_compra', 12); // 'correccion:12'
 */
export function claveDeFavor(documentoTipo: string, documentoId: number): string {
  switch (documentoTipo) {
    case 'correccion_venta':
    case 'correccion_compra':
      return `correccion:${documentoId}`;
    case 'anulacion_venta':
    case 'anulacion_compra':
      return `anulacion-factura:${documentoId}`;
    case 'devolucion':
      return `devolucion:${documentoId}`;
    case 'anulacion_devolucion':
      return `anulacion-devolucion:${documentoId}`;
    case 'abono':
      return `abono:${documentoId}`;
    case 'anulacion_abono':
      return `anulacion-abono:${documentoId}`;
    case 'reintegro':
      return `reintegro:${documentoId}`;
    case 'anulacion_reintegro':
      return `anulacion-reintegro:${documentoId}`;
    default:
      return `favor:${documentoTipo}:${documentoId}`;
  }
}

/**
 * Cantidad corta para un texto: sin los ceros de sobra de los kilos.
 *
 * @param milesimas - Cantidad.
 * @param unidad - Unidad.
 * @returns Texto, p. ej. `5` o `1.25`.
 *
 * @example
 * cantidadCorta(5000, 'KG'); // '5'
 */
export function cantidadCorta(milesimas: number, unidad: UnidadMedida): string {
  const texto = formatearCantidad(milesimas, unidad);
  return unidad === 'KG' ? texto.replace(/\.?0+$/, '') : texto;
}

/**
 * Une una lista en español: «A», «A y B», «A, B y C».
 *
 * @param partes - Textos.
 * @returns Texto unido.
 */
function unirLista(partes: readonly string[]): string {
  if (partes.length <= 1) {
    return partes.join('');
  }
  return `${partes.slice(0, -1).join(', ')} y ${partes.at(-1) ?? ''}`;
}

/**
 * Saldo neto como se muestra en la columna «Saldo»: si queda a favor del
 * tercero, «A favor N».
 *
 * @param saldo - Saldo neto (negativo = a favor).
 * @returns Texto.
 *
 * @example
 * textoSaldoNeto(-5500); // 'A favor 5,500'
 * textoSaldoNeto(27000); // '27,000'
 */
export function textoSaldoNeto(saldo: number): string {
  return saldo < 0 ? `A favor ${agruparMiles(-saldo)}` : agruparMiles(saldo);
}

/**
 * Plazo y vencimiento en palabras, p. ej. `crédito 8 días, vence 17/09/2026`.
 *
 * @param plazoDias - Plazo.
 * @param vence - Vencimiento.
 * @returns Texto en minúsculas.
 */
function textoPlazo(plazoDias: number, vence: string): string {
  const plazo =
    plazoDias === 0 ? 'crédito' : `crédito ${plazoDias} ${plazoDias === 1 ? 'día' : 'días'}`;
  return `${plazo}, vence ${formatearFecha(vence)}`;
}

/**
 * Pone en mayúscula la primera letra.
 *
 * @param texto - Texto.
 * @returns Texto con la inicial en mayúscula.
 */
function inicialMayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Lo que un hecho hizo con el saldo a favor, para el final del detalle.
 *
 * @param delta - Cambio del saldo a favor.
 * @returns `; N a favor`, `; usa N del saldo a favor` o vacío.
 */
function sufijoFavor(delta: number): string {
  if (delta > 0) {
    return `; ${agruparMiles(delta)} a favor`;
  }
  return delta < 0 ? `; usa ${agruparMiles(-delta)} del saldo a favor` : '';
}

/**
 * Estado de una factura durante el recorrido.
 */
interface EstadoFactura {
  /** Datos de la factura. */
  factura: FacturaCuenta;
  /** Total vigente. */
  total: number;
  /** Aplicado por abonos activos. */
  abonado: number;
  /** Saldo (D-127). */
  saldo: number;
  /** Si sigue activa. */
  activa: boolean;
}

/**
 * Arma el estado de cuenta de un tercero (D-149, D-162 a D-164): recorre en
 * orden de fecha todo lo que movió su cuenta (facturas a crédito o compras,
 * correcciones, devoluciones, abonos, anulaciones, reintegros y el libro de
 * saldo a favor) y lleva dos saldos: lo que debe (suma de los saldos de sus
 * facturas activas, D-127) y su saldo a favor. El saldo de cada renglón es
 * el neto (lo que debe menos el saldo a favor); cargo o abono es lo que ese
 * hecho cambió el neto. Lo anterior a `desde` se resume en el saldo
 * anterior; lo posterior a `hasta` no cuenta. Los pendientes son las
 * facturas con saldo al final de `hasta`, con sus días contra ese día.
 *
 * @param entrada - Documentos del tercero y periodo.
 * @returns Saldo anterior, movimientos, totales, pendientes y resumen.
 *
 * @example
 * // Compra 37 de 960,000 pagada de contado y corregida a 924,400:
 * // renglones +960,000 (compra), −960,000 (abono 22) y −35,600 (Compra 37 v2; 35,600 a favor).
 */
export function armarEstadoCuenta(entrada: EntradaEstadoCuenta): EstadoCuentaArmado {
  const cliente = entrada.tipo === 'cliente';
  const facturas = new Map<number, EstadoFactura>();
  const datosFactura = new Map(entrada.facturas.map((f) => [f.id, f]));
  const versiones = new Map(entrada.versiones.map((v) => [v.id, v]));
  const abonos = new Map(entrada.abonos.map((a) => [a.id, a]));
  const devoluciones = new Map(entrada.devoluciones.map((d) => [d.id, d]));
  const reintegros = new Map(entrada.reintegros.map((r) => [r.id, r]));
  const favorPorClave = new Map<string, MovimientoFavorCuenta[]>();
  const hechos: Hecho[] = [];

  /**
   * Agrega un hecho a la lista.
   *
   * @param clase - Clase.
   * @param id - Id del documento.
   * @param momento - Momento ISO.
   * @param dia - Día; por defecto el del momento.
   */
  const agregar = (clase: ClaseHecho, id: number, momento: string, dia?: string): void => {
    hechos.push({ clase, clave: `${clase}:${id}`, dia: dia ?? momento.slice(0, 10), momento, id });
  };

  for (const f of entrada.facturas) {
    agregar('factura', f.id, f.momento, f.dia);
    if (f.anuladaEn !== null) agregar('anulacion-factura', f.id, f.anuladaEn);
  }
  for (const v of entrada.versiones) agregar('correccion', v.id, v.momento);
  for (const a of entrada.abonos) {
    agregar('abono', a.id, a.momento, a.dia);
    if (a.anuladoEn !== null) agregar('anulacion-abono', a.id, a.anuladoEn);
  }
  for (const d of entrada.devoluciones) {
    agregar('devolucion', d.id, d.momento, d.dia);
    if (d.anuladaEn !== null) agregar('anulacion-devolucion', d.id, d.anuladaEn);
  }
  for (const r of entrada.reintegros) {
    agregar('reintegro', r.id, r.momento, r.dia);
    if (r.anuladoEn !== null) agregar('anulacion-reintegro', r.id, r.anuladoEn);
  }
  const claves = new Set(hechos.map((h) => h.clave));
  entrada.favor.forEach((m, i) => {
    const clave = claveDeFavor(m.documentoTipo, m.documentoId);
    const lista = favorPorClave.get(clave) ?? [];
    lista.push(m);
    favorPorClave.set(clave, lista);
    // Un movimiento sin documento conocido no se pierde: va como renglón propio.
    if (!claves.has(clave)) {
      claves.add(clave);
      hechos.push({
        clase: 'favor',
        clave,
        dia: m.momento.slice(0, 10),
        momento: m.momento,
        id: i,
      });
    }
  });
  hechos.sort(
    (a, b) =>
      a.dia.localeCompare(b.dia) ||
      a.momento.localeCompare(b.momento) ||
      ORDEN_CLASES.indexOf(a.clase) - ORDEN_CLASES.indexOf(b.clase) ||
      a.id - b.id,
  );

  /**
   * Nombre del documento de una factura: `Factura 84765` o `Compra 37`.
   *
   * @param f - Factura.
   * @returns Texto.
   */
  const nombreFactura = (f: FacturaCuenta): string =>
    cliente ? `Factura ${f.numero}` : `Compra ${f.numero}`;
  /**
   * Si una anulación ocurrió dentro del alcance del estado de cuenta (la
   * marca no se pone por una anulación posterior a `hasta`).
   *
   * @param momento - Momento de la anulación, o `null`.
   * @returns `true` si se anuló a más tardar el día `hasta`.
   */
  const anuladoAntesDeHasta = (momento: string | null): boolean =>
    momento !== null && momento.slice(0, 10) <= entrada.hasta;

  /**
   * Aplica un hecho a los saldos y describe su renglón.
   *
   * @param h - Hecho.
   * @returns Cambio de la deuda, documento, marca y detalle (sin el saldo a favor).
   */
  const aplicar = (
    h: Hecho,
  ): { deuda: number; documento: string; marca: string; detalle: string; sinSufijo?: boolean } => {
    switch (h.clase) {
      case 'factura': {
        const f = datosFactura.get(h.id);
        if (!f) break;
        facturas.set(f.id, {
          factura: f,
          total: f.totalInicial,
          abonado: 0,
          saldo: f.totalInicial,
          activa: true,
        });
        let detalle: string;
        if (cliente) {
          detalle = f.saldoInicial
            ? `Saldo inicial importado, vence ${formatearFecha(f.vence)}`
            : inicialMayuscula(textoPlazo(f.plazoDias, f.vence));
        } else if (f.saldoInicial) {
          detalle = `${f.referencia} · saldo inicial importado, vence ${formatearFecha(f.vence)}`;
        } else {
          detalle = `${f.referencia} · ${f.contado ? 'pagada de contado' : textoPlazo(f.plazoDias, f.vence)}`;
        }
        return {
          deuda: f.totalInicial,
          documento: nombreFactura(f),
          marca: anuladoAntesDeHasta(f.anuladaEn) ? 'ANULADA' : '',
          detalle,
        };
      }
      case 'correccion': {
        const v = versiones.get(h.id);
        const e = v ? facturas.get(v.facturaId) : undefined;
        if (!v || !e) break;
        const delta = v.totalNuevo - v.totalAnterior;
        e.total += delta;
        e.saldo += delta;
        return {
          deuda: e.activa ? delta : 0,
          documento: `${nombreFactura(e.factura)} v${v.version}`,
          marca: '',
          detalle: `Corrección: total ${agruparMiles(v.totalAnterior)} → ${agruparMiles(v.totalNuevo)}`,
        };
      }
      case 'devolucion':
      case 'anulacion-devolucion': {
        const d = devoluciones.get(h.id);
        const e = d ? facturas.get(d.facturaId) : undefined;
        if (!d || !e) break;
        const anulacion = h.clase === 'anulacion-devolucion';
        const delta = anulacion ? d.total : -d.total;
        e.saldo += delta;
        const documento = `Devolución de ${cliente ? 'venta' : 'compra'} ${d.numero}`;
        if (anulacion) {
          return {
            deuda: e.activa ? delta : 0,
            documento,
            marca: '',
            detalle: d.motivoAnulacion ? `Anulación · ${d.motivoAnulacion}` : 'Anulación',
          };
        }
        const productos = d.lineas
          .slice(0, 2)
          .map((l) => `${cantidadCorta(l.cantidad, l.unidad)} ${l.unidad} ${l.nombre}`);
        const mas = d.lineas.length - productos.length;
        const lista =
          mas > 0
            ? `${productos.join(', ')} y ${mas} ${mas === 1 ? 'producto' : 'productos'} más`
            : unirLista(productos);
        return {
          deuda: e.activa ? delta : 0,
          documento,
          marca: anuladoAntesDeHasta(d.anuladaEn) ? 'ANULADA' : '',
          detalle: `${nombreFactura(e.factura)} · ${lista}`,
        };
      }
      case 'anulacion-factura': {
        const e = facturas.get(h.id);
        if (!e) break;
        const deuda = e.activa ? -e.saldo : 0;
        e.activa = false;
        const motivo = e.factura.motivoAnulacion;
        return {
          deuda,
          documento: nombreFactura(e.factura),
          marca: '',
          detalle: motivo ? `Anulación · ${motivo}` : 'Anulación',
        };
      }
      case 'abono':
      case 'anulacion-abono': {
        const a = abonos.get(h.id);
        if (!a) break;
        const signo = h.clase === 'abono' ? -1 : 1;
        let deuda = 0;
        for (const ap of a.aplicaciones) {
          const e = facturas.get(ap.facturaId);
          if (!e) continue;
          e.abonado -= signo * ap.valor;
          if (e.activa) {
            e.saldo += signo * ap.valor;
            deuda += signo * ap.valor;
          }
        }
        const documento = `Abono ${a.numero}`;
        if (h.clase === 'anulacion-abono') {
          return {
            deuda,
            documento,
            marca: '',
            detalle: a.motivoAnulacion ? `Anulación · ${a.motivoAnulacion}` : 'Anulación',
          };
        }
        /**
         * Nombre de una factura del reparto: `84765` o `compra 31 (FE-5521)`.
         *
         * @param facturaId - Factura.
         * @returns Texto.
         */
        const nombreAplicada = (facturaId: number): string => {
          const f = datosFactura.get(facturaId);
          if (!f) return '';
          return cliente ? String(f.numero) : `compra ${f.numero} (${f.referencia})`;
        };
        let detalle: string;
        const primera = a.aplicaciones[0];
        const compraContado = primera ? datosFactura.get(primera.facturaId) : undefined;
        if (a.contado && compraContado) {
          detalle = `${a.formaPago} · pago de contado de la compra ${compraContado.numero}`;
        } else if (a.aplicaciones.length === 1 && primera) {
          detalle = `${a.formaPago} · aplicado a ${nombreAplicada(primera.facturaId)}`;
        } else {
          detalle = `${a.formaPago} · aplicado a ${unirLista(
            a.aplicaciones.map(
              (ap) => `${nombreAplicada(ap.facturaId)} por ${agruparMiles(ap.valor)}`,
            ),
          )}`;
        }
        return {
          deuda,
          documento,
          marca: anuladoAntesDeHasta(a.anuladoEn) ? 'ANULADO' : '',
          detalle,
          sinSufijo: a.conSaldoFavor,
        };
      }
      case 'reintegro':
      case 'anulacion-reintegro': {
        const r = reintegros.get(h.id);
        if (!r) break;
        const documento = `Reintegro ${r.numero}`;
        if (h.clase === 'anulacion-reintegro') {
          return {
            deuda: 0,
            documento,
            marca: '',
            detalle: r.motivoAnulacion ? `Anulación · ${r.motivoAnulacion}` : 'Anulación',
          };
        }
        return {
          deuda: 0,
          documento,
          marca: anuladoAntesDeHasta(r.anuladoEn) ? 'ANULADO' : '',
          detalle: `${r.formaPago} · ${r.sentido === 'entrega' ? 'se entregó' : 'se recibió'} del saldo a favor`,
          sinSufijo: true,
        };
      }
      case 'favor':
        return { deuda: 0, documento: '', marca: '', detalle: 'Movimiento de saldo a favor' };
    }
    return { deuda: 0, documento: '', marca: '', detalle: '' };
  };

  let deuda = 0;
  let favor = 0;
  let saldoAnterior = 0;
  const movimientos: MovimientoEstadoCuenta[] = [];
  for (const h of hechos) {
    if (h.dia > entrada.hasta) break;
    const renglon = aplicar(h);
    let deltaDeuda = renglon.deuda;
    let deltaFavor = 0;
    for (const m of favorPorClave.get(h.clave) ?? []) {
      deltaFavor += m.valor;
      const e = m.facturaId === null ? undefined : facturas.get(m.facturaId);
      // Lo que una factura activa traslada al saldo a favor vuelve a su saldo (D-127).
      if (e?.activa) {
        e.saldo += m.valor;
        deltaDeuda += m.valor;
      }
    }
    deuda += deltaDeuda;
    favor += deltaFavor;
    const neto = deuda - favor;
    if (h.dia < entrada.desde) {
      saldoAnterior = neto;
      continue;
    }
    const delta = deltaDeuda - deltaFavor;
    movimientos.push({
      fecha: h.dia,
      documento: renglon.documento,
      marca: renglon.marca,
      detalle: renglon.detalle + (renglon.sinSufijo ? '' : sufijoFavor(deltaFavor)),
      cargo: Math.max(delta, 0),
      abono: Math.max(-delta, 0),
      saldo: neto,
    });
  }

  const pendientes = [...facturas.values()]
    .filter((e) => e.activa && e.saldo > 0)
    .sort(
      (a, b) =>
        a.factura.vence.localeCompare(b.factura.vence) ||
        a.factura.dia.localeCompare(b.factura.dia) ||
        a.factura.numero - b.factura.numero,
    )
    .map((e): PendienteEstadoCuenta => {
      const f = e.factura;
      const nombre = cliente
        ? `Factura ${f.numero}`
        : `Compra ${f.numero}${f.referencia ? ` · ${f.referencia}` : ''}`;
      return {
        documento: f.saldoInicial ? `${nombre} · saldo inicial` : nombre,
        fecha: f.dia,
        vence: f.vence,
        ...estadoVencimiento(f.vence, entrada.hasta),
        total: e.total,
        abonado: e.abonado,
        devuelto: e.total - e.abonado - e.saldo,
        saldo: e.saldo,
      };
    });
  const pendiente = pendientes.reduce((s, p) => s + p.saldo, 0);
  const vencido = pendientes.filter((p) => p.vencida).reduce((s, p) => s + p.saldo, 0);
  return {
    saldoAnterior,
    movimientos,
    cargos: movimientos.reduce((s, m) => s + m.cargo, 0),
    abonos: movimientos.reduce((s, m) => s + m.abono, 0),
    saldoFinal: deuda - favor,
    pendientes,
    resumen: { pendiente, vencido, saldoFavor: favor, neto: pendiente - favor },
  };
}
