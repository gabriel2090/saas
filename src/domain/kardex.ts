import type { DocumentoVisible, FilaKardex } from '../shared/kardex';
import { aMilesimas, aPesos, valorLinea } from './dinero';

/**
 * Nombre en pantalla de cada tipo de movimiento del kardex. Un tipo nuevo
 * sin nombre aquí se muestra tal cual (no se oculta).
 */
const NOMBRES_MOVIMIENTO: Readonly<Record<string, string>> = {
  inicial: 'Inventario inicial',
  compra: 'Compra',
  venta: 'Venta',
  ajuste: 'Ajuste',
  correccion_venta: 'Corrección de venta',
  correccion_compra: 'Corrección de compra',
  anulacion_venta: 'Anulación de venta',
  anulacion_compra: 'Anulación de compra',
  devolucion_venta: 'Devolución de venta',
  devolucion_compra: 'Devolución de compra',
  anulacion_devolucion_venta: 'Anulación de devolución de venta',
  anulacion_devolucion_compra: 'Anulación de devolución de compra',
  anulacion_ajuste: 'Anulación de ajuste',
};

/** Nombre de cada tipo de ajuste dentro del paréntesis de «Ajuste (…)». */
const NOMBRES_AJUSTE: Readonly<Record<string, string>> = {
  merma: 'merma',
  dano: 'daño',
  conteo: 'conteo físico',
};

/**
 * Nombre en pantalla de un movimiento del kardex.
 *
 * @param tipo - Tipo guardado en el kardex.
 * @param tipoAjuste - Tipo del ajuste (`merma`, `dano`, `conteo`) si el movimiento es un ajuste.
 * @returns Nombre, p. ej. `Devolución de venta` o `Ajuste (merma)`.
 *
 * @example
 * etiquetaMovimiento('ajuste', 'dano'); // 'Ajuste (daño)'
 * etiquetaMovimiento('traslado', null); // 'traslado' (sin traducción, tal cual)
 */
export function etiquetaMovimiento(tipo: string, tipoAjuste: string | null): string {
  const nombre = NOMBRES_MOVIMIENTO[tipo] ?? tipo;
  if (tipo === 'ajuste' && tipoAjuste !== null) {
    return `${nombre} (${NOMBRES_AJUSTE[tipoAjuste] ?? tipoAjuste})`;
  }
  return nombre;
}

/**
 * Documento que originó un movimiento, ya resuelto por el repositorio.
 */
export type OrigenMovimiento =
  | {
      clase: 'factura-cliente';
      numero: number;
      /** Versión que dejó la corrección (solo en las filas de corrección). */
      version: number | null;
    }
  | {
      clase: 'factura-proveedor';
      numero: number;
      /** Número de la factura del proveedor. */
      referencia: string;
      version: number | null;
    }
  | {
      clase: 'devolucion';
      tipo: 'venta' | 'compra';
      numero: number;
      /** Número de la factura (o compra) devuelta. */
      facturaNumero: number;
    }
  | { clase: 'ajuste'; numero: number }
  | { clase: 'importacion' }
  | { clase: 'producto' }
  | { clase: 'otro'; texto: string };

/**
 * Texto del documento de origen de un movimiento.
 *
 * @param origen - Documento resuelto.
 * @returns Texto, p. ej. `Compra 31 · FE-5521` o `Factura 84783 · versión 2`.
 *
 * @example
 * textoDocumento({ clase: 'devolucion', tipo: 'venta', numero: 3, facturaNumero: 84772 });
 * // 'Devolución 3 · fact. 84772'
 */
export function textoDocumento(origen: OrigenMovimiento): string {
  const version = (v: number | null): string => (v !== null && v > 1 ? ` · versión ${v}` : '');
  switch (origen.clase) {
    case 'factura-cliente':
      return `Factura ${origen.numero}${version(origen.version)}`;
    case 'factura-proveedor':
      return `Compra ${origen.numero} · ${origen.referencia}${version(origen.version)}`;
    case 'devolucion':
      return `Devolución ${origen.numero} · ${origen.tipo === 'venta' ? 'fact.' : 'compra'} ${origen.facturaNumero}`;
    case 'ajuste':
      return `Ajuste ${origen.numero}`;
    case 'importacion':
      return 'Importación';
    case 'producto':
      return 'Ficha del producto';
    case 'otro':
      return origen.texto;
  }
}

