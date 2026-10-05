import type { BaseDeDatos } from '../../data/conexion';
import { documentosCuenta } from '../../data/repositorios/estadoCuenta.repo';
import { obtenerTercero } from '../../data/repositorios/terceros.repo';
import {
  bodegasDeInventario,
  documentosPendientes,
  existenciasPorPar,
  productosDeInventario,
  saldosFavorPorTercero,
  tercerosDeCartera,
} from '../../data/repositorios/reportes.repo';
import { diaDeIso } from '../../domain/calendario';
import { ErrorDeNegocio } from '../../domain/errores';
import { armarEstadoCuenta } from '../../domain/estado-cuenta';
import { etiquetaAccion } from '../../domain/historial';
import { armarCartera, armarInventario } from '../../domain/reportes';
import {
  nombreArchivoEstadoCuenta,
  type PeticionEstadoCuenta,
  type ReporteEstadoCuenta,
} from '../../shared/estadoCuenta';
import { aIsoLocal, formatearFecha } from '../../shared/formato/fechas';
import { TIPOS_DOCUMENTO_HISTORIAL, type PeticionHistorial } from '../../shared/historial';
import type {
  PeticionCartera,
  PeticionInventario,
  PeticionReporte,
  ReporteCartera,
  ReporteInventario,
} from '../../shared/reportes';
import { CODIGO_CONSUMIDOR_FINAL } from '../../shared/ventas';
import {
  filtrosKardex,
  reporteCarteraHtml,
  reporteCierreCajaHtml,
  reporteEstadoCuentaHtml,
  reporteHistorialHtml,
  reporteInventarioHtml,
  reporteKardexHtml,
  TITULOS_CARTERA,
} from '../impresion/reportes';
import { leerCierreGuardado } from './cierreCaja';
import { carteraXlsx, inventarioXlsx, kardexXlsx } from './excel-reportes';
import type { ServicioNegocio } from './negocio';
import { crearServicioVisores, validarPeriodo, type ServicioVisores } from './visores';

/**
 * Servicio de los reportes de la Fase 5: inventario valorizado y cuentas
 * por cobrar y por pagar, siempre «a hoy» (D-146), más el kardex y el
 * historial de cambios por periodo. Solo consulta.
 */
export interface ServicioReportes extends ServicioVisores {
  /**
   * Calcula el inventario valorizado.
   *
   * @param peticion - Filtros.
   * @returns Reporte con el corte de este momento.
   */
  inventario(peticion: PeticionInventario): ReporteInventario;
  /**
   * Calcula las cuentas por cobrar o por pagar.
   *
   * @param peticion - Tipo y filtros.
   * @returns Reporte con el corte de este momento.
   */
  cartera(peticion: PeticionCartera): ReporteCartera;
  /**
   * Calcula el estado de cuenta de un cliente o de un proveedor (D-149).
   *
   * @param peticion - Tercero y periodo.
   * @returns Saldo anterior, movimientos, pendientes al último día y resumen.
   * @throws {ErrorDeNegocio} Si el tercero no existe, es «Consumidor final» o el periodo no es válido.
   */
  estadoCuenta(peticion: PeticionEstadoCuenta): ReporteEstadoCuenta;
  /**
   * Arma el reporte en hoja carta para la vista previa, imprimir o el PDF.
   *
   * @param peticion - Reporte y filtros.
   * @returns Documento HTML.
   */
  html(peticion: PeticionReporte): string;
  /**
   * Exporta el reporte a Excel.
   *
   * @param peticion - Reporte y filtros.
   * @returns Contenido del archivo XLSX.
   */
  excel(peticion: PeticionReporte): Uint8Array;
  /**
   * Nombre de archivo propuesto, con el día del corte.
   *
   * @param peticion - Reporte y filtros.
   * @param extension - `pdf` o `xlsx`.
   * @returns Nombre, p. ej. `Cuentas por cobrar 2026-10-04.pdf`.
   */
  nombreArchivo(peticion: PeticionReporte, extension: 'pdf' | 'xlsx'): string;
}

/**
 * Dependencias del servicio de reportes.
 */
export interface DependenciasReportes {
  /** Datos del negocio (encabezado). */
  negocio: Pick<ServicioNegocio, 'obtener'>;
  /** Momento actual en ISO local con desfase (inyectable en las pruebas). */
  ahora?: () => string;
}

