import type {
  BodegaReporte,
  DocumentoCartera,
  FilaInventario,
  GrupoCartera,
  PeticionCartera,
  PeticionInventario,
  ResumenCartera,
  ResumenInventario,
  TerceroReporte,
} from '../shared/reportes';
import type { UnidadMedida } from '../shared/formato/cantidades';
import { diasEntre } from './calendario';
import { aMilesimas, aPesos, valorLinea } from './dinero';
import { claveComparacion } from './texto';

/**
 * Estado de vencimiento de un documento con saldo.
 */
export interface EstadoVencimiento {
  /** Si ya venció (vence antes de hoy). */
  vencida: boolean;
  /** Días vencida si `vencida`; si no, días que faltan (0 = vence hoy). */
  dias: number;
}

/**
 * Calcula si un documento está vencido y por cuántos días.
 *
 * @param vence - Vencimiento `AAAA-MM-DD`.
 * @param hoy - Día de hoy `AAAA-MM-DD`.
 * @returns Estado de vencimiento.
 * @throws {RangeError} Si alguna fecha no es válida.
 *
 * @example
 * estadoVencimiento('2026-09-29', '2026-10-04'); // { vencida: true, dias: 5 }
 * estadoVencimiento('2026-10-04', '2026-10-04'); // { vencida: false, dias: 0 }
 * estadoVencimiento('2026-10-12', '2026-10-04'); // { vencida: false, dias: 8 }
 */
export function estadoVencimiento(vence: string, hoy: string): EstadoVencimiento {
  const dias = diasEntre(hoy, vence);
  return dias < 0 ? { vencida: true, dias: -dias } : { vencida: false, dias };
}

/**
 * Texto corto de la columna «Días» de los reportes de cartera.
 *
 * @param estado - Estado de vencimiento.
 * @returns `Vencida N`, `Vence hoy` o `Faltan N`.
 *
 * @example
 * textoDias({ vencida: true, dias: 5 }); // 'Vencida 5'
 */
export function textoDias(estado: EstadoVencimiento): string {
  if (estado.vencida) {
    return `Vencida ${estado.dias}`;
  }
  return estado.dias === 0 ? 'Vence hoy' : `Faltan ${estado.dias}`;
}

/**
 * Documento pendiente tal como sale de la base de datos.
 */
export interface DocumentoPendiente {
  /** Id interno. */
  id: number;
  /** Código del tercero. */
  terceroCodigo: number;
  /** Número de la factura o de la compra. */
  numero: number;
  /** Número de la factura del proveedor (vacío en las de cliente). */
  referencia: string;
  /** Si es un saldo inicial importado. */
  saldoInicial: boolean;
  /** Fecha `AAAA-MM-DD`. */
  fecha: string;
  /** Vencimiento `AAAA-MM-DD`. */
  vence: string;
  /** Total vigente. */
  total: number;
  /** Aplicado por abonos activos. */
  abonado: number;
  /** Saldo pendiente. */
  saldo: number;
}

/**
 * Datos con que se arma el reporte de cartera.
 */
export interface EntradaCartera {
  /** Documentos con saldo mayor que cero. */
  documentos: readonly DocumentoPendiente[];
  /** Terceros (al menos los de los documentos y los de saldo a favor). */
  terceros: readonly TerceroReporte[];
  /** Saldo a favor por código de tercero (solo los mayores que cero). */
  saldosFavor: ReadonlyMap<number, number>;
  /** Día de hoy `AAAA-MM-DD`. */
  hoy: string;
  /** Filtros pedidos. */
  filtros: Omit<PeticionCartera, 'tipo'>;
}

/**
 * Agrupa los documentos pendientes por tercero y calcula subtotales y totales
 * (D-148): primero el tercero con el vencimiento más antiguo (empate por
 * nombre); dentro de cada grupo, del vencimiento más antiguo al más reciente;
 * al final, los terceros que solo tienen saldo a favor.
 *
 * @param entrada - Documentos, terceros, saldos a favor, hoy y filtros.
 * @returns Grupos y resumen.
 *
 * @example
 * // «Solo vencidas» quita los documentos por vencer y los grupos que quedan
 * // sin documentos; el saldo a favor del grupo se sigue mostrando.
 */