/**
 * Marca de la fila de una anulación: el documento anulado, en femenino o en
 * masculino según el documento.
 *
 * @param tipo - Tipo de movimiento.
 * @returns `ANULADA`, `ANULADO` o vacío si no es una anulación.
 */
export function marcaAnulacion(tipo: string): string {
  if (tipo === 'anulacion_ajuste') return 'ANULADO';
  return tipo.startsWith('anulacion_') ? 'ANULADA' : '';
}

/**
 * Movimiento del periodo listo para el kardex (sin saldo todavía).
 */
export interface MovimientoKardex {
  /** Id del movimiento. */
  id: number;
  /** Fecha y hora (ISO con zona). */
  fecha: string;
  /** Tipo guardado en el kardex. */
  tipo: string;
  /** Tipo del ajuste, si lo es. */
  tipoAjuste: string | null;
  /** Milésimas con signo. */
  cantidad: number;
  /** Costo unitario del movimiento. */
  costoUnitario: number;
  /** Documento de origen. */
  origen: OrigenMovimiento;
  /** Tercero del documento, o vacío. */
  tercero: string;
  /** Bodega. */
  bodega: string;
  /** Documento que abre «Ver documento», o `null`. */
  ver: DocumentoVisible | null;
}

/**
 * Datos para armar el kardex.
 */
export interface EntradaKardex {
  /** Saldo antes del periodo, en milésimas. */
  saldoAnterior: number;
  /** Movimientos del periodo en orden (fecha e id). */
  movimientos: readonly MovimientoKardex[];
  /** Costo actual del producto, para valorizar el saldo final. */
  costoActual: number;
}

/**
 * Kardex armado: filas con saldo corrido y totales del periodo.
 */
export interface KardexArmado {
  /** Filas con entrada, salida y saldo. */
  filas: FilaKardex[];
  /** Suma de entradas, en milésimas. */
  entradas: number;
  /** Suma de salidas, en milésimas (positiva). */
  salidas: number;
  /** Saldo final, en milésimas. */
  saldoFinal: number;
  /** Saldo final al costo actual, en pesos. */
  valorCostoActual: number;
}

/**
 * Arma el kardex: parte del saldo anterior y suma cada movimiento para el
 * saldo corrido. Los movimientos positivos son entradas y los negativos
 * salidas, sin importar el tipo (p. ej. un conteo físico que sube el stock
 * es una entrada). Se cumple siempre que
 * `saldoAnterior + entradas − salidas = saldoFinal`.
 *
 * @param entrada - Saldo anterior, movimientos y costo actual.
 * @returns Filas y totales.
 * @throws {ErrorDeNegocio} Si una cantidad o el costo no son enteros.
 *
 * @example
 * armarKardex({ saldoAnterior: 0, costoActual: 11_800, movimientos: [compra de 48 und, venta de 6 und] });
 * // entradas 48,000 · salidas 6,000 · saldoFinal 42,000 · valorCostoActual 495,600
 */
export function armarKardex(entrada: EntradaKardex): KardexArmado {
  let saldo = aMilesimas(entrada.saldoAnterior);
  let entradas = 0;
  let salidas = 0;
  const filas = entrada.movimientos.map((m): FilaKardex => {
    const cantidad = aMilesimas(m.cantidad);
    saldo = aMilesimas(saldo + cantidad);
    if (cantidad > 0) entradas += cantidad;
    else salidas -= cantidad;
    return {
      id: m.id,
      fecha: m.fecha,
      movimiento: etiquetaMovimiento(m.tipo, m.tipoAjuste),
      documento: textoDocumento(m.origen),
      marca: marcaAnulacion(m.tipo),
      tercero: m.tercero,
      bodega: m.bodega,
      entrada: cantidad > 0 ? cantidad : 0,
      salida: cantidad < 0 ? 0 - cantidad : 0,
      saldo,
      costoUnitario: m.costoUnitario,
      ver: m.ver,
    };
  });
  return {
    filas,
    entradas,
    salidas,
    saldoFinal: saldo,
    valorCostoActual: valorLinea(aPesos(entrada.costoActual), saldo),
  };
}