/**
 * Crea el servicio de reportes.
 *
 * @param db - Conexión abierta.
 * @param dependencias - Negocio y reloj.
 * @returns El servicio.
 */
export function crearServicioReportes(
  db: BaseDeDatos,
  dependencias: DependenciasReportes,
): ServicioReportes {
  const ahora = dependencias.ahora ?? (() => aIsoLocal());

  const inventario = (peticion: PeticionInventario): ReporteInventario => {
    const corte = ahora();
    const armado = armarInventario({
      productos: productosDeInventario(db),
      existencias: existenciasPorPar(db),
      bodegas: bodegasDeInventario(db),
      filtros: { ...peticion, texto: peticion.texto.trim() },
    });
    return { corte, ...armado };
  };

  const cartera = (peticion: PeticionCartera): ReporteCartera => {
    const corte = ahora();
    const { tipo, ...filtros } = peticion;
    const armado = armarCartera({
      documentos: documentosPendientes(db, tipo),
      terceros: tercerosDeCartera(db, tipo),
      saldosFavor: saldosFavorPorTercero(db, tipo),
      hoy: diaDeIso(corte),
      filtros,
    });
    return { tipo, corte, ...armado };
  };

  const estadoCuenta = (p: PeticionEstadoCuenta): ReporteEstadoCuenta => {
    validarPeriodo(p.desde, p.hasta);
    const cliente = p.tipo === 'cliente';
    const tercero = obtenerTercero(db, p.tipo, p.terceroCodigo);
    if (!tercero) {
      throw new ErrorDeNegocio(
        'NO_ENCONTRADO',
        `No existe el ${cliente ? 'cliente' : 'proveedor'} ${p.terceroCodigo}. Búsquelo por código o nombre.`,
      );
    }
    if (cliente && tercero.codigo === CODIGO_CONSUMIDOR_FINAL) {
      throw new ErrorDeNegocio(
        'VALIDACION',
        '«Consumidor final» no tiene estado de cuenta: sus ventas son de contado.',
      );
    }
    const armado = armarEstadoCuenta({
      tipo: p.tipo,
      desde: p.desde,
      hasta: p.hasta,
      ...documentosCuenta(db, p.tipo, tercero.codigo),
    });
    return {
      tipo: p.tipo,
      corte: ahora(),
      tercero: {
        codigo: tercero.codigo,
        nombre: tercero.nombre,
        tipoIdentificacion: tercero.tipoIdentificacion,
        numeroIdentificacion: tercero.numeroIdentificacion,
        celular: tercero.celular,
        direccion: [tercero.direccion, tercero.barrio].filter(Boolean).join(' '),
        tope: cliente ? tercero.topeCredito : null,
      },
      desde: p.desde,
      hasta: p.hasta,
      ...armado,
    };
  };

  /**
   * Describe en palabras los filtros del inventario (va en el reporte impreso y en Excel).
   *
   * @param p - Filtros.
   * @returns Texto de los filtros.
   */
  const filtrosInventario = (p: PeticionInventario): string => {
    const bodega =
      p.bodegaId === null
        ? 'Todas las bodegas'
        : `Bodega ${bodegasDeInventario(db).find((b) => b.id === p.bodegaId)?.nombre ?? p.bodegaId}`;
    const proveedor =
      p.proveedorCodigo === null
        ? 'todos los proveedores'
        : `proveedor ${p.proveedorCodigo} - ${tercerosDeCartera(db, 'proveedor').find((t) => t.codigo === p.proveedorCodigo)?.nombre ?? ''}`;
    return [
      bodega,
      proveedor,
      p.texto.trim() ? `producto «${p.texto.trim()}»` : '',
      p.mostrarSinExistencia ? 'incluye productos sin existencia' : '',
      p.incluirInactivos ? 'incluye inactivos' : '',
    ]
      .filter(Boolean)
      .join(' · ');
  };

  /**
   * Describe en palabras los filtros de la cartera.
   *
   * @param p - Tipo y filtros.
   * @returns Texto de los filtros.
   */
  const filtrosCartera = (p: PeticionCartera): string => {
    const cliente = p.tipo === 'cliente';
    const tercero =
      p.terceroCodigo === null
        ? cliente
          ? 'Todos los clientes'
          : 'Todos los proveedores'
        : `${cliente ? 'Cliente' : 'Proveedor'} ${p.terceroCodigo} - ${tercerosDeCartera(db, p.tipo).find((t) => t.codigo === p.terceroCodigo)?.nombre ?? ''}`;
    return [
      tercero,
      p.soloVencidas ? 'solo vencidas' : 'vencidas y por vencer',
      p.incluirSoloFavor ? 'incluye los que solo tienen saldo a favor' : '',
    ]
      .filter(Boolean)
      .join(' · ');
  };

  /**
   * Describe en palabras los filtros del historial.
   *
   * @param p - Filtros.
   * @returns Texto de los filtros.
   */
  const filtrosHistorial = (p: PeticionHistorial): string =>
    [
      `Del ${formatearFecha(p.desde)} al ${formatearFecha(p.hasta)}`,
      p.tipo === null
        ? 'todos los tipos'
        : (TIPOS_DOCUMENTO_HISTORIAL.find((t) => t.valor === p.tipo)?.etiqueta ?? p.tipo),
      p.accion === null ? 'todas las acciones' : `acción ${etiquetaAccion(p.accion)}`,
      p.texto.trim() ? `buscar «${p.texto.trim()}»` : '',
    ]
      .filter(Boolean)
      .join(' · ');

  /**
   * Título del reporte (pie de página y nombre de archivo).
   *
   * @param peticion - Reporte y filtros.
   * @returns Título.
   */
  const titulo = (peticion: PeticionReporte): string => {
    switch (peticion.reporte) {
      case 'inventario':
        return 'Inventario valorizado';
      case 'cartera':
        return TITULOS_CARTERA[peticion.filtros.tipo];
      case 'kardex':
        return `Kardex ${peticion.filtros.productoCodigo}`;
      case 'historial':
        return 'Historial de cambios';
      case 'estado-cuenta':
        return 'Estado de cuenta';
      case 'cierre-caja':
        return `Cierre de caja ${peticion.filtros.numero}`;
    }
  };

  const visores = crearServicioVisores(db, { ahora });

  return {
    ...visores,
    inventario,
    cartera,
    estadoCuenta,
    html(peticion) {
      const negocio = dependencias.negocio.obtener();
      switch (peticion.reporte) {
        case 'inventario':
          return reporteInventarioHtml({
            negocio,
            reporte: inventario(peticion.filtros),
            filtros: filtrosInventario(peticion.filtros),
          });
        case 'cartera':
          return reporteCarteraHtml({
            negocio,
            reporte: cartera(peticion.filtros),
            filtros: filtrosCartera(peticion.filtros),
          });
        case 'kardex':
          return reporteKardexHtml({ negocio, reporte: visores.kardex(peticion.filtros) });
        case 'historial':
          return reporteHistorialHtml({
            negocio,
            reporte: visores.historial(peticion.filtros),
            filtros: filtrosHistorial(peticion.filtros),
          });
        case 'estado-cuenta':
          return reporteEstadoCuentaHtml({ negocio, reporte: estadoCuenta(peticion.filtros) });
        case 'cierre-caja':
          return reporteCierreCajaHtml({
            negocio,
            cierre: leerCierreGuardado(db, peticion.filtros.numero),
          });
      }
    },
    excel(peticion) {
      switch (peticion.reporte) {
        case 'inventario':
          return inventarioXlsx(inventario(peticion.filtros), filtrosInventario(peticion.filtros));
        case 'cartera':
          return carteraXlsx(
            cartera(peticion.filtros),
            titulo(peticion),
            filtrosCartera(peticion.filtros),
          );
        case 'kardex': {
          const kardex = visores.kardex(peticion.filtros);
          return kardexXlsx(kardex, filtrosKardex(kardex));
        }
        default:
          throw new ErrorDeNegocio(
            'VALIDACION',
            `El reporte «${titulo(peticion)}» no se exporta a Excel; use «Imprimir o guardar PDF».`,
          );
      }
    },
    nombreArchivo(peticion, extension) {
      if (peticion.reporte === 'estado-cuenta') {
        const { tipo, terceroCodigo, hasta } = peticion.filtros;
        const nombre = obtenerTercero(db, tipo, terceroCodigo)?.nombre ?? String(terceroCodigo);
        return nombreArchivoEstadoCuenta(nombre, hasta);
      }
      if (peticion.reporte === 'cierre-caja') {
        const cierre = leerCierreGuardado(db, peticion.filtros.numero);
        return `${titulo(peticion)} ${diaDeIso(cierre.hasta)}.${extension}`;
      }
      return `${titulo(peticion)} ${diaDeIso(ahora())}.${extension}`;
    },
  };
}