export function armarCartera(entrada: EntradaCartera): {
  grupos: GrupoCartera[];
  resumen: ResumenCartera;
} {
  const { filtros, hoy } = entrada;
  const terceros = new Map(entrada.terceros.map((t) => [t.codigo, t]));
  const porTercero = new Map<number, DocumentoCartera[]>();
  const conPendientes = new Set<number>();

  for (const d of entrada.documentos) {
    if (d.saldo <= 0) {
      continue;
    }
    conPendientes.add(d.terceroCodigo);
    if (filtros.terceroCodigo !== null && d.terceroCodigo !== filtros.terceroCodigo) {
      continue;
    }
    const estado = estadoVencimiento(d.vence, hoy);
    if (filtros.soloVencidas && !estado.vencida) {
      continue;
    }
    const lista = porTercero.get(d.terceroCodigo) ?? [];
    lista.push({
      id: d.id,
      numero: d.numero,
      referencia: d.referencia,
      saldoInicial: d.saldoInicial,
      fecha: d.fecha,
      vence: d.vence,
      total: d.total,
      abonado: d.abonado,
      devuelto: d.total - d.abonado - d.saldo,
      saldo: d.saldo,
      vencida: estado.vencida,
      dias: estado.dias,
    });
    porTercero.set(d.terceroCodigo, lista);
  }

  if (filtros.incluirSoloFavor) {
    for (const [codigo, favor] of entrada.saldosFavor) {
      const pasaFiltro = filtros.terceroCodigo === null || codigo === filtros.terceroCodigo;
      // Con «Solo vencidas», quien solo tiene documentos por vencer no es «solo saldo a favor».
      if (favor > 0 && pasaFiltro && !conPendientes.has(codigo)) {
        porTercero.set(codigo, []);
      }
    }
  }

  const grupos: GrupoCartera[] = [];
  for (const [codigo, documentos] of porTercero) {
    const tercero = terceros.get(codigo);
    if (!tercero) {
      continue;
    }
    documentos.sort(
      (a, b) => a.vence.localeCompare(b.vence) || a.fecha.localeCompare(b.fecha) || a.id - b.id,
    );
    const saldo = documentos.reduce((s, d) => s + d.saldo, 0);
    const vencido = documentos.reduce((s, d) => s + (d.vencida ? d.saldo : 0), 0);
    const saldoFavor = entrada.saldosFavor.get(codigo) ?? 0;
    grupos.push({ tercero, documentos, saldo, vencido, saldoFavor, neto: saldo - saldoFavor });
  }

  grupos.sort((a, b) => {
    const va = a.documentos[0]?.vence;
    const vb = b.documentos[0]?.vence;
    // Los que solo tienen saldo a favor no tienen vencimiento: van al final.
    if (va === undefined || vb === undefined) {
      if (va !== vb) {
        return va === undefined ? 1 : -1;
      }
    } else if (va !== vb) {
      return va.localeCompare(vb);
    }
    return (
      a.tercero.nombre.localeCompare(b.tercero.nombre, 'es') || a.tercero.codigo - b.tercero.codigo
    );
  });

  const documentos = grupos.flatMap((g) => g.documentos);
  const vencidos = documentos.filter((d) => d.vencida);
  const total = grupos.reduce((s, g) => s + g.saldo, 0);
  const vencido = grupos.reduce((s, g) => s + g.vencido, 0);
  const saldoFavor = grupos.reduce((s, g) => s + g.saldoFavor, 0);
  return {
    grupos,
    resumen: {
      total,
      vencido,
      porVencer: total - vencido,
      documentosVencidos: vencidos.length,
      documentosPorVencer: documentos.length - vencidos.length,
      saldoFavor,
      neto: total - saldoFavor,
      terceros: grupos.length,
    },
  };
}

/**
 * Producto tal como sale de la base de datos para el inventario.
 */
export interface ProductoInventario {
  /** Código. */
  codigo: number;
  /** Nombre. */
  nombre: string;
  /** Unidad. */
  unidad: UnidadMedida;
  /** Código del proveedor. */
  proveedorCodigo: number;
  /** Nombre del proveedor. */
  proveedorNombre: string;
  /** Costo actual. */
  costo: number;
  /** Si está activo. */
  activo: boolean;
}

/**
 * Existencia de un producto en una bodega (suma de su kardex).
 */
export interface ExistenciaBodega {
  /** Código del producto. */
  productoCodigo: number;
  /** Id de la bodega. */
  bodegaId: number;
  /** Existencia en milésimas (puede ser negativa). */
  cantidad: number;
}

/**
 * Datos con que se arma el inventario valorizado.
 */
export interface EntradaInventario {
  /** Productos. */
  productos: readonly ProductoInventario[];
  /** Existencias por producto y bodega. */
  existencias: readonly ExistenciaBodega[];
  /** Bodegas activas, en el orden de las columnas. */
  bodegas: readonly BodegaReporte[];
  /** Filtros pedidos. */
  filtros: PeticionInventario;
}

/**
 * Arma el inventario valorizado al costo actual (D-147, D-156): cada par
 * producto-bodega se valora por separado; el total y los totales por bodega
 * suman solo los pares positivos y los negativos se informan aparte.
 *
 * @param entrada - Productos, existencias, bodegas y filtros.
 * @returns Bodegas mostradas, filas y resumen.
 *
 * @example
 * // Un producto con 10 und en la principal y −2 en la del norte, a $ 1,000:
 * // valor 10,000 (suma al total) y valor negativo −2,000 (indicador aparte).
 */
export function armarInventario(entrada: EntradaInventario): {
  bodegas: BodegaReporte[];
  filas: FilaInventario[];
  resumen: ResumenInventario;
} {
  const { filtros } = entrada;
  const bodegas = entrada.bodegas.filter(
    (b) => filtros.bodegaId === null || b.id === filtros.bodegaId,
  );
  const columna = new Map(bodegas.map((b, i) => [b.id, i]));
  const existencias = new Map<number, number[]>();
  for (const e of entrada.existencias) {
    const i = columna.get(e.bodegaId);
    if (i === undefined || e.cantidad === 0) {
      continue;
    }
    const fila = existencias.get(e.productoCodigo) ?? bodegas.map(() => 0);
    fila[i] = (fila[i] ?? 0) + e.cantidad;
    existencias.set(e.productoCodigo, fila);
  }

  const texto = claveComparacion(filtros.texto);
  const filas: FilaInventario[] = [];
  const valorPorBodega = bodegas.map(() => 0);
  let productosNegativos = 0;
  let valorNegativoTotal = 0;
  let productosConExistencia = 0;

  const productos = [...entrada.productos].sort((a, b) => a.codigo - b.codigo);
  for (const p of productos) {
    if (!filtros.incluirInactivos && !p.activo) {
      continue;
    }
    if (filtros.proveedorCodigo !== null && p.proveedorCodigo !== filtros.proveedorCodigo) {
      continue;
    }
    if (
      texto !== '' &&
      !String(p.codigo).startsWith(texto) &&
      !claveComparacion(p.nombre).includes(texto)
    ) {
      continue;
    }
    const porBodega = existencias.get(p.codigo) ?? bodegas.map(() => 0);
    const existencia = porBodega.reduce((s, c) => s + c, 0);
    if (!filtros.mostrarSinExistencia && porBodega.every((c) => c === 0)) {
      continue;
    }
    let valor = 0;
    let valorNegativo = 0;
    porBodega.forEach((cantidad, i) => {
      if (cantidad === 0) {
        return;
      }
      const v = valorLinea(aPesos(p.costo), aMilesimas(cantidad));
      if (cantidad > 0) {
        valor += v;
        valorPorBodega[i] = (valorPorBodega[i] ?? 0) + v;
      } else {
        valorNegativo += v;
      }
    });
    if (porBodega.some((c) => c > 0)) {
      productosConExistencia += 1;
    }
    if (porBodega.some((c) => c < 0)) {
      productosNegativos += 1;
      valorNegativoTotal += valorNegativo;
    }
    filas.push({
      codigo: p.codigo,
      nombre: p.nombre,
      unidad: p.unidad,
      proveedorNombre: p.proveedorNombre,
      activo: p.activo,
      porBodega,
      existencia,
      costo: p.costo,
      valor,
      valorNegativo,
    });
  }

  return {
    bodegas,
    filas,
    resumen: {
      productosConExistencia,
      valorPorBodega,
      valorTotal: valorPorBodega.reduce((s, v) => s + v, 0),
      productosNegativos,
      valorNegativo: valorNegativoTotal,
    },
  };
}
